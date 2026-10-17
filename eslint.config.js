import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules', 'dist', 'app/public/data', 'data/out', 'data/sources', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Determinism: the world must never depend on randomness (spec section 9).
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded hash in app/src/core/hash.ts.' },
      ],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
