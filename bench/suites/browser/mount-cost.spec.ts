import { test, expect, type Page, type TestInfo } from '@playwright/test'
import type { BrowserResult } from '../../types/schema.js'

async function measureMountCost(page: Page, url: string, readyTestId: string): Promise<number> {
  await page.goto(url)
  await page.getByTestId(readyTestId).first().waitFor({ state: 'visible' })
  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
    return nav.domInteractive - nav.startTime
  })
}

async function attach(testInfo: TestInfo, library: string, mountMs: number) {
  const result: BrowserResult = { library, status: 'ok', mountMs }
  await testInfo.attach('result', { body: JSON.stringify(result), contentType: 'application/json' })
}

const COMBOS: Array<{ name: string; port: number; readyTestId: string; library: string }> = [
  { name: 'neutro/form (React)', port: 4173, readyTestId: 'neutro-form', library: 'neutro/form (React)' },
  { name: 'react-hook-form',     port: 4173, readyTestId: 'rhf-form',    library: 'react-hook-form' },
  { name: 'formik',              port: 4173, readyTestId: 'formik-form', library: 'formik' },
  { name: 'tanstack-form (React)', port: 4173, readyTestId: 'tanstack-form', library: 'tanstack-form (React)' },
  { name: 'neutro/form (Vue)',   port: 4174, readyTestId: 'neutro-form', library: 'neutro/form (Vue)' },
  { name: 'vee-validate',        port: 4174, readyTestId: 'vee-form',    library: 'vee-validate' },
  { name: 'neutro/form (Svelte)', port: 4175, readyTestId: 'neutro-form', library: 'neutro/form (Svelte)' },
  { name: 'tanstack-form (Svelte)', port: 4175, readyTestId: 'tanstack-form', library: 'tanstack-form (Svelte)' },
  { name: 'felte',               port: 4175, readyTestId: 'felte-form',  library: 'felte' },
]

test.describe('mount-cost', () => {
  for (const c of COMBOS) {
    test(c.name, async ({ page }, testInfo) => {
      const mountMs = await measureMountCost(page, `http://localhost:${c.port}/`, c.readyTestId)
      await attach(testInfo, c.library, mountMs)
      expect(mountMs).toBeGreaterThanOrEqual(0)
    })
  }
})
