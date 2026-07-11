import { test, expect, type Page, type TestInfo } from '@playwright/test'
import type { BrowserResult } from '../../types/schema.js'

async function measureSubmitLatency(page: Page, prefix: string): Promise<number> {
  await page.evaluate(() => performance.mark('schema-validate-submit-start'))
  await page.getByTestId(`${prefix}-submit`).click()
  await page.getByTestId(`${prefix}-error`).waitFor({ state: 'visible' })
  return page.evaluate(() => {
    performance.mark('schema-validate-submit-end')
    performance.measure('schema-validate-submit', 'schema-validate-submit-start', 'schema-validate-submit-end')
    const [entry] = performance.getEntriesByName('schema-validate-submit')
    return entry.duration
  })
}

async function attach(testInfo: TestInfo, library: string, submitLatencyMs: number) {
  const result: BrowserResult = { library, status: 'ok', submitLatencyMs }
  await testInfo.attach('result', { body: JSON.stringify(result), contentType: 'application/json' })
}

async function attachNA(testInfo: TestInfo, library: string) {
  const result: BrowserResult = { library, status: 'na' }
  await testInfo.attach('result', { body: JSON.stringify(result), contentType: 'application/json' })
}

const COMBOS: Array<{ name: string; port: number; prefix: string; library: string }> = [
  { name: 'neutro/form (React)',    port: 4173, prefix: 'neutro',   library: 'neutro/form (React)' },
  { name: 'react-hook-form',        port: 4173, prefix: 'rhf',      library: 'react-hook-form' },
  { name: 'tanstack-form (React)',  port: 4173, prefix: 'tanstack', library: 'tanstack-form (React)' },
  { name: 'neutro/form (Vue)',      port: 4174, prefix: 'neutro',   library: 'neutro/form (Vue)' },
  { name: 'vee-validate',           port: 4174, prefix: 'vee',      library: 'vee-validate' },
  { name: 'neutro/form (Svelte)',   port: 4175, prefix: 'neutro',   library: 'neutro/form (Svelte)' },
  { name: 'tanstack-form (Svelte)', port: 4175, prefix: 'tanstack', library: 'tanstack-form (Svelte)' },
  { name: 'felte',                  port: 4175, prefix: 'felte',    library: 'felte' },
]

test.describe('schema-validate-submit', () => {
  for (const c of COMBOS) {
    test(c.name, async ({ page }, testInfo) => {
      await page.goto(`http://localhost:${c.port}/schema-validate/${c.prefix}`)
      const submitLatencyMs = await measureSubmitLatency(page, c.prefix)
      await attach(testInfo, c.library, submitLatencyMs)
      expect(submitLatencyMs).toBeGreaterThanOrEqual(0)
    })
  }

  test('formik', async ({}, testInfo) => {
    await attachNA(testInfo, 'formik')
  })
})
