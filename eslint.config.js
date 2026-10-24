import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const ENGINE_MATHS = 'Not deterministic across engines: use + − × ÷ and Math.sqrt only.';
const WORLD_IMPORTS =
  'The world is a pure function of the clock and the data (spec milestone 2, section 2.3): it may not depend on rendering, models, the interface or loading.';

export default tseslint.config(
  {
    ignores: [
      'node_modules',
      'dist',
      'app/public/data',
      'data/out',
      'data/sources',
      'test-results',
      'playwright-report',
      'app/.vite',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['app/public/sw.js'],
    languageOptions: {
      globals: {
        self: 'readonly',
        caches: 'readonly',
        fetch: 'readonly',
        Response: 'readonly',
        URL: 'readonly',
      },
    },
  },
  {
    rules: {
      // Determinism: the world must never depend on randomness (spec section 9).
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Use the seeded hash in app/src/core/hash.ts.',
        },
      ],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // The world query may differ between engines in the last bits of these
    // functions, so it never calls them (spec milestone 2, section 2.3). The
    // world is a pure function of the clock: it never reads the wall clock and
    // never imports the renderer, the asset models or the interface, so what
    // is drawn or loaded can never change it. Tests and the on-land harness,
    // which builds the drawn ground to check against, are outside the rule.
    files: ['app/src/world/**/*.ts', 'app/src/core/**/*.ts'],
    ignores: ['**/*.test.ts', 'app/src/world/onLand.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'performance', message: 'The world never reads the wall clock (spec section 9).' },
        { name: 'Date', message: 'The world never reads the wall clock (spec section 9).' },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'three', message: WORLD_IMPORTS }],
          patterns: [
            {
              group: [
                '**/assets/src/**',
                '**/globe/**',
                '**/tree/**',
                '**/wildlife/**',
                '**/ui/**',
                '**/timeline/**',
                '**/perf/**',
                '**/dev/**',
                '**/content/loader.ts',
              ],
              message: WORLD_IMPORTS,
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'sin', message: ENGINE_MATHS },
        { object: 'Math', property: 'cos', message: ENGINE_MATHS },
        { object: 'Math', property: 'tan', message: ENGINE_MATHS },
        { object: 'Math', property: 'asin', message: ENGINE_MATHS },
        { object: 'Math', property: 'acos', message: ENGINE_MATHS },
        { object: 'Math', property: 'atan', message: ENGINE_MATHS },
        { object: 'Math', property: 'atan2', message: ENGINE_MATHS },
        { object: 'Math', property: 'exp', message: ENGINE_MATHS },
        { object: 'Math', property: 'expm1', message: ENGINE_MATHS },
        { object: 'Math', property: 'log', message: ENGINE_MATHS },
        { object: 'Math', property: 'log2', message: ENGINE_MATHS },
        { object: 'Math', property: 'log10', message: ENGINE_MATHS },
        { object: 'Math', property: 'log1p', message: ENGINE_MATHS },
        { object: 'Math', property: 'pow', message: ENGINE_MATHS },
        { object: 'Math', property: 'hypot', message: ENGINE_MATHS },
        { object: 'Math', property: 'cbrt', message: ENGINE_MATHS },
        { object: 'Math', property: 'sinh', message: ENGINE_MATHS },
        { object: 'Math', property: 'cosh', message: ENGINE_MATHS },
        { object: 'Math', property: 'tanh', message: ENGINE_MATHS },
        { object: 'Math', property: 'random', message: ENGINE_MATHS },
      ],
    },
  },
);
