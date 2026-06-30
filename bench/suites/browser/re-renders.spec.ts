import { test, expect, type Page } from '@playwright/test'
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

async function attach(testInfo: any, library: string, renderCount: number) {
  const result: BrowserResult = { library, status: 'ok', renderCount }
  await testInfo.attach('result', { body: JSON.stringify(result), contentType: 'application/json' })
}

test.describe('re-renders', () => {
  // ---- React (port 4173) ----
  test('neutro/form (React)', async ({ page }, testInfo) => {
    await page.goto('http://localhost:4173')
    const total = await measureReRenders(page, 'neutro', '__neutroRenders')
    await attach(testInfo, 'neutro/form (React)', total)
    expect(total).toBeLessThanOrEqual(25)
  })

  test('react-hook-form', async ({ page }, testInfo) => {
    await page.goto('http://localhost:4173')
    const total = await measureReRenders(page, 'rhf', '__rhfRenders')
    await attach(testInfo, 'react-hook-form', total)
    expect(total).toBeLessThanOrEqual(500) // RHF Controller re-renders only the subscribed field
  })

  test('formik', async ({ page }, testInfo) => {
    await page.goto('http://localhost:4173')
    const total = await measureReRenders(page, 'formik', '__formikRenders')
    await attach(testInfo, 'formik', total)
    // Formik re-renders ALL fields on every change via context; 200 renders (20 keystrokes × 10 fields) is expected
    expect(total).toBeLessThanOrEqual(500)
  })

  test('tanstack-form (React)', async ({ page }, testInfo) => {
    await page.goto('http://localhost:4173')
    const total = await measureReRenders(page, 'tanstack', '__tanstackRenders')
    await attach(testInfo, 'tanstack-form (React)', total)
    expect(total).toBeLessThanOrEqual(500)
  })

  // ---- Vue (port 4174) ----
  test('neutro/form (Vue)', async ({ page }, testInfo) => {
    await page.goto('http://localhost:4174')
    const total = await measureReRenders(page, 'neutro', '__neutroRenders')
    await attach(testInfo, 'neutro/form (Vue)', total)
    expect(total).toBeLessThanOrEqual(25)
  })

  test('vee-validate', async ({ page }, testInfo) => {
    await page.goto('http://localhost:4174')
    const total = await measureReRenders(page, 'vee', '__veeRenders')
    await attach(testInfo, 'vee-validate', total)
    expect(total).toBeLessThanOrEqual(500)
  })

  // ---- Svelte (port 4175) ----
  test('neutro/form (Svelte)', async ({ page }, testInfo) => {
    await page.goto('http://localhost:4175')
    const total = await measureReRenders(page, 'neutro', '__neutroRenders')
    await attach(testInfo, 'neutro/form (Svelte)', total)
    expect(total).toBeLessThanOrEqual(25)
  })

  test('tanstack-form (Svelte)', async ({ page }, testInfo) => {
    await page.goto('http://localhost:4175')
    const total = await measureReRenders(page, 'tanstack', '__tanstackRenders')
    await attach(testInfo, 'tanstack-form (Svelte)', total)
    expect(total).toBeLessThanOrEqual(500)
  })

  test('felte', async ({ page }, testInfo) => {
    await page.goto('http://localhost:4175')
    const total = await measureReRenders(page, 'felte', '__felteRenders')
    await attach(testInfo, 'felte', total)
    expect(total).toBeLessThanOrEqual(500)
  })
})
