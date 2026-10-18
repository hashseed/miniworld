// Keeps the staging checkout on the latest main and its dev server on port
// 8800 running (spec section 11).
//
// Usage, from the staging checkout, left running in the background:
//   nohup npm run staging > ../staging.log 2>&1 &
//
// About once a minute (MINIWORLD_STAGING_INTERVAL seconds) it fetches main,
// fast-forwards the checkout to it, runs npm ci only when package-lock.json
// changed, rebuilds the content only when the data build's inputs changed
// (the hash of data/build/fixture-key.ts), and restarts the dev server. It
// never discards local work and never touches another port. When this script
// itself changes, it hands over to the new version. MINIWORLD_STAGING_PORT
// changes the port, for testing this script only.

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { join, resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const PORT = Number(process.env.MINIWORLD_STAGING_PORT ?? 8800);
const BUILD_ARGS = ['--max-level', '5'];
const INTERVAL_MS = Number(process.env.MINIWORLD_STAGING_INTERVAL ?? 60) * 1000;
const FETCH_TIMEOUT_MS = 90_000;
const STOP_TIMEOUT_MS = 10_000;
const SELF = 'scripts/staging.ts';

let lastMessage = '';
function log(message: string, repeat = true): void {
  if (!repeat && message === lastMessage) return;
  lastMessage = message;
  console.log(`staging ${new Date().toISOString()}: ${message}`);
}

function git(args: string[], timeout = 30_000): { ok: boolean; out: string; err: string } {
  const r = spawnSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  return { ok: r.status === 0, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() };
}

let task: ChildProcess | null = null;

/** Runs a command with its output shown; true when it succeeded. */
function run(cmd: string, args: string[]): Promise<boolean> {
  log(`${cmd} ${args.join(' ')}`);
  // Its own process group, so stopping the watcher stops all of it.
  const child = spawn(cmd, args, { cwd: ROOT, stdio: 'inherit', detached: true });
  task = child;
  return new Promise((done) =>
    child.once('exit', (code) => {
      task = null;
      done(code === 0);
    }),
  );
}

// The state lives in the git folder, so no checkout, clean or npm ci removes it.
const STATE = join(ROOT, git(['rev-parse', '--git-dir']).out || '.git', 'miniworld-staging.json');
type State = { dataKey?: string; failedKey?: string };
function readState(): State {
  try {
    return JSON.parse(readFileSync(STATE, 'utf8')) as State;
  } catch {
    return {};
  }
}
function writeState(state: State): void {
  writeFileSync(STATE, JSON.stringify(state));
}

/** Fetches main; the credential helper is tried last, as it can stall. */
function fetchMain(): boolean {
  if (git(['-c', 'credential.helper=', 'fetch', '-q', 'origin', 'main'], FETCH_TIMEOUT_MS).ok)
    return true;
  return git(['fetch', '-q', 'origin', 'main'], FETCH_TIMEOUT_MS).ok;
}

/** Brings the checkout to origin/main; the files that changed, or null if it was left alone. */
function syncCheckout(): string[] | null {
  const target = git(['rev-parse', 'origin/main']).out;
  const head = git(['rev-parse', 'HEAD']).out;
  const branch = git(['symbolic-ref', '--short', '-q', 'HEAD']).out;
  if (branch === 'main' && head === target) return [];
  if (git(['status', '--porcelain', '--untracked-files=no']).out !== '') {
    log('the checkout has uncommitted changes; leaving it as it is', false);
    return null;
  }
  if (branch !== 'main') {
    const main = git(['rev-parse', '-q', '--verify', 'refs/heads/main']);
    const switched = main.ok
      ? git(['checkout', '-q', 'main'])
      : git(['checkout', '-q', '-b', 'main', 'origin/main']);
    if (!switched.ok) {
      log(`could not switch from ${branch || 'a detached HEAD'} to main: ${switched.err}`, false);
      return null;
    }
    log(`switched from ${branch || 'a detached HEAD'} to main`);
  }
  const merged = git(['merge', '-q', '--ff-only', 'origin/main']);
  if (!merged.ok) {
    log('the local main has diverged from origin/main; leaving it as it is', false);
    return null;
  }
  log(`now at ${git(['log', '-1', '--format=%h %s']).out}`);
  return git(['diff', '--name-only', head, 'HEAD']).out.split('\n').filter(Boolean);
}

function dataKey(): string {
  const r = spawnSync('node', ['data/build/fixture-key.ts', ...BUILD_ARGS], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return r.status === 0 ? r.stdout.trim() : '';
}

function portBusy(port: number): Promise<boolean> {
  return new Promise((done) => {
    const socket = createConnection({ port, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.destroy();
      done(true);
    });
    socket.once('error', () => done(false));
  });
}

let server: ChildProcess | null = null;

function startServer(): void {
  log(`starting the dev server on port ${PORT}`);
  const child = spawn('npm', ['run', 'dev'], {
    cwd: ROOT,
    stdio: 'inherit',
    detached: true,
    env: { ...process.env, MINIWORLD_PORT: String(PORT) },
  });
  child.once('exit', (code) => {
    if (server === child) {
      server = null;
      log(`the dev server stopped (exit ${code}); starting it again on the next round`);
    }
  });
  server = child;
}

async function stopServer(): Promise<void> {
  const child = server;
  if (!child || child.exitCode !== null) return;
  server = null;
  const exited = new Promise<void>((done) => child.once('exit', () => done()));
  const signal = (s: NodeJS.Signals) => {
    try {
      process.kill(-child.pid!, s);
    } catch {
      // Already gone.
    }
  };
  signal('SIGTERM');
  const timer = setTimeout(() => signal('SIGKILL'), STOP_TIMEOUT_MS);
  await exited;
  clearTimeout(timer);
  // npm can exit before the server it started has let go of the port.
  for (let t = 0; t < STOP_TIMEOUT_MS && (await portBusy(PORT)); t += 250)
    await new Promise((done) => setTimeout(done, 250));
}

let handedOver = false;

/** Restarts this script from the new version of itself. */
function handOver(): void {
  handedOver = true;
  log(`${SELF} changed; handing over to the new version`);
  const child = spawn(process.execPath, [join(ROOT, SELF)], { cwd: ROOT, stdio: 'inherit' });
  for (const s of ['SIGINT', 'SIGTERM'] as const) process.on(s, () => child.kill(s));
  child.once('exit', (code) => process.exit(code ?? 0));
}

async function round(): Promise<void> {
  let changed: string[] = [];
  if (fetchMain()) changed = syncCheckout() ?? [];
  else log('could not fetch main from GitHub; trying again on the next round', false);

  let restart = changed.length > 0;
  if (changed.includes('package-lock.json') || !existsSync(join(ROOT, 'node_modules'))) {
    await stopServer();
    if (!(await run('npm', ['ci']))) log('npm ci failed');
    restart = true;
  }
  const state = readState();
  const key = dataKey();
  const built = existsSync(join(ROOT, 'app/public/data'));
  if (key && (key !== state.dataKey || !built) && key !== state.failedKey) {
    await stopServer();
    if (await run('npm', ['run', 'build-data', '--', ...BUILD_ARGS])) writeState({ dataKey: key });
    else {
      writeState({ ...state, failedKey: key });
      log('the data build failed; it runs again when its inputs change');
    }
    restart = true;
  }
  if (changed.includes(SELF)) {
    await stopServer();
    handOver();
    return;
  }
  if (restart) await stopServer();
  if (!server) {
    if (await portBusy(PORT))
      log(`port ${PORT} is used by another server; waiting until it is free`, false);
    else startServer();
  }
}

async function main(): Promise<void> {
  for (const s of ['SIGINT', 'SIGTERM'] as const)
    process.on(s, () => {
      if (handedOver) return;
      if (task) process.kill(-task.pid!, s);
      void stopServer().then(() => process.exit(0));
    });
  log(`keeping ${ROOT} on origin/main, serving it on port ${PORT}`);
  while (!handedOver) {
    try {
      await round();
    } catch (e) {
      log(`round failed: ${(e as Error).message}`);
    }
    if (!handedOver) await new Promise((done) => setTimeout(done, INTERVAL_MS));
  }
}

await main();
