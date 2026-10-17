// Stress scene check (spec milestone 1, section 11.4). Frame times from a
// software renderer mean nothing, so this fails only on the draw-call budget;
// the full report is written to perf-report.json.

import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const DRAW_CALL_BUDGET = 300;

interface PerfReport {
  frames: number;
  maxDrawCalls: number;
  maxTriangles: number;
  averageFps: number;
  p99FrameMs: number;
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
