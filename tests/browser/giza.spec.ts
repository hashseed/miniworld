// Browser test of the pyramids of Giza (spec giza.md, section 11.6).

import { expect, test, type Page } from '@playwright/test';

interface Part {
  id: string;
  key: string;
  screen?: [number, number];
  kmPerM: number;
}
interface Stage {
  id: string;
  actor?: [number, number];
  cast: number[];
}
interface Entry {
  id: string;
  fromDay: number;
  toDay: number;
}

function state(page: Page) {
  return page.evaluate(() => {
    const m = (
      globalThis as unknown as {
        __miniworld: {
          landmarks: { debug(): Part[] };
          vignettes: { debug(): { entries: Entry[]; stages: Stage[] } };
        };
      }
    ).__miniworld;
    return { parts: m.landmarks.debug(), ...m.vignettes.debug() };
  });
}

/** Sets the day and looks down at Giza from an altitude. */
function look(page: Page, pick: 'building' | 'later', altitudeKm: number) {
  return page.evaluate(
    ([pick, altitudeKm]) => {
      const m = (
        globalThis as unknown as {
          __miniworld: {
            vignettes: { debug(): { entries: Entry[] } };
            clock: { setDay(day: number): void };
            controller: { state: object };
          };
        }
      ).__miniworld;
      const khufu = m.vignettes.debug().entries.find((e) => e.id === 'khufu-pyramid-building')!;
      // Halfway through the Great Pyramid's build, or 1,500 years after it.
      const day =
        pick === 'building'
          ? Math.floor((khufu.fromDay + khufu.toDay) / 2)
          : khufu.toDay + 1500 * 365;
      m.clock.setDay(day);
      m.controller.state = { ...m.controller.state, lat: 29.9, lon: 30.6, altitudeKm };
    },
    [pick, altitudeKm] as const,
  );
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('miniworld.test.started')) {
      localStorage.clear();
      localStorage.setItem(
        'miniworld.settings.v1',
        JSON.stringify({ language: 'en', slowWhenZoomed: false, lensHintSeen: true }),
      );
      sessionStorage.setItem('miniworld.test.started', '1');
    }
  });
});

test('the Great Pyramid rises with its crew, then stands and opens its card', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.overlay')).toHaveCount(0, { timeout: 60_000 });

  // While it is built: the rising pyramid, its ramp and the building crew at Giza.
  await look(page, 'building', 1500);
  await expect
    .poll(async () => (await state(page)).parts.find((p) => p.id === 'giza-pyramids/khufu')?.key)
    .toMatch(/^giza-khufu:.*"ramp":[1-9]/);
  await expect
    .poll(async () =>
      (await state(page)).stages.some((s) => s.id.startsWith('khufu-pyramid-building')),
    )
    .toBe(true);
  const s = await state(page);
  // Khafre's and Menkaure's pyramids are not begun yet.
  expect(s.parts.map((p) => p.id)).toEqual(['giza-pyramids/khufu']);
  expect(s.stages.find((x) => x.id.startsWith('khufu'))!.cast.length).toBeGreaterThan(0);

  // Later: all three pyramids and the Sphinx stand; tapping the Great Pyramid opens its card.
  await look(page, 'later', 1500);
  await expect.poll(async () => (await state(page)).parts.length).toBe(4);
  await expect.poll(async () => (await state(page)).stages.length).toBe(0);
  const { width, height } = page.viewportSize()!;
  await expect
    .poll(async () => {
      const p = (await state(page)).parts.find((x) => x.id === 'giza-pyramids/khufu')!;
      return (
        !!p.screen &&
        p.screen[0] > 0 &&
        p.screen[0] < width &&
        p.screen[1] > 100 &&
        p.screen[1] < height - 200
      );
    })
    .toBe(true);
  const khufu = (await state(page)).parts.find((x) => x.id === 'giza-pyramids/khufu')!;
  await page.mouse.click(khufu.screen![0], khufu.screen![1]);
  await expect(page.getByRole('dialog', { name: 'The pyramids of Giza' })).toBeVisible();
});
