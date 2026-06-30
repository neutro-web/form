import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      '@neutro/form-core':   resolve(__dirname, '../../../packages/core/src/index.ts'),
      '@neutro/form-svelte': resolve(__dirname, '../../../packages/adapters/svelte/src/index.ts'),
    },
  },
  build: {
    outDir: 'dist',
  },
})
