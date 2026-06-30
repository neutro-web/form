import { describe, test, expect, vi } from 'vitest'
import { createAdapter as neutroAdapter } from '../../adapters/neutro.js'

describe('async-race', () => {
  test('neutro/form', async () => {
    vi.useFakeTimers()
    let seq = 0
    const fixture = {
      initialValues: { email: '' },
      validator: async (values: any) => {
        const mine = ++seq
        // Stale (first) call resolves after fresh (second) call
        await new Promise(r => setTimeout(r, mine === 1 ? 60 : 10))
        return mine === 1 ? { email: 'stale' } : {}
      },
    }
    const adapter = neutroAdapter(fixture)
    const p1 = adapter.validate()
    const p2 = adapter.validate()
    await vi.runAllTimersAsync()
    await Promise.allSettled([p1, p2])
    vi.useRealTimers()
    // neutro/form's async epoch mechanism discards stale results
    expect(adapter.getErrors().email).toBeUndefined()
  })

  // test.skip produces status 'pending' in vitest JSON → normalizeCorrectnessJson maps to 'na'
  // This is correct: these libraries don't support async cancellation in their vanilla APIs.
  test.skip('tanstack-form', () => { /* no async cancellation API */ })
  test.skip('react-hook-form', () => { /* shim has no async cancellation */ })
  test.skip('formik', () => { /* shim has no async cancellation */ })
  test.skip('vee-validate', () => { /* shim has no async cancellation */ })
})
