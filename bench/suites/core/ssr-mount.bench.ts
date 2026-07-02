import { bench, describe, expect, test } from 'vitest'
import { createForm } from '@neutro/form-core'
import { largeFixture } from '../../fixtures/large.js'

describe('ssr-mount', () => {
  test('createForm() does not throw when window/document are undefined', () => {
    expect(typeof window).toBe('undefined')
    expect(typeof document).toBe('undefined')
    expect(() => createForm({ initialValues: largeFixture.initialValues })).not.toThrow()
  })

  bench('neutro/form', () => {
    const form = createForm({ initialValues: largeFixture.initialValues })
    form.getState()
  })
})
