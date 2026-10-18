import { defineConfig, devices } from '@playwright/test';

// Browser tests (spec milestone 1, section 13) run against the dev server
// with the fixture data built by `npm run build-data -- --fixture`.
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
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:8800',
    launchOptions: { args: gpuArgs },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:8800',
    reuseExistingServer: true,
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
