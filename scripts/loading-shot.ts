// Takes the still picture of the small globe that the loading screen shows until the globe
// itself is drawn (spec milestone 1, section 8.6), into app/public/loading-globe.jpg.
// Run with the dev server up: `npm run loading-shot`, or with `CDP_URL=http://host:9222`.

import { chromium } from '@playwright/test';

const url = process.env.SHOT_URL ?? 'http://localhost:8800/?introHold';
// A browser with a GPU over the DevTools protocol (CDP_URL, such as Chrome started with
// --remote-debugging-port), in a fresh context so its saved views are untouched; else a
// local headless Chromium with the software renderer.
const browser = process.env.CDP_URL
  ? await chromium.connectOverCDP(process.env.CDP_URL)
  : await chromium.launch({
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
      ],
    });
// Twice the pixels of the drawn globe, so it is sharp on high-density screens.
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();
await page.goto(url);
await page.waitForFunction(
  () =>
    (globalThis as unknown as { __miniworld?: { globe: { drawnTiles: number } } }).__miniworld
      ?.globe.drawnTiles,
  null,
  { timeout: 120_000 },
);
// The tiles of the small globe settle.
await page.waitForTimeout(15_000);
const box = await page.evaluate(() => {
  const img = document.querySelector('.loading-globe') as HTMLElement;
  const r = img.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
});
await page.screenshot({
  path: 'app/public/loading-globe.jpg',
  type: 'jpeg',
  quality: 85,
  clip: box,
});
await context.close();
await browser.close().catch(() => {});
console.log('app/public/loading-globe.jpg', box);
