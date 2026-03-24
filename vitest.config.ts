/**
 * @file vitest.config.ts
 * @description Vitest test runner configuration for the Trust Service.
 * REF: GOV-002 (Testing Protocol), AGT-003-BE §2
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
    },
  },
  resolve: {
    alias: {
      '@': './src',
    },
  },
});
