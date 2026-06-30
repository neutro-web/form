import { describe, test, expect } from 'vitest'
import { createAdapter as neutroAdapter } from '../../adapters/neutro.js'

describe('dependency-trigger', () => {
  test('neutro/form', async () => {
    const adapter = neutroAdapter({
      initialValues: { a: '', b: '', c: '' },
      dependencies: { a: ['b', 'c'] },
      validator: async (values: any) => {
        // Validator returns an error for 'b' whenever 'a' has the trigger value.
        // Dependency scope expansion means validating 'a' also validates 'b'.
        if (values.a === 'trigger') return { b: 'triggered-by-a' }
        return {}
      },
    })

    adapter.set('a', 'trigger')
    await adapter.validate(['a'])

    // 'b' was not directly validated, but it's in 'a's dependency scope.
    // The error on 'b' proves the scope was expanded.
    expect(adapter.getErrors()['b']).toBe('triggered-by-a')
  })

  test.skip('tanstack-form', () => { /* requires per-field validators; no declarative dep graph */ })
  test.skip('react-hook-form', () => { /* shim */ })
  test.skip('formik', () => { /* shim */ })
  test.skip('vee-validate', () => { /* shim */ })
})
