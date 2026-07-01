import { test, expect, type Page, type TestInfo } from '@playwright/test'
import type { BrowserResult } from '../../types/schema.js'

async function measureArrayOps(page: Page, prefix: string): Promise<number> {
  await page.evaluate(() => (window as any).__resetArrayRenders?.())
  await page.getByTestId(`${prefix}-array-remove-3`).click()
  await page.waitForTimeout(50)
  await page.getByTestId(`${prefix}-array-move-3-7`).click()
  await page.waitForTimeout(50)
  const key = `__${prefix === 'rhf' ? 'rhf' : prefix === 'tanstack' ? 'tanstack' : prefix === 'formik' ? 'formik' : prefix === 'vee' ? 'vee' : prefix === 'felte' ? 'felte' : 'neutro'}ArrayRenders`
  const counts: Record<string, number> = await page.evaluate((k) => (window as any)[k] ?? {}, key)
  return Object.values(counts).reduce((sum, n) => sum + n, 0)
}

async function attach(testInfo: TestInfo, library: string, renderCount: number) {
  const result: BrowserResult = { library, status: 'ok', renderCount }
  await testInfo.attach('result', { body: JSON.stringify(result), contentType: 'application/json' })
}

const COMBOS: Array<{ name: string; port: number; prefix: string; library: string; limit: number }> = [
  { name: 'neutro/form (React)',    port: 4173, prefix: 'neutro',   library: 'neutro/form (React)',    limit: 30 },
  { name: 'react-hook-form',        port: 4173, prefix: 'rhf',      library: 'react-hook-form',        limit: 100 },
  { name: 'formik',                 port: 4173, prefix: 'formik',   library: 'formik',                 limit: 100 },
  { name: 'tanstack-form (React)',  port: 4173, prefix: 'tanstack', library: 'tanstack-form (React)',  limit: 100 },
  { name: 'neutro/form (Vue)',      port: 4174, prefix: 'neutro',   library: 'neutro/form (Vue)',      limit: 30 },
  { name: 'vee-validate',           port: 4174, prefix: 'vee',      library: 'vee-validate',           limit: 100 },
  { name: 'neutro/form (Svelte)',   port: 4175, prefix: 'neutro',   library: 'neutro/form (Svelte)',   limit: 30 },
  { name: 'tanstack-form (Svelte)', port: 4175, prefix: 'tanstack', library: 'tanstack-form (Svelte)', limit: 100 },
  { name: 'felte',                  port: 4175, prefix: 'felte',    library: 'felte',                  limit: 100 },
]

test.describe('array-ops', () => {
  for (const c of COMBOS) {
    test(c.name, async ({ page }, testInfo) => {
      await page.goto(`http://localhost:${c.port}/array`)
      const total = await measureArrayOps(page, c.prefix)
      await attach(testInfo, c.library, total)
      expect(total).toBeLessThanOrEqual(c.limit)
    })
  }
})
