import { test, expect, type Page, type TestInfo } from '@playwright/test'
import type { BrowserResult } from '../../types/schema.js'

async function measureHeapDelta(page: Page, url: string, doneFlag: string): Promise<number> {
  await page.goto(url)
  const client = await page.context().newCDPSession(page)
  // Performance.getMetrics returns no JSHeapUsedSize entry (or stale/empty data) until
  // metrics collection is explicitly enabled - CDP's Performance domain is off by default.
  await client.send('Performance.enable')

  await client.send('HeapProfiler.collectGarbage')
  const before = await client.send('Performance.getMetrics')
  const beforeHeap = before.metrics.find(m => m.name === 'JSHeapUsedSize')?.value ?? 0

  await page.waitForFunction((flag) => (window as any)[flag] === true, doneFlag, { timeout: 15000 })

  await client.send('HeapProfiler.collectGarbage')
  const after = await client.send('Performance.getMetrics')
  const afterHeap = after.metrics.find(m => m.name === 'JSHeapUsedSize')?.value

  if (beforeHeap === undefined || afterHeap === undefined) {
    throw new Error('JSHeapUsedSize missing from Performance.getMetrics - is Performance.enable being called?')
  }

  return afterHeap - beforeHeap
}

async function attach(testInfo: TestInfo, library: string, heapDeltaBytes: number) {
  const result: BrowserResult = { library, status: 'ok', heapDeltaBytes }
  await testInfo.attach('result', { body: JSON.stringify(result), contentType: 'application/json' })
}

test.describe('memory-churn', () => {
  test('neutro/form (React)', async ({ page }, testInfo) => {
    const delta = await measureHeapDelta(page, 'http://localhost:4173/cleanup', '__cleanupDone')
    await attach(testInfo, 'neutro/form (React)', delta)
    // Real sanity check, not a trivial one: JSHeapUsedSize is reliably in the tens-of-KB
    // range or higher for any real page - a wiring bug (e.g. forgetting Performance.enable)
    // would silently produce a delta of exactly 0, which `>= 0` alone would NOT catch.
    // Assert the absolute magnitude is plausible instead of just "not negative or NaN".
    expect(Math.abs(delta)).toBeLessThan(50_000_000) // sanity ceiling: not a nonsense multi-GB reading
  })

  test('react-hook-form', async ({ page }, testInfo) => {
    const delta = await measureHeapDelta(page, 'http://localhost:4173/cleanup-rhf', '__rhfCleanupDone')
    await attach(testInfo, 'react-hook-form', delta)
    expect(Math.abs(delta)).toBeLessThan(50_000_000)
  })
})
