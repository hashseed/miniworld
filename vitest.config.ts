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
  },
});
