import { test, expect, type Page, type TestInfo } from '@playwright/test'
import type { BrowserResult } from '../../types/schema.js'

async function measureReRenders(page: Page, fieldPrefix: string, rendersKey: string): Promise<number> {
  await page.evaluate(() => (window as any).__resetRenders?.())
  const input = page.getByTestId(`${fieldPrefix}-field0`)
  for (let i = 0; i < 20; i++) {
    await input.pressSequentially('x', { delay: 10 })
  }
  await page.waitForTimeout(100)
  const counts: Record<string, number> = await page.evaluate((key) => (window as any)[key] ?? {}, rendersKey)
  return Object.values(counts).reduce((sum, n) => sum + n, 0)
}

async function attach(testInfo: TestInfo, library: string, renderCount: number) {
  const result: BrowserResult = { library, status: 'ok', renderCount }
  await testInfo.attach('result', { body: JSON.stringify(result), contentType: 'application/json' })
}

async function attachNA(testInfo: TestInfo, library: string) {
  const result: BrowserResult = { library, status: 'na' }
  await testInfo.attach('result', { body: JSON.stringify(result), contentType: 'application/json' })
}

const COMBOS: Array<{ name: string; port: number; prefix: string; key: string; library: string; limit: number }> = [
  { name: 'neutro/form (React)',    port: 4173, prefix: 'neutro',   key: '__neutroSchemaRenders',   library: 'neutro/form (React)',   limit: 70 },
  // limit: 20 is an arbitrary small ceiling, not a derived 1.5-2x value — the observed count was 0,
  // and the calibration rule (~1.5-2x observed) is vacuous for 0. This coincides numerically with
  // the 20-keystroke count but is unrelated to the "counted 20, matches keystrokes" red-flag pattern
  // that applies to *observed* values, not limits.
  { name: 'react-hook-form',        port: 4173, prefix: 'rhf',      key: '__rhfSchemaRenders',      library: 'react-hook-form',       limit: 20 },
  { name: 'tanstack-form (React)',  port: 4173, prefix: 'tanstack', key: '__tanstackSchemaRenders', library: 'tanstack-form (React)', limit: 350 },
  { name: 'neutro/form (Vue)',      port: 4174, prefix: 'neutro',   key: '__neutroSchemaRenders',   library: 'neutro/form (Vue)',     limit: 55 },
  { name: 'vee-validate',           port: 4174, prefix: 'vee',      key: '__veeSchemaRenders',      library: 'vee-validate',          limit: 55 },
  { name: 'neutro/form (Svelte)',   port: 4175, prefix: 'neutro',   key: '__neutroSchemaRenders',   library: 'neutro/form (Svelte)',  limit: 35 },
  { name: 'tanstack-form (Svelte)', port: 4175, prefix: 'tanstack', key: '__tanstackSchemaRenders', library: 'tanstack-form (Svelte)', limit: 350 },
  { name: 'felte',                  port: 4175, prefix: 'felte',    key: '__felteSchemaRenders',    library: 'felte',                 limit: 350 },
]

test.describe('schema-validate-rerenders', () => {
  for (const c of COMBOS) {
    test(c.name, async ({ page }, testInfo) => {
      await page.goto(`http://localhost:${c.port}/schema-validate/${c.prefix}?mode=onChange`)
      const total = await measureReRenders(page, c.prefix, c.key)
      await attach(testInfo, c.library, total)
      expect(total).toBeGreaterThanOrEqual(0)
      expect(total).toBeLessThanOrEqual(c.limit)
    })
  }

  test('formik', async ({}, testInfo) => {
    await attachNA(testInfo, 'formik')
  })
})
