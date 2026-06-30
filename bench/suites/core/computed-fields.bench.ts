import { bench, describe } from 'vitest'
import { createForm } from '@neutro/form-core'
import { createAdapter as tanstackAdapter } from '../../adapters/tanstack.js'
import { createAdapter as rhfAdapter } from '../../adapters/rhf.js'
import { createAdapter as formikAdapter } from '../../adapters/formik.js'
import { createAdapter as veeAdapter } from '../../adapters/vee-validate.js'
import type { BenchAdapter } from '../../adapters/interface.js'

// Neutro uses createForm directly here to access the computed: config which is
// not part of the BenchAdapter interface (it is a neutro-specific feature).
const neutroForm = createForm({
  initialValues: { qty: 1, unitPrice: 10, total: 0 },
  computed: { total: { fn: (v: any) => v.qty * v.unitPrice } },
})

function makeShimAdapterWithComputed(name: string): BenchAdapter {
  const values: Record<string, any> = { qty: 1, unitPrice: 10, total: 0 }
  const subscribers = new Set<() => void>()
  const base: BenchAdapter = {
    name,
    capabilities: [],
    set(path, value) {
      values[path] = value
      values['total'] = values['qty'] * values['unitPrice']
      subscribers.forEach(fn => fn())
    },
    get(path) { return values[path] },
    subscribeToPath(_p, fn) { subscribers.add(fn); return () => subscribers.delete(fn) },
    subscribeGlobal(fn) { subscribers.add(fn); return () => subscribers.delete(fn) },
    async validate() { return {} },
    arrayRemove() {},
    arrayMove() {},
    getErrors() { return {} },
    getTouched() { return {} },
  }
  return base
}

const all = process.env.BENCH_ALL === 'true'

describe('computed-fields/simple', () => {
  bench('neutro/form', () => { neutroForm.set('qty', 2) })

  if (all) {
    const tanstack = tanstackAdapter({ initialValues: { qty: 1, unitPrice: 10, total: 0 } })
    bench('tanstack-form (manual recompute)', () => {
      tanstack.set('qty', 2)
      tanstack.set('total', tanstack.get('qty') * tanstack.get('unitPrice'))
    })

    const rhf = makeShimAdapterWithComputed('react-hook-form (shim+recompute)')
    bench(rhf.name, () => { rhf.set('qty', 2) })

    const formikShim = makeShimAdapterWithComputed('formik (shim+recompute)')
    bench(formikShim.name, () => { formikShim.set('qty', 2) })

    const veeShim = makeShimAdapterWithComputed('vee-validate (shim+recompute)')
    bench(veeShim.name, () => { veeShim.set('qty', 2) })
  }
})
