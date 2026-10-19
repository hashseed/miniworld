// Browser tests (spec milestone 1, section 13), at desktop and phone sizes.

import { expect, test, type Locator, type Page } from '@playwright/test';
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

/** Opens the app and waits for the first view. */
async function open(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('.overlay')).toHaveCount(0, { timeout: 60_000 });
}

/** A finger held on an element for a second, then lifted, as real touch events. */
async function holdPress(page: Page, target: Locator) {
  const box = (await target.boundingBox())!;
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await page.waitForTimeout(1000);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

function world(page: Page) {
  return page.evaluate(() => {
    const m = (
      globalThis as unknown as {
        __miniworld: {
          clock: { day: number; playState: string; yearsPerMinute: number };
          globe: { material: { uniforms: { seaLevel: { value: number } } } };
          controller: { state: { lat: number; lon: number } };
        };
      }
    ).__miniworld;
    return {
      day: m.clock.day,
      playState: m.clock.playState,
      yearsPerMinute: m.clock.yearsPerMinute,
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
          timelineExpanded: false,
          trueTimeScale: false,
          showStats: false,
        }),
      );
      sessionStorage.setItem('miniworld.test.started', '1');
    }
  });
});

test('first view opens at 70,000 BCE within the data budget', async ({ page }) => {
  await page.addInitScript(() => performance.setResourceTimingBufferSize(10_000));
  await open(page);
  await expect(page.getByTestId('date')).toHaveText('70,000 BCE');
  // Only data requested before the first view counts; plants load after it.
  const paths = await page.evaluate(() => {
    const mark = performance.getEntriesByName('miniworld:first-view')[0]!;
    return performance
      .getEntriesByType('resource')
      .filter((e) => e.startTime < mark.startTime)
      .map((e) => new URL(e.name).pathname)
      .filter((p) => p.startsWith('/data/'));
  });
  // The dev server sends uncompressed files; count the Brotli size of each data file.
  let dataBytes = 0;
  for (const path of paths) {
    try {
      dataBytes += statSync(`${root}/app/public${path}.br`).size;
    } catch {
      dataBytes += statSync(`${root}/app/public${path}`).size;
    }
  }
  expect(paths.length).toBeGreaterThan(0);
  // Section 10.6: at most 3 MB in all, of which the build's size check keeps
  // JavaScript and CSS within 500 KB, so the data may take the other 2.5 MB.
  expect(dataBytes).toBeLessThan(2.5 * 1024 * 1024);
});

