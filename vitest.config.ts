import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@neutro/form-core': resolve(__dirname, 'packages/core/src/index.ts'),
    },
  },
});
