import { defineConfig, devices } from '@playwright/test';

// Browser tests (spec milestone 1, section 13) run against the dev server
// with the fixture data built by `npm run build-data -- --fixture`.
// They start their own server on MINIWORLD_PORT, never on the dev server's
// port 8800, and run PW_WORKERS tests at a time (spec milestone 1, section 2.5).
const port = Number(process.env.MINIWORLD_PORT ?? 8810);
const baseURL = `http://localhost:${port}`;
const workers = Number(process.env.PW_WORKERS ?? 1);
// A Chromium of the system's own, where Playwright's download is not available.
const executablePath = process.env.MINIWORLD_CHROMIUM || undefined;
const gpuArgs = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
];

export default defineConfig({
  testDir: 'tests/browser',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: true,
  workers,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    launchOptions: { args: gpuArgs, ...(executablePath ? { executablePath } : {}) },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    env: { MINIWORLD_PORT: String(port) },
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } }, testIgnore: /perf\.spec/ },
    {
      name: 'phone',
      // Pixel ratio 1: CI renders in software, and the phone's 2.6 would draw
      // about four times the pixels at the render scale cap of 2 (spec milestone 1, section 2.4).
      use: { ...devices['Pixel 7'], deviceScaleFactor: 1, browserName: 'chromium' },
      testIgnore: /perf\.spec/,
    },
    { name: 'perf', use: { viewport: { width: 1280, height: 800 } }, testMatch: /perf\.spec/ },
  ],
});
