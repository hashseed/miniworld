// Stress scene check (spec milestone 1, section 11.4). Frame times from a
// software renderer mean nothing, so this fails only on the draw-call and
// triangle budgets; the full report is written to perf-report.json.

import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const DRAW_CALL_BUDGET = 300;

/**
 * The spec names no triangle budget for the stress scene as a single number,
 * so this is the sum of what it allows each part: the terrain at about
 * 800,000 triangles on screen (section 4.2), the plants at 400,000
 * (foliage.md, section 7), 5,000 animated figures of about 700 triangles
 * (sections 11.2 and 11.4) and 1,000 buildings of about 2,000 (section 11.4).
 * The other figures are drawn as marks, which have no triangles.
 */
const TRIANGLE_BUDGET = 800_000 + 400_000 + 5000 * 700 + 1000 * 2000;

/** Frames for the whole camera path: one every 2 seconds of the path. */
const PATH_FRAMES = 30;

interface PerfReport {
  frames: number;
  maxDrawCalls: number;
  maxTriangles: number;
  averageFps: number;
  p99FrameMs: number;
  averageUpdateMs: number;
  p99UpdateMs: number;
  done: boolean;
}

test('stress scene stays within the draw-call budget', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/?scene=stress');
  const duration = Number(process.env.PERF_SECONDS ?? 20) * 1000;
  await page.waitForTimeout(duration);
  const report = await page.evaluate(() =>
    (globalThis as unknown as { __perfReport: () => PerfReport }).__perfReport(),
  );
  writeFileSync('perf-report.json', `${JSON.stringify(report, null, 2)}\n`);
  expect(report.frames).toBeGreaterThan(0);
  expect(report.maxDrawCalls).toBeLessThanOrEqual(DRAW_CALL_BUDGET);
});

test('stress scene stays within the draw-call and triangle budgets over the whole camera path', async ({
  page,
}) => {
  // The software renderer draws the scene at well under one frame a second.
  test.setTimeout(300_000);
  // The camera moves along the 60-second path by an equal step each frame,
  // so every run checks the same points of it however slow the browser is.
  await page.goto(`/?scene=stress&pathFrames=${PATH_FRAMES}`);
  const report = () =>
    page.evaluate(() =>
      (globalThis as unknown as { __perfReport: () => PerfReport }).__perfReport(),
    );
  await expect.poll(async () => (await report()).done, { timeout: 280_000 }).toBe(true);
  const r = await report();
  await test.info().attach('path-report.json', {
    body: JSON.stringify(r, null, 2),
    contentType: 'application/json',
  });
  console.log(`stress path: ${r.maxDrawCalls} draw calls, ${r.maxTriangles} triangles at most`);
  expect(r.frames).toBeGreaterThanOrEqual(PATH_FRAMES);
  expect(r.maxDrawCalls).toBeLessThanOrEqual(DRAW_CALL_BUDGET);
  expect(r.maxTriangles).toBeLessThanOrEqual(TRIANGLE_BUDGET);
});
