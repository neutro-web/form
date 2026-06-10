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
    '@agnostic-web/form-core',
    '@agnostic-web/form-react',
    '@agnostic-web/form-svelte',
    '@agnostic-web/form-vue',
    '@agnostic-web/form-solid',
    '@agnostic-web/form-angular',
  ],
});
