import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/minimal.ts', 'src/devtools.ts'],
  format: ['esm', 'cjs', 'iife'],
  globalName: 'agwForm',
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: true,
  treeshake: true,
});
