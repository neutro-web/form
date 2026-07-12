// bench/suites/browser/dependency-chain-settle.spec.ts
import { test, expect, type Page, type TestInfo } from '@playwright/test'
import type { BrowserResult } from '../../types/schema.js'

async function measureSettleLatency(page: Page, prefix: string, chainKey: string): Promise<number> {
  // Capture f199's pre-keystroke count and poll for an INCREMENT from it, not just
  // a non-zero value -- found in final whole-branch review: no library validates on
  // mount today, so ">0" and "incremented" happen to coincide, but ">0" alone would
  // silently report a bogus ~0ms if that ever changed (e.g. a validateOnMount config).
  const before = await page.evaluate(
    ([key]) => ((window as any)[key]?.f199 ?? 0),
    [chainKey],
  )
  await page.evaluate(() => performance.mark('chain-start'))
  await page.getByTestId(`${prefix}-field-f0`).fill('changed')
  await page.waitForFunction(
    ([key, before]) => {
      const counters = (window as any)[key]
      if (!counters || !((counters.f199 ?? 0) > before)) return false
      performance.mark('chain-end')
      performance.measure('chain-settle', 'chain-start', 'chain-end')
      return true
    },
    [chainKey, before],
    { timeout: 25000 },
  )
  return page.evaluate(() => {
    const [entry] = performance.getEntriesByName('chain-settle')
    return entry.duration
  })
}

async function attach(testInfo: TestInfo, library: string, settleLatencyMs: number) {
  const result: BrowserResult = { library, status: 'ok', settleLatencyMs }
  await testInfo.attach('result', { body: JSON.stringify(result), contentType: 'application/json' })
}

async function attachNA(testInfo: TestInfo, library: string) {
  const result: BrowserResult = { library, status: 'na' }
  await testInfo.attach('result', { body: JSON.stringify(result), contentType: 'application/json' })
}

const COMBOS: Array<{ name: string; port: number; prefix: string; key: string; library: string }> = [
  { name: 'neutro/form (React)',   port: 4173, prefix: 'neutro', key: '__neutroChainValidations',   library: 'neutro/form (React)' },
  { name: 'react-hook-form',       port: 4173, prefix: 'rhf',    key: '__rhfChainValidations',      library: 'react-hook-form' },
  { name: 'tanstack-form (React)', port: 4173, prefix: 'tanstack', key: '__tanstackChainValidations', library: 'tanstack-form (React)' },
  { name: 'neutro/form (Vue)',     port: 4174, prefix: 'neutro', key: '__neutroChainValidations',   library: 'neutro/form (Vue)' },
  { name: 'vee-validate',          port: 4174, prefix: 'vee',    key: '__veeChainValidations',      library: 'vee-validate' },
  { name: 'neutro/form (Svelte)',  port: 4175, prefix: 'neutro', key: '__neutroChainValidations',   library: 'neutro/form (Svelte)' },
  { name: 'tanstack-form (Svelte)', port: 4175, prefix: 'tanstack', key: '__tanstackChainValidations', library: 'tanstack-form (Svelte)' },
]

test.describe('dependency-chain-settle', () => {
  test.slow() // 200-field cascades are a heavier workload than any existing browser surface -- see this plan's Global Constraints

  for (const c of COMBOS) {
    test(c.name, async ({ page }, testInfo) => {
      await page.goto(`http://localhost:${c.port}/dependency-chain/${c.prefix}`)
      const settleLatencyMs = await measureSettleLatency(page, c.prefix, c.key)
      await attach(testInfo, c.library, settleLatencyMs)
      expect(settleLatencyMs).toBeGreaterThanOrEqual(0)
    })
  }

  test('formik', async ({}, testInfo) => {
    await attachNA(testInfo, 'formik')
  })

  test('felte', async ({}, testInfo) => {
    await attachNA(testInfo, 'felte')
  })
})
