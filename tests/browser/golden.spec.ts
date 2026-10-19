// Screenshots at the golden dates (spec milestone 1, sections 13 and 14) of
// Beringia and Sundaland, and of Doggerland and the European ice sheet, with
// the history lens on and off (history-lens.md, section 5), at desktop and
// phone sizes. They are attached to the test report for review; CI keeps the
// report as an artifact.
//
// They are not compared with stored pictures. The software renderer of the
// test browsers draws about one frame a second, and the globe refines by a
// few tiles a frame (section 11.5), so a view takes many minutes to stop
// refining, and what is drawn before then depends on timing. CI also runs a
// newer Chromium than the local test machines. What the test checks is what
// does not depend on timing: the date readout, the sea level and the lens.

import { expect, test, type Page } from '@playwright/test';
import { formatDateReadout } from '../../app/src/i18n/dates.ts';
import { astronomicalYear, dayFromDate } from '../../app/src/time/calendar.ts';

/** The dates of the golden tests (app/src/planet/golden.test.ts); `today` is the cutoff. */
const DATES: [string, number | 'today'][] = [
  ...[70_000, 50_000, 20_000, 12_000, 8000, 6200, 3000].map((y): [string, number] => [
    `${y}-bce`,
    dayFromDate(astronomicalYear(y, 'BCE'), 1, 1),
  ]),
  ['today', 'today'],
];

/**
 * The land bridges of the exit criterion (section 14), from orbit: Beringia
 * and Sundaland fit in one view of the Pacific from as far out as the camera
 * goes on the screen (the camera clamps the distance), Doggerland in one of
 * Europe.
 */
const VIEWS = {
  pacific: { lat: 36, lon: 148, altitudeKm: 100_000, heading: 0, tilt: 0 },
  europe: { lat: 54, lon: 8, altitudeKm: 7000, heading: 0, tilt: 0 },
};

/** Frames drawn with nothing left to download after the date is set, before the screenshot. */
const SETTLE_FRAMES = 4;

interface Hooks {
  __miniworld: {
    clock: { day: number; endDay: number; yearsPerMinute: number; setDay(day: number): void };
    globe: {
      lens: { blend: number };
      material: { uniforms: { seaLevel: { value: number } } };
    };
    loader: { pending: number };
    pinRenderScale(scale: number): void;
    holdFrames(on: boolean): Promise<void>;
  };
}

/** Sets the date; resolves once its data is in and a few frames are drawn, with the drawn sea level. */
function showDate(page: Page, date: number | 'today'): Promise<{ day: number; seaLevel: number }> {
  return page.evaluate(
    ({ date, frames }) =>
      new Promise<{ day: number; seaLevel: number }>((resolve) => {
        const m = (globalThis as unknown as Hooks).__miniworld;
        m.clock.setDay(date === 'today' ? m.clock.endDay : date);
        let quiet = 0;
        const check = () => {
          quiet = m.loader.pending === 0 ? quiet + 1 : 0;
          if (quiet >= frames)
            resolve({ day: m.clock.day, seaLevel: m.globe.material.uniforms.seaLevel.value });
          else requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      }),
    { date, frames: SETTLE_FRAMES },
  );
}

// One test per view and lens setting, so CI runs them on separate runners at
// once; the lens strength comes from the saved settings, as the slider has its
// own test (app.spec.ts).
for (const [view, camera] of Object.entries(VIEWS))
  for (const lens of [100, 0])
    test(`screenshots at the golden dates over ${view} with the lens at ${lens}%`, async ({
      page,
    }, info) => {
      test.setTimeout(300_000);
      await page.addInitScript(
        ({ camera, day, lens }) => {
          // A first visit in English, at the view and the first date, with the lens set.
          if (sessionStorage.getItem('miniworld.test.started')) return;
          sessionStorage.setItem('miniworld.test.started', '1');
          localStorage.clear();
          localStorage.setItem(
            'miniworld.settings.v1',
            JSON.stringify({ language: 'en', lensStrength: lens, lensHintSeen: true }),
          );
          localStorage.setItem('miniworld.view.v3', JSON.stringify({ day, camera }));
        },
        { camera, day: DATES[0]![1] as number, lens },
      );
      await page.goto('/');
      await expect(page.locator('.overlay')).toHaveCount(0, { timeout: 60_000 });
      // Slow frames would otherwise move the render scale while the test runs
      // (section 11.3); half the cap is the lowest it goes, and the quickest to draw.
      await page.evaluate(() => (globalThis as unknown as Hooks).__miniworld.pinRenderScale(0.5));
      const hold = (on: boolean) =>
        page.evaluate((on) => (globalThis as unknown as Hooks).__miniworld.holdFrames(on), on);
      const blend = () =>
        page.evaluate(() => (globalThis as unknown as Hooks).__miniworld.globe.lens.blend);
      await expect.poll(blend, { timeout: 60_000 }).toBe(lens / 100);

      const seaLevels = new Map<string, number>();
      for (const [label, date] of DATES) {
        const shown = await showDate(page, date);
        if (date !== 'today') expect(shown.day).toBe(date);
        seaLevels.set(label, shown.seaLevel);
        const ypm = await page.evaluate(
          () => (globalThis as unknown as Hooks).__miniworld.clock.yearsPerMinute,
        );
        await expect(page.getByTestId('date')).toHaveText(
          formatDateReadout(shown.day, 'en', { yearsPerMinute: ypm, stationary: true }),
        );
        // With the loop held the page is idle, so the screenshot takes the
        // last frame at once instead of waiting for the software renderer.
        await hold(true);
        await info.attach(`${view}-${label}-lens-${lens}.png`, {
          body: await page.screenshot({ animations: 'disabled' }),
          contentType: 'image/png',
        });
        await hold(false);
      }
      // The sea rises from the last glacial maximum to today (section 5.1).
      const sea = (label: string) => seaLevels.get(label)!;
      expect(sea('20000-bce')).toBeLessThan(sea('12000-bce'));
      expect(sea('12000-bce')).toBeLessThan(sea('8000-bce'));
      expect(sea('8000-bce')).toBeLessThan(sea('today'));
    });
