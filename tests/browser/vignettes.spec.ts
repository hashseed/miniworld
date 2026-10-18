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
  stages: {
    id: string;
    lat: number;
    lon: number;
    actor?: [number, number];
    heightPx?: number;
    phase?: number;
    cast: number[];
  }[];
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
        JSON.stringify({
          language: 'en',
          slowWhenZoomed: false,
          lensHintSeen: true,
        }),
      );
      sessionStorage.setItem('miniworld.test.started', '1');
    }
  });
});

test('the mammoth hunt is visible from orbit, flies down and moves while playing', async ({
  page,
}) => {
  await page.goto('/');
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
  // Section 5.1: from orbit the figures are still at least 22 pixels tall.
  // A stage left of the card, which opens on the right on desktop.
  const { width, height } = page.viewportSize()!;
  const clear = (s: Debug['stages'][number]) =>
    !!s.actor &&
    s.actor[0] > 40 &&
    s.actor[0] < Math.min(800, width - 40) &&
    s.actor[1] > 120 &&
    s.actor[1] < height - 320;
  await expect.poll(async () => (await hunt(page)).stages.some(clear)).toBe(true);
  const target = (await hunt(page)).stages.find(clear)!;
  expect(target.heightPx!).toBeGreaterThanOrEqual(21.5);

  // Tapping a hunter opens the card; double-clicking flies down to the stage.
  const [x, y] = target.actor!;
  await page.mouse.click(x, y);
  await expect(page.getByRole('dialog', { name: 'Mammoth hunt' })).toBeVisible();
  await expect(page.getByText(en['vignette.learnMore']!)).toBeVisible();
  // On phones the card can cover the stage; close it first.
  await page.getByRole('button', { name: en['dialog.close'] }).click();
  await page.mouse.dblclick(x, y);
  await expect
    .poll(async () => {
      const h = await hunt(page);
      return Math.abs(h.camera.lat - target.lat) + Math.abs(h.camera.lon - target.lon);
    })
    .toBeLessThan(0.05);

  // Playing slowly, so the date stays inside this period: the hunters move.
  const clock = (state: string, speedLog2: number) =>
    page.evaluate(
      ([state, speedLog2]) => {
        const c = (
          globalThis as unknown as {
            __miniworld: {
              clock: { setPlayState(s: string): void; setSpeedLog2(v: number): void };
            };
          }
        ).__miniworld.clock;
        c.setSpeedLog2(speedLog2);
        c.setPlayState(state);
      },
      [state, speedLog2] as const,
    );
  const cast = async () => (await hunt(page)).stages.find((s) => s.id === target.id)!.phase;
  const a = await cast();
  await clock('playing', -6);
  await expect.poll(cast).not.toBe(a);

  // Paused: they stand still.
  await clock('paused', -6);
  await page.waitForTimeout(300);
  const b = await cast();
  await page.waitForTimeout(1500);
  expect(await cast()).toBe(b);
});
