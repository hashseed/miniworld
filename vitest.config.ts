import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'app/src/**/*.test.ts',
      'assets/src/**/*.test.ts',
      'data/build/**/*.test.ts',
      'data/packs/**/*.test.ts',
      'tests/unit/**/*.test.ts',
    ],
    environment: 'node',
    // The world's tables from data/curated/, as the app gets them from the startup index.
    setupFiles: ['data/build/lib/worldTables.ts'],
    // `npm run coverage` (spec milestone 1, section 13). The thresholds are
    // the coverage of October 2026: they may rise, never fall.
    coverage: {
      provider: 'v8',
      include: [
        'app/src/**/*.{ts,tsx}',
        'assets/src/**/*.ts',
        'data/build/**/*.ts',
        'data/packs/**/*.ts',
        'data/schema/**/*.ts',
      ],
      // The on-land check's scenes run in a worker thread outside the runner (onLand.ts).
      exclude: ['**/*.test.ts', 'app/src/packs/history/world/onLandScenes.ts'],
      reporter: ['text-summary', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      thresholds: {
        statements: 47,
        branches: 43,
        functions: 41,
        lines: 48,
        'app/src/packs/history/world/**': { lines: 95 },
        'app/src/engine/content/**': { lines: 80 },
        'app/src/engine/geo/**': { lines: 90 },
        'app/src/engine/time/**': { lines: 90 },
        'app/src/engine/i18n/**': { lines: 90 },
        'assets/src/**': { lines: 75 },
        'data/build/lib/**': { lines: 63 },
      },
    },
  },
});