test('language switch changes every string without a reload', async ({ page }) => {
  await open(page);
  const before = await world(page);
  await page.getByRole('button', { name: en['menu.settings'] }).click();
  await page.locator('select').first().selectOption('de');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(page.getByTestId('date')).toHaveText('70.000 v. Chr.');
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
  // The back and forward buttons play ten seconds of watching time fast; presses
  // during a jump are queued; history stays paused.
  const clockMs = () =>
    page.evaluate(
      () =>
        (globalThis as unknown as { __miniworld: { clock: { ms: number } } }).__miniworld.clock.ms,
    );
  await page.evaluate(() =>
    (
      globalThis as unknown as { __miniworld: { clock: { setMs(ms: number): void } } }
    ).__miniworld.clock.setMs(60_000_000),
  );
  await expect(page.getByTestId('back').locator('text')).toHaveText('10');
  await page.getByTestId('back').click();
  await expect.poll(clockMs, { timeout: 30_000 }).toBe(60_000_000 - 10_000);
  await page.getByTestId('forward').click();
  await page.getByTestId('forward').click();
  await expect.poll(clockMs, { timeout: 30_000 }).toBe(60_000_000 + 10_000);
  expect((await world(page)).playState).toBe('paused');
  await page.getByRole('button', { name: en['menu.settings'] }).click();
  await page.getByLabel(en['settings.trueTimeScale']!).check();
  // The About panel, with the sources' licences, opens from the settings.
  await page.getByTestId('about-link').click();
  await expect(page.getByRole('heading', { name: en['about.title'] })).toBeVisible();
  await page.getByRole('button', { name: en['dialog.close'] }).click();
  await page.getByRole('button', { name: en['timeline.expand'] }).click();
  await page.getByRole('button', { name: en['menu.bookmarks'] }).click();
  await page.getByRole('button', { name: en['bookmarks.add'] }).click();
  await expect(page.locator('.bookmark')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.overlay')).toHaveCount(0, { timeout: 60_000 });
  await page.getByRole('button', { name: en['menu.bookmarks'] }).click();
  await expect(page.locator('.bookmark')).toHaveCount(1);
  await page.getByRole('button', { name: en['dialog.close'] }).click();
  await page.getByRole('button', { name: en['menu.settings'] }).click();
  await expect(page.getByLabel(en['settings.trueTimeScale']!)).toBeChecked();
  await page.getByRole('button', { name: en['dialog.close'] }).click();
  await expect(page.getByRole('button', { name: en['timeline.collapse'] })).toBeVisible();
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
  await expect.poll(async () => (await world(page)).playState).toBe('paused');
  const before = await world(page);
  // Hold the key until the camera moves: frames are slow on software rendering.
  await page.keyboard.down('ArrowUp');
  await expect.poll(async () => (await world(page)).lat).not.toBe(before.lat);
  await page.keyboard.up('ArrowUp');
});

// Camera controls (spec milestone 1, section 6.2). Each gesture is checked by
// the direction it moves the camera, never by how far: frames are slow and
// uneven on software rendering, and inertia and flights run on frame time.

interface CameraView {
  lat: number;
  lon: number;
  altitudeKm: number;
  heading: number;
  tilt: number;
}

function cameraOf(page: Page): Promise<CameraView> {
  return page.evaluate(() => ({
    ...(globalThis as unknown as { __miniworld: { controller: { state: CameraView } } }).__miniworld
      .controller.state,
  }));
}

/** Opens the app above Lake Turkana, high enough that zooming in has room to show. */
async function openForCamera(page: Page): Promise<{ x: number; y: number }> {
  await page.addInitScript(() => {
    // Start well above the closest zoom, so zooming in has room to show.
    localStorage.setItem(
      'miniworld.view.v3',
      JSON.stringify({
        day: -26297094,
        camera: { lat: 3.95, lon: 36.2, altitudeKm: 6000, heading: 0, tilt: 0 },
        speedMode: 'regular',
      }),
    );
  });
  await open(page);
  const size = page.viewportSize()!;
  // The middle of the globe's part of the screen, above the bottom controls.
  return { x: size.width / 2, y: size.height * 0.4 };
}

/**
 * Waits until the camera has come to rest: it moves by less than a small
 * amount over a few frames (inertia fades out but never quite reaches zero).
 */
async function stillCamera(page: Page): Promise<CameraView> {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<boolean>((resolve) => {
            const state = () => ({
              ...(globalThis as unknown as { __miniworld: { controller: { state: CameraView } } })
                .__miniworld.controller.state,
            });
            const a = state();
            let frames = 0;
            const next = () => {
              if (++frames < 3) return void requestAnimationFrame(next);
              const b = state();
              resolve(
                Math.abs(b.lat - a.lat) < 0.01 &&
                  Math.abs(b.lon - a.lon) < 0.01 &&
                  Math.abs(b.altitudeKm - a.altitudeKm) < 1 &&
                  Math.abs(b.heading - a.heading) < 0.01 &&
                  Math.abs(b.tilt - a.tilt) < 0.01,
              );
            };
            requestAnimationFrame(next);
          }),
      ),
    )
    .toBe(true);
  return cameraOf(page);
}

/** Waits until the camera has turned north up and looks straight down. */
async function northUp(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      const c = await cameraOf(page);
      return Math.abs(c.heading) < 1e-3 && Math.abs(c.tilt) < 1e-3;
    })
    .toBe(true);
}

test('mouse moves, zooms, tilts and turns the camera', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'mouse input is tested at desktop size');
  test.slow();
  const c = await openForCamera(page);
  const globe = page.locator('#globe');

  // Left drag down pulls the globe down, so the camera moves north (heading 0).
  let before = await cameraOf(page);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x, c.y + 120, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await cameraOf(page)).lat).toBeGreaterThan(before.lat + 1);
  // The movement carries on gently after release, then stops.
  before = await stillCamera(page);

  // The scroll wheel zooms in.
  await page.mouse.wheel(0, -400);
  await expect
    .poll(async () => (await cameraOf(page)).altitudeKm)
    .toBeLessThan(before.altitudeKm * 0.8);
  before = await cameraOf(page);

  // Right drag up tilts towards the horizon; right drag sideways turns the heading.
  await page.mouse.move(c.x, c.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(c.x, c.y - 100, { steps: 5 });
  await page.mouse.up({ button: 'right' });
  await expect.poll(async () => (await cameraOf(page)).tilt).toBeGreaterThan(before.tilt + 5);
  before = await cameraOf(page);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(c.x + 100, c.y - 100, { steps: 5 });
  await page.mouse.up({ button: 'right' });
  await expect
    .poll(async () => (await cameraOf(page)).heading)
    .toBeGreaterThan(before.heading + 10);
  // Dragging and the wheel never scroll or zoom the page itself.
  expect(await page.evaluate(() => [scrollX, scrollY, visualViewport?.scale])).toEqual([0, 0, 1]);

  // The compass button turns north up and the view straight down again.
  await page.getByRole('button', { name: en['camera.reset'] }).click();
  await northUp(page);

  // A double-click zooms in to the point clicked: above the middle is further north.
  before = await stillCamera(page);
  await globe.dblclick({ position: { x: c.x, y: c.y - 60 } });
  await expect
    .poll(async () => (await cameraOf(page)).altitudeKm)
    .toBeCloseTo(Math.max(1300, before.altitudeKm / 3), 0);
  expect((await cameraOf(page)).lat).toBeGreaterThan(before.lat);
});

