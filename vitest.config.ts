import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'app/src/**/*.test.ts',
      'assets/src/**/*.test.ts',
      'data/build/**/*.test.ts',
      'tests/unit/**/*.test.ts',
    ],
    environment: 'node',
    // `npm run coverage` (spec milestone 1, section 13). The thresholds are
    // the coverage of October 2026: they may rise, never fall.
    coverage: {
      provider: 'v8',
      include: ['app/src/**/*.{ts,tsx}', 'assets/src/**/*.ts', 'data/build/**/*.ts'],
      exclude: ['**/*.test.ts'],
      reporter: ['text-summary', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      thresholds: {
        statements: 43,
        branches: 40,
        functions: 35,
        lines: 43,
        'app/src/world/**': { lines: 95 },
        'app/src/time/**': { lines: 90 },
        'app/src/i18n/**': { lines: 90 },
        'assets/src/**': { lines: 75 },
        'data/build/lib/**': { lines: 63 },
      },
    },
  },
});
