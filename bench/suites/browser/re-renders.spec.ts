import { test, expect, type Page } from '@playwright/test'
import type { BrowserResult } from '../../types/schema.js'

async function measureReRenders(page: Page, prefix: string): Promise<number> {
  await page.evaluate(() => (window as any).__resetRenders?.())
  const input = page.getByTestId(`${prefix}-field0`)
  for (let i = 0; i < 20; i++) {
    await input.pressSequentially('x', { delay: 10 })
  }
  // Wait for React/Vue to flush
  await page.waitForTimeout(100)
  const counts: Record<string, number> = await page.evaluate(() => (window as any).__neutroRenders ?? {})
  return Object.values(counts).reduce((sum, n) => sum + n, 0)
}

test.describe('re-renders', () => {
  test('neutro/form (React)', async ({ page }, testInfo) => {
    await page.goto('http://localhost:4173')
    const total = await measureReRenders(page, 'neutro')
    const result: BrowserResult = {
      library: 'neutro/form (React)',
      status: 'ok',
      renderCount: total,
    }
    await testInfo.attach('result', { body: JSON.stringify(result), contentType: 'application/json' })
    // 20 renders for the active field + 0 for others = exactly 20
    expect(total).toBeLessThanOrEqual(25) // 25% headroom for React batching
  })

  test('react-hook-form (Controller)', async ({ page }, testInfo) => {
    await page.goto('http://localhost:4173')
    await page.evaluate(() => (window as any).__resetRenders?.())
    const input = page.getByTestId('rhf-field0')
    for (let i = 0; i < 20; i++) {
      await input.pressSequentially('x', { delay: 10 })
    }
    await page.waitForTimeout(100)
    const counts: Record<string, number> = await page.evaluate(() => (window as any).__rhfRenders ?? {})
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0)
    const result: BrowserResult = { library: 'react-hook-form', status: 'ok', renderCount: total }
    await testInfo.attach('result', { body: JSON.stringify(result), contentType: 'application/json' })
    expect(total).toBeLessThanOrEqual(30)
  })

  test('neutro/form (Vue)', async ({ page }, testInfo) => {
    await page.goto('http://localhost:4174')
    const total = await measureReRenders(page, 'neutro')
    const result: BrowserResult = { library: 'neutro/form (Vue)', status: 'ok', renderCount: total }
    await testInfo.attach('result', { body: JSON.stringify(result), contentType: 'application/json' })
    expect(total).toBeLessThanOrEqual(25)
  })
})
