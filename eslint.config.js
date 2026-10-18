import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const ENGINE_MATHS = 'Not deterministic across engines: use + − × ÷ and Math.sqrt only.';

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
    // functions, so it never calls them (spec milestone 2, section 2.3).
    files: ['app/src/world/**/*.ts'],
    rules: {
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
