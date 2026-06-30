import { defineConfig } from '@playwright/test'

export default defineConfig({
  retries: 2,
  reporter: [['./reporters/json-playwright.ts']],
  webServer: [
    {
      command: 'pnpm --dir apps/react preview',
      port: 4173,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm --dir apps/vue preview',
      port: 4174,
      reuseExistingServer: !process.env.CI,
    },
  ],
})
