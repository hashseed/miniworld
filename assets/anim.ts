// Animation review round (spec milestone 2, section 13.5):
//   npm run anim -- <subject> <round> [seq] [n]
// e.g. npm run anim -- animal-mammoth 1 walk:0-1.4,run:0-1 10
// Renders a views-by-frames grid of the clip(s) with the dev server (started
// here if nothing answers on SHEET_URL) and writes assets/review/<id>/a<round>.png.

import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [subject = 'animal-mammoth', round = '1', seq = 'walk:0-1', n = '8'] = process.argv.slice(2);
const full = subject.includes(':')
  ? subject
  : subject.startsWith('animal-')
    ? subject
    : `person:${subject}`;
const id = full.replace(/[:]/g, '-');
const origin = process.env.SHEET_ORIGIN ?? 'http://localhost:8800';

let server: ReturnType<typeof spawn> | undefined;
const up = await fetch(origin).then(
  () => true,
  () => false,
);
if (!up) {
  server = spawn('npx', ['vite', '--config', 'app/vite.config.ts', '--port', '8800'], {
    stdio: 'ignore',
  });
  for (
    let i = 0;
    i < 60 &&
    !(await fetch(origin).then(
      () => true,
      () => false,
    ));
    i++
  )
    await new Promise((r) => setTimeout(r, 500));
}

const out = join('assets/review', id);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM,
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});
const page = await browser.newPage({
  viewport: { width: 1800, height: 900 },
  deviceScaleFactor: 1,
});
page.on('pageerror', (e) => console.error(e));
const q = new URLSearchParams({ sheet: 'anim', subject: full, seq, n });
await page.goto(`${origin}/asset-sheet.html?${q}`);
await page.waitForSelector('body[data-ready="1"]', { timeout: 60_000 });
const file = join(out, `a${round}.png`);
await page.screenshot({ path: file });
console.log(file, await page.title());
await browser.close();
server?.kill();
