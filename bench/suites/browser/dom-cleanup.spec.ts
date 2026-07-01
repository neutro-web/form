import { test, expect, type Page, type TestInfo } from '@playwright/test'
import type { BrowserResult } from '../../types/schema.js'

async function measureCleanup(page: Page): Promise<number> {
  await page.waitForFunction(() => (window as any).__cleanupDone === true, { timeout: 15000 })
  return page.evaluate(() => (window as any).__getConnectedCount())
}

async function runCleanupTest(page: Page, testInfo: TestInfo, url: string, library: string) {
  await page.goto(url)
  const connectedCountAfterCleanup = await measureCleanup(page)
  const result: BrowserResult = { library, status: 'ok', connectedCountAfterCleanup }
  await testInfo.attach('result', { body: JSON.stringify(result), contentType: 'application/json' })
  expect(connectedCountAfterCleanup).toBe(0)
}

test.describe('dom-cleanup', () => {
  test('neutro/form (React)',  async ({ page }, i) => runCleanupTest(page, i, 'http://localhost:4173/cleanup', 'neutro/form (React)'))
  test('neutro/form (Vue)',    async ({ page }, i) => runCleanupTest(page, i, 'http://localhost:4174/cleanup', 'neutro/form (Vue)'))
  test('neutro/form (Svelte)', async ({ page }, i) => runCleanupTest(page, i, 'http://localhost:4175/cleanup', 'neutro/form (Svelte)'))
})
