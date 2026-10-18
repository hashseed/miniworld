// Runs the tests for a commit in a pool of git worktrees, so that test runs
// never touch the staging checkout that serves http://localhost:8800 (spec
// milestone 1, section 2.5).
//
// Usage:
//   node scripts/pool.ts <ref> [check|browser|all] [playwright arguments...]
//   node scripts/pool.ts --prune
//
// The pool lives next to the staging checkout, in ../miniworld-pool, or in
// MINIWORLD_POOL. Each run takes a free slot (slot-1 … slot-N, N from
// MINIWORLD_POOL_SIZE, default 2) under a lock, checks out the commit there,
// installs dependencies only when package-lock.json changed, restores the
// fixture data from a cache shared by all slots (built once per input hash),
// runs the tests with the slot's own dev server port 8810 + n, writes the
// logs to <slot>/.pool/last/, and frees the slot. Worktrees stay for reuse.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const FIXTURE_ARGS = ['--fixture', '--max-level', '4'];
const BASE_PORT = 8810;
const KEEP_CACHES = 3;
const TASKS = ['check', 'browser', 'all'] as const;
type Task = (typeof TASKS)[number];

function fail(message: string): never {
  console.error(`pool: ${message}`);
  process.exit(2);
}

function log(message: string): void {
  console.log(`pool: ${message}`);
}

/** Runs a command and returns its trimmed output; exits on failure. */
function output(cmd: string, args: string[], cwd: string): string {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) fail(`${cmd} ${args.join(' ')} failed:\n${r.stderr}`);
  return r.stdout.trim();
}

/** Runs a command with its output shown and copied to a log file. */
function run(cmd: string, args: string[], cwd: string, logFile: string, env = {}): boolean {
  log(`${cmd} ${args.join(' ')}`);
  const r = spawnSync(
    'bash',
    ['-o', 'pipefail', '-c', '"$@" 2>&1 | tee -a "$POOL_LOG"', '--', cmd, ...args],
    {
      cwd,
      stdio: 'inherit',
      env: { ...process.env, ...env, POOL_LOG: logFile },
    },
  );
  return r.status === 0;
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

// The staging repository is the one whose .git all worktrees share.
const repo = dirname(
  output('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], process.cwd()),
);
const pool = resolve(process.env.MINIWORLD_POOL ?? join(repo, '..', 'miniworld-pool'));
const size = Number(process.env.MINIWORLD_POOL_SIZE ?? 2);
const cacheRoot = join(pool, 'cache');

if (process.argv[2] === '--prune') {
  for (let n = 1; n <= size; n++) {
    const slot = join(pool, `slot-${n}`);
    if (existsSync(`${slot}.lock`)) {
      log(`slot-${n} is in use, kept`);
      continue;
    }
    if (existsSync(slot)) output('git', ['worktree', 'remove', '--force', slot], repo);
  }
  output('git', ['worktree', 'prune'], repo);
  if (existsSync(cacheRoot)) {
    const caches = readdirSync(cacheRoot)
      .map((name) => join(cacheRoot, name))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    for (const old of caches.slice(KEEP_CACHES)) rmSync(old, { recursive: true, force: true });
  }
  log('pruned');
  process.exit(0);
}

const [ref, taskArg = 'all', ...extra] = process.argv.slice(2);
if (!ref) fail('usage: node scripts/pool.ts <ref> [check|browser|all] [playwright arguments...]');
if (!TASKS.includes(taskArg as Task)) fail(`unknown task ${taskArg}; use ${TASKS.join(', ')}`);
const task = taskArg as Task;

// Resolve the commit in the staging repository, fetching it if it is not there.
let sha = spawnSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], {
  cwd: repo,
  encoding: 'utf8',
}).stdout.trim();
if (!sha) {
  output('git', ['fetch', '--quiet', 'origin', ref], repo);
  sha = output('git', ['rev-parse', 'FETCH_HEAD^{commit}'], repo);
}

/** The pid in a lock, or 0 while the run that just took it has not written it yet. */
function lockOwner(lock: string): number {
  try {
    return Number(readFileSync(join(lock, 'pid'), 'utf8'));
  } catch {
    return 0;
  }
}

