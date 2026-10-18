// Browser test of the mammoth hunt (spec milestone 2, section 18.7).

import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const en = JSON.parse(readFileSync(`${root}/app/messages/en.json`, 'utf8')) as Record<
  string,
  string
>;

interface Debug {
  entries: { id: string; fromDay: number; toDay: number }[];
  stages: { id: string; lat: number; lon: number; marker?: [number, number]; cast: number[] }[];
}

function hunt(page: Page) {
  return page.evaluate(() => {
    const m = (
      globalThis as unknown as {
        __miniworld: {
          vignettes: { debug(): Debug };
          controller: { state: { lat: number; lon: number; altitudeKm: number } };
        };
      }
    ).__miniworld;
    return { ...m.vignettes.debug(), camera: { ...m.controller.state } };
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('miniworld.test.started')) {
      localStorage.clear();
      localStorage.setItem(
        'miniworld.settings.v1',
        JSON.stringify({ language: 'en', quality: 'low', slowWhenZoomed: false }),
      );
      sessionStorage.setItem('miniworld.test.started', '1');
    }
  });
});

test('the mammoth hunt shows a marker, flies down and moves with the life clock', async ({
  page,
}) => {
  await page.goto('/?nobench');
  await expect(page.locator('.overlay')).toHaveCount(0, { timeout: 60_000 });

  // A fixed day around 30,000 BCE, looking at Europe from orbit.
  await page.evaluate(() => {
    const m = (
      globalThis as unknown as {
        __miniworld: {
          vignettes: { debug(): Debug };
          clock: { setDay(day: number): void };
          controller: { state: object };
        };
      }
    ).__miniworld;
    const entry = m.vignettes.debug().entries.find((e) => e.id === 'mammoth-hunt')!;
    m.clock.setDay(entry.fromDay + Math.floor((entry.toDay - entry.fromDay) * 0.4));
    m.controller.state = { ...m.controller.state, lat: 50, lon: 25, altitudeKm: 6000 };
  });
  await expect.poll(async () => (await hunt(page)).stages.length).toBe(2);
  await expect.poll(async () => (await hunt(page)).stages.some((s) => s.marker)).toBe(true);

  // Tapping the marker opens the card; double-clicking it flies down to the stage.
  const target = (await hunt(page)).stages.find((s) => s.marker)!;
  const [x, y] = target.marker!;
  await page.mouse.click(x, y);
  await expect(page.getByRole('dialog', { name: 'Mammoth hunt' })).toBeVisible();
  await expect(page.getByText(en['vignette.learnMore']!)).toBeVisible();
  await page.mouse.dblclick(x, y);
  await expect
    .poll(async () => {
      const h = await hunt(page);
      return Math.abs(h.camera.lat - target.lat) + Math.abs(h.camera.lon - target.lon);
    })
    .toBeLessThan(0.05);

  // History paused (the start state): the hunters keep moving.
  const cast = async () => (await hunt(page)).stages.find((s) => s.id === target.id)!.cast;
  const a = await cast();
  await expect.poll(async () => JSON.stringify(await cast())).not.toBe(JSON.stringify(a));

  // Frozen: they stand still.
  await page.evaluate(() =>
    (
      globalThis as unknown as { __miniworld: { clock: { setPlayState(s: string): void } } }
    ).__miniworld.clock.setPlayState('frozen'),
  );
  await page.waitForTimeout(300);
  const b = await cast();
  await page.waitForTimeout(1500);
  expect(await cast()).toEqual(b);
});
