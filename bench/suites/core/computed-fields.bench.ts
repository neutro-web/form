import { bench, describe } from 'vitest'
import { createForm } from '@neutro/form-core'

// Neutro uses createForm directly here to access the computed: config which is
// not part of the BenchAdapter interface (it is a neutro-specific feature).
const neutroForm = createForm({
  initialValues: { qty: 1, unitPrice: 10, total: 0 },
  computed: { total: { fn: (v: any) => v.qty * v.unitPrice } },
})

describe('computed-fields/simple', () => {
  bench('neutro/form', () => { neutroForm.set('qty', 2) })
})
