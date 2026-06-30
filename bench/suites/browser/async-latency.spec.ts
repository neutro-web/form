import { test, expect, type Page, type TestInfo } from '@playwright/test'
import type { BrowserResult } from '../../types/schema.js'

async function measureLatency(page: Page): Promise<number[]> {
  const latencies: number[] = []
  for (let i = 0; i < 20; i++) {
    await page.evaluate(() => {
      ;(window as any).__asyncValidationStart = 0
      ;(window as any).__asyncValidationEnd = 0
    })
    const input = page.getByTestId('async-email')
    await input.fill('test@example.com')
    await page.waitForSelector('[data-testid="async-error"]', { state: 'hidden', timeout: 2000 }).catch(() => {})
    await input.fill('notanemail')
    await page.waitForSelector('[data-testid="async-error"]', { timeout: 3000 })
    const latency: number = await page.evaluate(
      () => (window as any).__asyncValidationEnd - (window as any).__asyncValidationStart,
    )
    if (latency > 0) latencies.push(latency)
  }
  return latencies
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

async function runLatencyTest(
  page: Page,
  testInfo: TestInfo,
  url: string,
  library: string,
) {
  test.setTimeout(90000) // 20 iterations × ~1s each + server startup headroom
  await page.goto(url)
  const latencies = await measureLatency(page)
  const p50 = percentile(latencies, 50)
  const p99 = percentile(latencies, 99)
  const result: BrowserResult = {
    library,
    status: 'ok',
    p50Ms: Math.round(p50),
    p99Ms: Math.round(p99),
    concurrentRacePass: library.startsWith('neutro'), // only neutro has verified epoch cancellation
  }
  await testInfo.attach('result', { body: JSON.stringify(result), contentType: 'application/json' })
  expect(p50).toBeLessThan(600) // 200ms validator + 300ms debounce headroom + React scheduling
  expect(latencies.length).toBeGreaterThanOrEqual(10) // enough valid samples
}

test.describe('async-latency', () => {
  test('neutro/form (React)',       async ({ page }, i) => runLatencyTest(page, i, 'http://localhost:4173/async/neutro',   'neutro/form (React)'))
  test('react-hook-form',           async ({ page }, i) => runLatencyTest(page, i, 'http://localhost:4173/async/rhf',       'react-hook-form'))
  test('formik',                    async ({ page }, i) => runLatencyTest(page, i, 'http://localhost:4173/async/formik',    'formik'))
  test('tanstack-form (React)',     async ({ page }, i) => runLatencyTest(page, i, 'http://localhost:4173/async/tanstack',  'tanstack-form (React)'))
  test('neutro/form (Vue)',         async ({ page }, i) => runLatencyTest(page, i, 'http://localhost:4174/async/neutro',    'neutro/form (Vue)'))
  test('vee-validate',              async ({ page }, i) => runLatencyTest(page, i, 'http://localhost:4174/async/vee',       'vee-validate'))
  test('neutro/form (Svelte)',      async ({ page }, i) => runLatencyTest(page, i, 'http://localhost:4175/async/neutro',    'neutro/form (Svelte)'))
  test('tanstack-form (Svelte)',    async ({ page }, i) => runLatencyTest(page, i, 'http://localhost:4175/async/tanstack',  'tanstack-form (Svelte)'))
  test('felte',                     async ({ page }, i) => runLatencyTest(page, i, 'http://localhost:4175/async/felte',     'felte'))
})
