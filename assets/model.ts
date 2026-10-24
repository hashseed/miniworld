// One-model review renders (spec milestone 2, section 13.4):
//   npm run model -- <asset-id> [round] [--clip=walk --t=0.3] [--only=views,with-people]
// Writes assets/review/<id>/r<round>-<view>.png and prints the paths. Uses the
// dev server on 8800 if it answers, otherwise starts a throwaway one.

import { chromium } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const flag = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const [id, round = '1'] = args.filter((a) => !a.startsWith('--'));
if (!id) {
  console.error(
    'usage: npm run model -- <asset-id> [round] [--clip=c --t=s] [--only=views,with-people]',
  );
  process.exit(1);
}
const kinds = (flag('only') ?? 'views,with-people').split(',');
const extra = ['clip', 't'].flatMap((k) => (flag(k) ? [`${k}=${flag(k)}`] : [])).join('&');

async function up(url: string): Promise<boolean> {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

let base = process.env.SHEET_URL ?? 'http://localhost:8800/asset-sheet.html';
let server: ChildProcess | undefined;
if (!(await up(base))) {
  base = 'http://localhost:8801/asset-sheet.html';
  server = spawn(
    'npx',
    ['vite', '--config', 'app/vite.config.ts', '--port', '8801', '--strictPort'],
    {
      stdio: 'ignore',
    },
  );
  for (let i = 0; i < 60 && !(await up(base)); i++) await new Promise((r) => setTimeout(r, 500));
}

const dir = join('assets/review', id);
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? undefined,
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});
const page = await browser.newPage({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
});
page.on('pageerror', (e) => console.error(e));
for (const kind of kinds) {
  await page.goto(`${base}?sheet=${kind}&id=${id}${extra ? `&${extra}` : ''}`);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 60_000 });
  const file = join(dir, `r${round}-${kind}.png`);
  await page.screenshot({ path: file });
  console.log(file);
}
await browser.close();
server?.kill();
