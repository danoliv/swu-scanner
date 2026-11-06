import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/',
      'coverage/',
      'node_modules/',
      '.wayfinder/',
      'app.js',
      'public/ort/',
      'public/models/',
      'public/data/',
      '.cache/',
      'playwright-report/',
      'test-results/',
    ],
  },
  ...tseslint.configs.recommended,
);
