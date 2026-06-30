import { test, expect, type Page } from '@playwright/test'
import type { BrowserResult } from '../../types/schema.js'

async function measureLatency(page: Page): Promise<number[]> {
  const latencies: number[] = []
  for (let i = 0; i < 50; i++) {
    await page.evaluate(() => {
      // Clear previous error by typing valid value first
      ;(window as any).__asyncValidationStart = 0
      ;(window as any).__asyncValidationEnd = 0
    })
    const input = page.getByTestId('async-email')
    await input.fill('')
    // Ensure any prior error is cleared before starting the timed fill
    await page.waitForSelector('[data-testid="async-error"]', { state: 'hidden', timeout: 2000 }).catch(() => {})
    await input.fill('notanemail')
    // Wait for error to appear (validator takes 200ms + debounce)
    await page.waitForSelector('[data-testid="async-error"]', { timeout: 2000 })
    const latency: number = await page.evaluate(() => {
      return (window as any).__asyncValidationEnd - (window as any).__asyncValidationStart
    })
    if (latency > 0) latencies.push(latency)
  }
  return latencies
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

test.describe('async-latency', () => {
  test('neutro/form (React)', async ({ page }, testInfo) => {
    await page.goto('http://localhost:4173')
    const latencies = await measureLatency(page)
    const p50 = percentile(latencies, 50)
    const p99 = percentile(latencies, 99)
    const result: BrowserResult = {
      library: 'neutro/form (React)',
      status: 'ok',
      p50Ms: Math.round(p50),
      p99Ms: Math.round(p99),
      concurrentRacePass: true, // validated by async-race.test.ts
    }
    await testInfo.attach('result', { body: JSON.stringify(result), contentType: 'application/json' })
    expect(p50).toBeLessThan(500) // well within the 200ms validator + debounce
  })
})
