import { describe, test, expect } from 'vitest'
import { createForm } from '@neutro/form-core'

describe('validation-scope-precision', () => {
  test('neutro/form', async () => {
    const totalFields = 504 // trigger + 3 dependents + 500 unrelated
    const initialValues: Record<string, number> = { trigger: 0, dependent1: 0, dependent2: 0, dependent3: 0 }
    for (let i = 0; i < 500; i++) initialValues[`unrelated${i}`] = 0

    let lastScopeSize = -1
    const form = createForm({
      initialValues,
      dependencies: { trigger: ['dependent1', 'dependent2', 'dependent3'] },
      validator: async (_values, scopePaths) => {
        lastScopeSize = scopePaths?.length ?? -1
        return {}
      },
    })

    expect(Object.keys(initialValues)).toHaveLength(totalFields)

    await form.set('trigger', 1, { validate: true })

    // Verified against compileDependencyScopes: the changed field is included in its
    // own precomputed scope (resolveTransitiveClosure adds the seed path to `visited`
    // before resolving dependents), so the expected scope is trigger + 3 dependents = 4,
    // not the 504 total fields in the form.
    expect(lastScopeSize).toBe(4)
  })
})
