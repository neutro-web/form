import { createForm } from '@neutro/form-core'
import type { BenchAdapter, FormFixture, AdapterCapability } from './interface.js'

export function createAdapter(fixture: FormFixture): BenchAdapter {
  const form = createForm({
    initialValues: fixture.initialValues,
    dependencies: fixture.dependencies,
    validators: fixture.validator
      ? { onChange: async ({ value }) => fixture.validator!(value) }
      : undefined,
  })

  return {
    name: 'neutro/form',
    capabilities: [
      'path-subscriptions',
      'scoped-validation',
      'array-move',
      'cross-field-deps',
      'async-cancellation',
    ] as AdapterCapability[],

    set(path, value) {
      form.set(path as any, value)
    },
    get(path) {
      return form.get(path as any)
    },
    subscribeToPath(path, fn) {
      return form.subscribeToPath(path as any, fn)
    },
    subscribeGlobal(fn) {
      return form.subscribe(fn)
    },
    async validate(paths?) {
      await form.validate(paths as any)
      return form.getState().errors
    },
    arrayRemove(path, index) {
      form.arrayRemove(path as any, index)
    },
    arrayMove(path, from, to) {
      form.arrayMove(path as any, from, to)
    },
    getErrors() {
      return form.getState().errors
    },
    getTouched() {
      return form.getState().touched
    },
  }
}
