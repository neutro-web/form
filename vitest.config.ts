import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@neutro/form-core': resolve(__dirname, 'packages/core/src/index.ts'),
      '@neutro/form-testing': resolve(__dirname, 'packages/testing/src/index.ts'),
    },
  },
  test: {
    exclude: ['bench/**', 'node_modules/**'],
  },
});
