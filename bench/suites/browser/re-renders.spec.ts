import { test, expect, type Page, type TestInfo } from '@playwright/test'
import type { BrowserResult } from '../../types/schema.js'

async function measureReRenders(
  page: Page,
  fieldPrefix: string,
  rendersKey: string,
): Promise<number> {
  await page.evaluate(() => (window as any).__resetRenders?.())
  const input = page.getByTestId(`${fieldPrefix}-field0`)
  for (let i = 0; i < 20; i++) {
    await input.pressSequentially('x', { delay: 10 })
  }
  await page.waitForTimeout(100)
  const counts: Record<string, number> = await page.evaluate(
    (key) => (window as any)[key] ?? {},
    rendersKey,
  )
  return Object.values(counts).reduce((sum, n) => sum + n, 0)
}

async function attach(testInfo: TestInfo, library: string, renderCount: number) {
  const result: BrowserResult = { library, status: 'ok', renderCount }
  await testInfo.attach('result', { body: JSON.stringify(result), contentType: 'application/json' })
}

const COMBOS: Array<{ name: string; port: number; prefix: string; key: string; library: string; limit: number }> = [
  { name: 'neutro/form (React)',    port: 4173, prefix: 'neutro',   key: '__neutroRenders',   library: 'neutro/form (React)',    limit: 25 },
  { name: 'react-hook-form',        port: 4173, prefix: 'rhf',      key: '__rhfRenders',      library: 'react-hook-form',        limit: 500 },
  { name: 'formik',                 port: 4173, prefix: 'formik',   key: '__formikRenders',   library: 'formik',                 limit: 4500 },
  { name: 'tanstack-form (React)',  port: 4173, prefix: 'tanstack', key: '__tanstackRenders', library: 'tanstack-form (React)',  limit: 500 },
  { name: 'neutro/form (Vue)',      port: 4174, prefix: 'neutro',   key: '__neutroRenders',   library: 'neutro/form (Vue)',      limit: 25 },
  { name: 'vee-validate',           port: 4174, prefix: 'vee',      key: '__veeRenders',      library: 'vee-validate',           limit: 500 },
  { name: 'neutro/form (Svelte)',   port: 4175, prefix: 'neutro',   key: '__neutroRenders',   library: 'neutro/form (Svelte)',   limit: 25 },
  { name: 'tanstack-form (Svelte)', port: 4175, prefix: 'tanstack', key: '__tanstackRenders', library: 'tanstack-form (Svelte)', limit: 500 },
  { name: 'felte',                  port: 4175, prefix: 'felte',    key: '__felteRenders',    library: 'felte',                  limit: 2500 },
]

test.describe('re-renders/10', () => {
  for (const c of COMBOS) {
    test(c.name, async ({ page }, testInfo) => {
      await page.goto(`http://localhost:${c.port}/`)
      const total = await measureReRenders(page, c.prefix, c.key)
      await attach(testInfo, c.library, total)
      expect(total).toBeLessThanOrEqual(c.limit)
    })
  }
})

test.describe('re-renders/100', () => {
  for (const c of COMBOS) {
    test(c.name, async ({ page }, testInfo) => {
      await page.goto(`http://localhost:${c.port}/?fields=100`)
      const total = await measureReRenders(page, c.prefix, c.key)
      await attach(testInfo, c.library, total)
      // At 100 fields, whole-form re-render libraries (Formik, Felte) scale linearly with field
      // count — limits are 10x the /10 limits since the typed sequence length (20 keystrokes) is
      // unchanged but each whole-form render now touches 10x more fields.
      expect(total).toBeLessThanOrEqual(c.limit * 10)
    })
  }
})
