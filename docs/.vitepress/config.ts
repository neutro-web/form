import { defineConfig } from 'vitepress'

export default defineConfig({
  title: '@agw/form',
  description: 'Zero-dependency reactive form engine for every framework.',
  base: '/agw-form/',

  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Getting Started', link: '/getting-started' },
      { text: 'API', link: '/api/' },
      { text: 'Guides', link: '/guides/react' },
      { text: 'Playground', link: '/playground.html', target: '_self' },
    ],

    sidebar: {
      '/api/': [
        {
          text: 'API Reference',
          items: [
            { text: 'Overview', link: '/api/' },
            { text: 'Core API', link: '/api/core' },
            { text: 'DOM Connect Bridge', link: '/api/connect' },
            { text: 'Array Operations', link: '/api/array-operations' },
            { text: 'Validation Adapters', link: '/api/validation' },
          ],
        },
      ],
      '/guides/': [
        {
          text: 'Framework Guides',
          items: [
            { text: 'React', link: '/guides/react' },
            { text: 'Svelte 5', link: '/guides/svelte' },
            { text: 'Vue 3', link: '/guides/vue' },
            { text: 'SolidJS', link: '/guides/solid' },
            { text: 'Angular', link: '/guides/angular' },
          ],
        },
        {
          text: 'Advanced',
          items: [
            { text: 'Async Validation', link: '/guides/async-validation' },
            { text: 'Dependency Graph', link: '/guides/dependency-graph' },
            { text: 'Multi-Step Forms', link: '/guides/multi-step-forms' },
          ],
        },
      ],
    },

    search: {
      provider: 'local',
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/agnostic-web/agw-form' },
    ],
  },
})
