import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    core: 'src/core.ts',
    'adapters/react': 'src/adapters/react.ts',
    'adapters/svelte': 'src/adapters/svelte.ts',
    'adapters/vue': 'src/adapters/vue.ts',
    'adapters/solid': 'src/adapters/solid.ts',
    'adapters/angular': 'src/adapters/angular.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  external: [
    'react',
    'react-dom',
    'svelte',
    'svelte/store',
    'svelte/internal',
    'vue',
    'solid-js',
    'solid-js/store',
    '@angular/core',
  ],
});