test('touch moves, zooms, tilts and turns the camera', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'touch input is tested at phone size');
  test.slow();
  const c = await openForCamera(page);
  const cdp = await page.context().newCDPSession(page);
  type Point = { x: number; y: number };
  /** Moves one or two fingers from their start points to their end points. */
  const gesture = async (from: Point[], to: Point[], steps = 6) => {
    const at = (k: number) =>
      from.map((p, id) => ({
        id,
        x: p.x + ((to[id]!.x - p.x) * k) / steps,
        y: p.y + ((to[id]!.y - p.y) * k) / steps,
      }));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
    for (let k = 1; k <= steps; k++)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(k) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };

  // A one-finger drag down pulls the globe down, so the camera moves north.
  let before = await cameraOf(page);
  await gesture([c], [{ x: c.x, y: c.y + 120 }]);
  await expect.poll(async () => (await cameraOf(page)).lat).toBeGreaterThan(before.lat + 1);
  before = await stillCamera(page);

  // Spreading two fingers zooms in.
  await gesture(
    [
      { x: c.x - 40, y: c.y },
      { x: c.x + 40, y: c.y },
    ],
    [
      { x: c.x - 120, y: c.y },
      { x: c.x + 120, y: c.y },
    ],
  );
  await expect
    .poll(async () => (await cameraOf(page)).altitudeKm)
    .toBeLessThan(before.altitudeKm * 0.6);
  before = await stillCamera(page);

  // Two fingers dragged up tilt towards the horizon.
  await gesture(
    [
      { x: c.x - 60, y: c.y + 60 },
      { x: c.x + 60, y: c.y + 60 },
    ],
    [
      { x: c.x - 60, y: c.y - 40 },
      { x: c.x + 60, y: c.y - 40 },
    ],
  );
  await expect.poll(async () => (await cameraOf(page)).tilt).toBeGreaterThan(before.tilt + 5);
  before = await stillCamera(page);

  // Twisting two fingers turns the heading.
  await gesture(
    [
      { x: c.x - 80, y: c.y },
      { x: c.x + 80, y: c.y },
    ],
    [
      { x: c.x - 70, y: c.y - 40 },
      { x: c.x + 70, y: c.y + 40 },
    ],
  );
  await expect
    .poll(async () => Math.abs((await cameraOf(page)).heading - before.heading))
    .toBeGreaterThan(10);
  // No gesture scrolled or zoomed the page.
  expect(await page.evaluate(() => [scrollX, scrollY, visualViewport?.scale])).toEqual([0, 0, 1]);

  // The compass button turns north up and the view straight down again.
  await page.getByRole('button', { name: en['camera.reset'] }).tap();
  await northUp(page);

  // A double-tap zooms in to the point tapped.
  before = await stillCamera(page);
  // The taps carry their own times, 150 ms apart: the slow test browser would
  // otherwise take longer than a double-tap allows to deliver the second one.
  const t0 = Date.now() / 1000;
  const touch = { x: c.x, y: c.y - 60, id: 0 };
  for (const [type, t] of [
    ['touchStart', 0],
    ['touchEnd', 0.05],
    ['touchStart', 0.15],
    ['touchEnd', 0.2],
  ] as const)
    await cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchStart' ? [touch] : [],
      timestamp: t0 + t,
    });
  await expect
    .poll(async () => (await cameraOf(page)).altitudeKm)
    .toBeCloseTo(Math.max(1300, before.altitudeKm / 3), 0);
  expect((await cameraOf(page)).lat).toBeGreaterThan(before.lat);
});

test('keyboard zooms, tilts, turns and resets the camera', async ({ page }) => {
  await openForCamera(page);
  await page.locator('#globe').focus();
  /** Holds a key until the camera has moved, then lets go. */
  const hold = async (key: string, moved: (c: CameraView) => boolean) => {
    await page.keyboard.down(key);
    await expect.poll(async () => moved(await cameraOf(page))).toBe(true);
    await page.keyboard.up(key);
    return stillCamera(page);
  };
  let before = await cameraOf(page);
  before = await hold('+', (c) => c.altitudeKm < before.altitudeKm * 0.9);
  before = await hold('e', (c) => c.altitudeKm > before.altitudeKm * 1.05);
  before = await hold('q', (c) => c.altitudeKm < before.altitudeKm * 0.9);
  before = await hold('-', (c) => c.altitudeKm > before.altitudeKm * 1.05);
  before = await hold('PageUp', (c) => c.tilt > before.tilt + 3);
  before = await hold('PageDown', (c) => c.tilt < before.tilt - 1);
  before = await hold('.', (c) => c.heading > before.heading + 5);
  before = await hold(',', (c) => c.heading < before.heading - 2);
  before = await hold('d', (c) => c.lon > before.lon);
  await page.keyboard.press('n');
  await northUp(page);
});

