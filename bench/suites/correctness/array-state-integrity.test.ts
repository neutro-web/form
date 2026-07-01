import { describe, test, expect } from 'vitest'
import { createAdapter as neutroAdapter } from '../../adapters/neutro.js'

describe('array-state-integrity', () => {
  test('neutro/form', async () => {
    const adapter = neutroAdapter({
      initialValues: { items: [{ v: 'a' }, { v: 'b' }, { v: 'c' }] },
      validator: async (values: any) => {
        const errs: Record<string, string> = {}
        for (let i = 0; i < values.items.length; i++) {
          if (values.items[i].v === 'b') errs[`items.${i}.v`] = 'invalid'
        }
        return errs
      },
    })
    // Validate to establish errors at items.1.v
    await adapter.validate()
    expect(adapter.getErrors()['items.1.v']).toBe('invalid')

    // Remove item at index 0; items.1 becomes items.0, items.2 becomes items.1
    adapter.arrayRemove('items', 0)

    // Error should now be at items.0.v, not items.1.v
    expect(adapter.getErrors()['items.0.v']).toBe('invalid')
    expect(adapter.getErrors()['items.1.v']).toBeUndefined()
  })

  test.skip('tanstack-form', () => { /* no public API to rekey per-field error/touched state on array splice outside React context */ })
  test.skip('react-hook-form', () => { /* state-map rekey on splice not exposed outside hook context */ })
  test.skip('formik', () => { /* state-map rekey on splice not exposed outside hook context */ })
  test.skip('vee-validate', () => { /* state-map rekey on splice not exposed outside composable context */ })
})
