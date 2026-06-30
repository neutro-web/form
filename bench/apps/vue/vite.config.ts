import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@neutro/form-core': resolve(__dirname, '../../../packages/core/src/index.ts'),
      '@neutro/form-vue':  resolve(__dirname, '../../../packages/adapters/vue/src/index.ts'),
    },
  },
  build: {
    outDir: 'dist',
  },
})
