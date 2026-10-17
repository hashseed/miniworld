// Browser tests of milestone 1 (spec section 13), at desktop and phone sizes.

import { expect, test, type Page } from '@playwright/test';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const en = JSON.parse(readFileSync(`${root}/app/messages/en.json`, 'utf8')) as Record<
  string,
  string
>;
const de = JSON.parse(readFileSync(`${root}/app/messages/de.json`, 'utf8')) as Record<
  string,
  string
>;

/** Opens the app without the first-start benchmark and waits for the first view. */
async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`/?nobench${query}`);
  await expect(page.locator('.overlay')).toHaveCount(0, { timeout: 60_000 });
}

function world(page: Page) {
  return page.evaluate(() => {
    const m = (
      globalThis as unknown as {
        __miniworld: {
          clock: { day: number; playState: string };
          globe: { material: { uniforms: { seaLevel: { value: number } } } };
          controller: { state: { lat: number; lon: number } };
        };
      }
    ).__miniworld;
    return {
      day: m.clock.day,
      playState: m.clock.playState,
      seaLevel: m.globe.material.uniforms.seaLevel.value,
      lat: m.controller.state.lat,
      lon: m.controller.state.lon,
    };
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // Start every test as a first visit in English.
    if (!sessionStorage.getItem('miniworld.test.started')) {
      localStorage.clear();
      localStorage.setItem(
        'miniworld.settings.v1',
        JSON.stringify({
          language: 'en',
          quality: 'low',
          alwaysDay: false,
          trueTimeScale: false,
          slowWhenZoomed: true,
          showStats: false,
        }),
      );
      sessionStorage.setItem('miniworld.test.started', '1');
    }
  });
});

test('first view opens at 50,000 BCE within the data budget', async ({ page }) => {
  // The dev server sends uncompressed files; count the Brotli size of each data file.
  let dataBytes = 0;
  page.on('response', (res) => {
    const path = new URL(res.url()).pathname;
    if (!path.startsWith('/data/')) return;
    try {
      dataBytes += statSync(`${root}/app/public${path}.br`).size;
    } catch {
      dataBytes += statSync(`${root}/app/public${path}`).size;
    }
  });
  await open(page);
  await expect(page.getByTestId('date')).toHaveText('50,000 BCE');
  // Section 10.6: manifest and index 200 KB, terrain 1.5 MB, ice 200 KB.
  expect(dataBytes).toBeLessThan(1.9 * 1024 * 1024);
});

test('language switch changes every string without a reload', async ({ page }) => {
  await open(page);
  const before = await world(page);
  await page.getByRole('button', { name: en['menu.settings'] }).click();
  await page.locator('select').first().selectOption('de');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(page.getByTestId('date')).toHaveText('50.000 v. Chr.');
  await expect(page).toHaveTitle(de['app.title']!);
  const text = await page.evaluate(() => {
    const labels = [...document.querySelectorAll('[aria-label],[title]')].map(
      (e) => `${e.getAttribute('aria-label') ?? ''} ${e.getAttribute('title') ?? ''}`,
    );
    return `${document.body.innerText}\n${labels.join('\n')}`;
  });
  for (const [key, value] of Object.entries(en)) {
    if (value === de[key] || value.includes('{')) continue;
    expect(text, `English text of ${key} still visible`).not.toContain(value);
  }
  const after = await world(page);
  expect(after.day).toBe(before.day);
  expect(after.playState).toBe(before.playState);
});

test('settings and bookmarks survive a reload', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: en['menu.settings'] }).click();
  await page.getByLabel(en['settings.alwaysDay']!).check();
  await page.getByRole('button', { name: en['dialog.close'] }).click();
  await page.getByRole('button', { name: en['menu.bookmarks'] }).click();
  await page.getByRole('button', { name: en['bookmarks.add'] }).click();
  await expect(page.locator('.bookmark')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.overlay')).toHaveCount(0, { timeout: 60_000 });
  await page.getByRole('button', { name: en['menu.bookmarks'] }).click();
  await expect(page.locator('.bookmark')).toHaveCount(1);
  await page.getByRole('button', { name: en['dialog.close'] }).click();
  await page.getByRole('button', { name: en['menu.settings'] }).click();
  await expect(page.getByLabel(en['settings.alwaysDay']!)).toBeChecked();
});

test('scrubbing the timeline changes the date and the sea level', async ({ page }) => {
  await open(page);
  const before = await world(page);
  const box = (await page.getByTestId('timeline').boundingBox())!;
  // Drag along the ruler at the top of the timeline.
  await page.mouse.move(box.x + 30, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.25, box.y + 8, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await world(page)).day).toBeGreaterThan(before.day);
  await expect.poll(async () => (await world(page)).seaLevel).not.toBe(before.seaLevel);
});

test('keyboard plays history and moves the camera', async ({ page }) => {
  await open(page);
  await page.locator('#globe').focus();
  await page.keyboard.press('Space');
  await expect.poll(async () => (await world(page)).playState).toBe('playing');
  await page.keyboard.press('Space');
  await expect.poll(async () => (await world(page)).playState).toBe('historyPaused');
  const before = await world(page);
  // Hold the key until the camera moves: frames are slow on software rendering.
  await page.keyboard.down('ArrowUp');
  await expect.poll(async () => (await world(page)).lat).not.toBe(before.lat);
  await page.keyboard.up('ArrowUp');
});
