import { test, expect, type Page, type TestInfo } from '@playwright/test'
import type { BrowserResult } from '../../types/schema.js'

async function measureCancellation(page: Page): Promise<boolean> {
  const input = page.getByTestId('async-email')
  await input.fill('slow@example.com') // kicks off 600ms validation, resolves valid (no error)
  await page.waitForTimeout(50) // let the slow validation start before overtyping
  await input.fill('fastbad') // kicks off 100ms validation, resolves invalid (error)
  await page.waitForTimeout(700) // wait past both validations (600ms + buffer)
  const errorVisible = await page.getByTestId('async-error').isVisible().catch(() => false)
  // Pass = error IS visible (fresh "fastbad" result won), fail = error is hidden (stale "slow" overwrote it)
  return errorVisible
}

async function runCancellationTest(page: Page, testInfo: TestInfo, url: string, library: string) {
  await page.goto(url)
  const cancellationPass = await measureCancellation(page)
  const result: BrowserResult = { library, status: 'ok', cancellationPass }
  await testInfo.attach('result', { body: JSON.stringify(result), contentType: 'application/json' })
}

test.describe('async-cancellation', () => {
  test('neutro/form (React)',       async ({ page }, i) => runCancellationTest(page, i, 'http://localhost:4173/cancel/neutro',   'neutro/form (React)'))
  test('react-hook-form',           async ({ page }, i) => runCancellationTest(page, i, 'http://localhost:4173/cancel/rhf',       'react-hook-form'))
  test('formik',                    async ({ page }, i) => runCancellationTest(page, i, 'http://localhost:4173/cancel/formik',    'formik'))
  test('tanstack-form (React)',     async ({ page }, i) => runCancellationTest(page, i, 'http://localhost:4173/cancel/tanstack',  'tanstack-form (React)'))
  test('neutro/form (Vue)',         async ({ page }, i) => runCancellationTest(page, i, 'http://localhost:4174/cancel/neutro',    'neutro/form (Vue)'))
  test('vee-validate',              async ({ page }, i) => runCancellationTest(page, i, 'http://localhost:4174/cancel/vee',       'vee-validate'))
  test('neutro/form (Svelte)',      async ({ page }, i) => runCancellationTest(page, i, 'http://localhost:4175/cancel/neutro',    'neutro/form (Svelte)'))
  test('tanstack-form (Svelte)',    async ({ page }, i) => runCancellationTest(page, i, 'http://localhost:4175/cancel/tanstack',  'tanstack-form (Svelte)'))
  test('felte',                     async ({ page }, i) => runCancellationTest(page, i, 'http://localhost:4175/cancel/felte',     'felte'))
})
