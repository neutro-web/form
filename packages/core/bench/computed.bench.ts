import { bench, describe } from 'vitest'
import { createForm } from '../src/index'

describe('computed fields overhead', () => {
  const formNoComputed = createForm({ initialValues: { qty: 1, unitPrice: 10, total: 0 } })
  const formWithComputed = createForm({
    initialValues: { qty: 1, unitPrice: 10, total: 0 },
    computed: { total: (v) => (v as any).qty * (v as any).unitPrice },
  })

  bench('set() without computed (baseline)', () => { formNoComputed.set('qty', 2) })
  bench('set() with 1 computed field', () => { formWithComputed.set('qty', 2) })

  const form5 = createForm({
    initialValues: { a: 1, b: 1, c: 1, d: 1, e: 1, fa: 0, fb: 0, fc: 0, fd: 0, fe: 0 },
    computed: {
      fa: (v) => (v as any).a * 2,
      fb: (v) => (v as any).b * 2,
      fc: (v) => (v as any).c * 2,
      fd: (v) => (v as any).d * 2,
      fe: (v) => (v as any).e * 2,
    },
  })
  bench('set() with 5 independent computed fields', () => { form5.set('a', 2) })
})
