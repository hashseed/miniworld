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

for (const [view, camera] of Object.entries(VIEWS)) {
  test(`screenshots at the golden dates over ${view} with the lens on and off`, async ({
    page,
  }, info) => {
    test.setTimeout(480_000);
    await page.addInitScript(
      ({ camera, day }) => {
        // A first visit in English, at the view and the first date, with the lens at 100%.
        if (sessionStorage.getItem('miniworld.test.started')) return;
        sessionStorage.setItem('miniworld.test.started', '1');
        localStorage.clear();
        localStorage.setItem(
          'miniworld.settings.v1',
          JSON.stringify({ language: 'en', lensStrength: 100, lensHintSeen: true }),
        );
        localStorage.setItem('miniworld.view.v2', JSON.stringify({ day, camera }));
      },
      { camera, day: DATES[0]![1] as number },
    );
    await page.goto('/');
    await expect(page.locator('.overlay')).toHaveCount(0, { timeout: 60_000 });
    // Slow frames would otherwise move the render scale while the test runs
    // (section 11.3); half the cap is the lowest it goes, and the quickest to draw.
    await page.evaluate(() => (globalThis as unknown as Hooks).__miniworld.pinRenderScale(0.5));
    const blend = () =>
      page.evaluate(() => (globalThis as unknown as Hooks).__miniworld.globe.lens.blend);

    for (const lens of [100, 0]) {
      if (lens !== 100) {
        await page.getByTestId('lens-button').click();
        await page.getByTestId('lens-strength').fill(String(lens));
        // A press outside folds the slider away again, so it covers nothing.
        await page.mouse.click(10, 10);
        await expect(page.getByTestId('lens-strength')).toBeHidden();
        await expect.poll(blend, { timeout: 120_000 }).toBe(lens / 100);
      }
      expect(await blend()).toBe(lens / 100);
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
        await info.attach(`${view}-${label}-lens-${lens}.png`, {
          body: await page.screenshot({ animations: 'disabled' }),
          contentType: 'image/png',
        });
      }
      // The sea rises from the last glacial maximum to today (section 5.1).
      const sea = (label: string) => seaLevels.get(label)!;
      expect(sea('20000-bce')).toBeLessThan(sea('12000-bce'));
      expect(sea('12000-bce')).toBeLessThan(sea('8000-bce'));
      expect(sea('8000-bce')).toBeLessThan(sea('today'));
    }
  });
}
