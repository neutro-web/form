import { FormApi } from '@tanstack/form-core'
import type { BenchAdapter, FormFixture, AdapterCapability } from './interface.js'

export function createAdapter(fixture: FormFixture): BenchAdapter {
  const form = new FormApi({
    defaultValues: fixture.initialValues as any,
  })
  form.mount()

  return {
    name: 'tanstack-form',
    capabilities: ['array-move'] as AdapterCapability[],

    set(path, value) {
      form.setFieldValue(path as any, value, { touch: false })
    },
    get(path) {
      return form.getFieldValue(path as any)
    },
    subscribeToPath(_path, fn) {
      // @tanstack/form-core has no per-path subscription; falls back to global store.
      // Shim: global subscription used for all path subscriptions.
      return form.store.subscribe(fn)
    },
    subscribeGlobal(fn) {
      return form.store.subscribe(fn)
    },
    async validate(_paths?) {
      await form.validate('change')
      const errors: Record<string, string> = {}
      const meta = (form.store.state as any).fieldMeta ?? {}
      for (const [key, m] of Object.entries(meta)) {
        const msgs = (m as any).errors
        if (msgs?.length) errors[key] = msgs[0]
      }
      return errors
    },
    arrayRemove(path, index) {
      form.removeFieldValue(path as any, index)
    },
    arrayMove(path, from, to) {
      form.moveFieldValues(path as any, from, to)
    },
    getErrors() {
      const errors: Record<string, string> = {}
      const meta = (form.store.state as any).fieldMeta ?? {}
      for (const [key, m] of Object.entries(meta)) {
        const msgs = (m as any).errors
        if (msgs?.length) errors[key] = msgs[0]
      }
      return errors
    },
    getTouched() {
      const touched: Record<string, boolean> = {}
      const meta = (form.store.state as any).fieldMeta ?? {}
      for (const [key, m] of Object.entries(meta)) {
        if ((m as any).isTouched) touched[key] = true
      }
      return touched
    },
  }
}