function isRunning(pid: number): boolean {
  try {
    return process.kill(pid, 0);
  } catch {
    return false;
  }
}

/** Takes a free slot: a lock directory created atomically, holding our pid. */
function acquire(): number {
  mkdirSync(pool, { recursive: true });
  for (;;) {
    for (let n = 1; n <= size; n++) {
      const lock = join(pool, `slot-${n}.lock`);
      try {
        mkdirSync(lock);
        writeFileSync(join(lock, 'pid'), String(process.pid));
        return n;
      } catch {
        // Taken; free it if the run that holds it is gone.
        const pid = lockOwner(lock);
        const alive = pid === 0 || isRunning(pid);
        if (!alive) rmSync(lock, { recursive: true, force: true });
      }
    }
    log('all slots busy, waiting');
    spawnSync('sleep', ['5']);
  }
}

const n = acquire();
const lock = join(pool, `slot-${n}.lock`);
const release = () => rmSync(lock, { recursive: true, force: true });
process.on('exit', release);
process.on('SIGINT', () => process.exit(130));
process.on('SIGTERM', () => process.exit(143));

const slot = join(pool, `slot-${n}`);
const port = BASE_PORT + n;
const state = join(slot, '.pool');
const last = join(state, 'last');
log(`slot-${n} (port ${port}) for ${ref} at ${sha.slice(0, 12)}`);

// Check out the commit; keep dependencies, fixture data and the lens cache.
if (!existsSync(slot)) {
  output('git', ['worktree', 'add', '--detach', slot, sha], repo);
} else {
  output('git', ['checkout', '--quiet', '--detach', '--force', sha], slot);
  output(
    'git',
    [
      'clean',
      '-fdxq',
      '-e',
      'node_modules',
      '-e',
      'app/public/data',
      '-e',
      'data/out',
      '-e',
      '.pool',
    ],
    slot,
  );
}
rmSync(last, { recursive: true, force: true });
mkdirSync(last, { recursive: true });
const logFile = (name: string) => join(last, `${name}.log`);

// Dependencies, when the lock file changed since this slot's last install.
const lockHash = sha256(join(slot, 'package-lock.json'));
const lockStamp = join(state, 'package-lock.sha256');
if (!existsSync(lockStamp) || readFileSync(lockStamp, 'utf8') !== lockHash) {
  if (!run('npm', ['ci', '--no-audit', '--no-fund'], slot, logFile('install')))
    fail('npm ci failed');
  writeFileSync(lockStamp, lockHash);
}

let ok = true;
if (task === 'check' || task === 'all') {
  ok = run('npm', ['run', 'check'], slot, logFile('check')) && ok;
}

if (task === 'browser' || task === 'all') {
  // Fixture data from the shared cache, built once per input hash.
  const key = output('node', ['data/build/fixture-key.ts', ...FIXTURE_ARGS], slot);
  const cached = join(cacheRoot, key);
  const data = join(slot, 'app/public/data');
  if (existsSync(cached)) {
    log(`fixture data ${key} from the cache`);
    rmSync(data, { recursive: true, force: true });
    cpSync(cached, data, { recursive: true });
  } else {
    rmSync(data, { recursive: true, force: true });
    if (!run('npm', ['run', 'build-data', '--', ...FIXTURE_ARGS], slot, logFile('build-data')))
      fail('fixture data build failed');
    const tmp = `${cached}.${process.pid}`;
    cpSync(data, tmp, { recursive: true });
    try {
      renameSync(tmp, cached);
    } catch {
      rmSync(tmp, { recursive: true, force: true }); // another slot cached it first
    }
  }
  ok =
    run(
      'npx',
      ['playwright', 'test', '--output', join(last, 'test-results'), ...extra],
      slot,
      logFile('browser'),
      {
        MINIWORLD_PORT: String(port),
        PLAYWRIGHT_HTML_OUTPUT_DIR: join(last, 'playwright-report'),
      },
    ) && ok;
}

log(`${ok ? 'passed' : 'FAILED'}; logs in ${last}`);
process.exit(ok ? 0 : 1);