test('the lens slider morphs the globe and keeps the point in view', async ({ page }) => {
  // Two morphs and a reload: on the slow CI runners this needs more than the usual budget.
  test.slow();
  await open(page);
  const lens = () =>
    page.evaluate(() => {
      const m = (
        globalThis as unknown as {
          __miniworld: {
            globe: { lens: { blend: number } };
            controller: { state: { lat: number; lon: number } };
          };
        }
      ).__miniworld;
      return {
        blend: m.globe.lens.blend,
        lat: m.controller.state.lat,
        lon: m.controller.state.lon,
      };
    });
  const slider = page.getByTestId('lens-strength');
  // The slider is folded behind the magnifier until it is opened.
  await expect(slider).toBeHidden();
  await page.getByTestId('lens-button').click();
  await expect(slider).toBeVisible();
  await expect(slider).toHaveValue('100');
  await expect(page.locator('.lens-fold output')).toHaveText('100%');
  expect((await lens()).blend).toBe(1);
  const before = await lens();
  const lensOn = await page.locator('#globe').screenshot();
  await slider.fill('0');
  // The blend passes through values between the two states, then settles at true sizes.
  await expect.poll(async () => (await lens()).blend, { timeout: 90_000 }).toBe(0);
  const after = await lens();
  expect(after.lat).toBeCloseTo(before.lat, 6);
  expect(after.lon).toBeCloseTo(before.lon, 6);
  const lensOff = await page.locator('#globe').screenshot();
  expect(lensOff.equals(lensOn)).toBe(false);
  await slider.fill('200');
  await expect.poll(async () => (await lens()).blend, { timeout: 90_000 }).toBe(2);
  await expect(page.locator('.lens-fold output')).toHaveText('200%');
  // The strength is saved.
  await page.reload();
  await expect(page.locator('.overlay')).toHaveCount(0, { timeout: 60_000 });
  await expect(slider).toHaveValue('200');
  expect((await lens()).blend).toBe(2);
});

test('the speed modes fold behind the play button', async ({ page }, info) => {
  await open(page);
  const snail = page.getByTestId('speed-snail');
  const play = page.getByRole('button', { name: en['controls.play'] });
  await expect(snail).toBeHidden();
  await expect(play).toHaveAttribute('title', en['controls.playHint']!);
  if (info.project.name === 'phone') {
    // A tap only plays; a held press opens the modes without playing; a tap
    // elsewhere folds them away.
    await play.tap();
    await expect.poll(async () => (await world(page)).playState).toBe('playing');
    await expect(snail).toBeHidden();
    await page.getByRole('button', { name: en['controls.pause'] }).tap();
    await holdPress(page, page.getByTestId('play'));
    await expect(snail).toBeVisible();
    expect((await world(page)).playState).toBe('paused');
    await snail.tap();
    await page.touchscreen.tap(200, 300);
    await expect(snail).toBeHidden();
  } else {
    await play.hover();
    await expect(snail).toBeVisible();
    // The modes pop up above the button and leave the date uncovered.
    const modes = (await page
      .getByRole('radiogroup', { name: en['controls.speed'] })
      .boundingBox())!;
    const button = (await play.boundingBox())!;
    const date = (await page.getByTestId('date').boundingBox())!;
    expect(modes.y + modes.height).toBeLessThanOrEqual(button.y);
    expect(modes.y + modes.height <= date.y || modes.x + modes.width <= date.x).toBe(true);
    await snail.click();
    await page.mouse.move(640, 200);
    await expect(snail).toBeHidden();
  }
  // The chosen mode stays on the button, and history runs at 2.5 years a minute.
  await expect(page.getByTestId('speed-snail')).toHaveAttribute('aria-checked', 'true');
  // A tenth of history's rate at the date (spec section 2.2).
  const { yearsPerMinute, day } = await world(page);
  const regular = await page.evaluate(
    (d) =>
      (
        globalThis as unknown as { __miniworld: { rateAt(day: number): number } }
      ).__miniworld.rateAt(d),
    day,
  );
  expect(yearsPerMinute).toBeCloseTo(regular / 10, 6);
});
