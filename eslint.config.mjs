/**
 * @file eslint.config.mjs
 * @description ESLint flat config for the Trust Service.
 *
 * DECISION: Using ESLint flat config (v9) with @typescript-eslint strict-type-checked.
 * ALTERNATIVES CONSIDERED: .eslintrc.json (deprecated in ESLint 9).
 * REF: GOV-003 §12.3 — TypeScript ESLint Profile
 */

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      'no-console': 'warn',
      'complexity': ['error', 10],
    },
  },
  {
    ignores: ['dist/', 'node_modules/', '*.config.*', 'scripts/'],
  },
);
