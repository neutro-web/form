import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@neutro/form-core':  resolve(__dirname, '../../../packages/core/src/index.ts'),
      '@neutro/form-react': resolve(__dirname, '../../../packages/adapters/react/src/index.ts'),
    },
  },
  build: {
    outDir: 'dist',
  },
  preview: {
    strictPort: true,
  },
})
