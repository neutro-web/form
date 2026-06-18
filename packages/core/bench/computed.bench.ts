import { bench, describe } from 'vitest';
import { createForm } from '../src/index.js';

type SimpleForm = { qty: number; unitPrice: number; total: number };
type MultiForm = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  fa: number;
  fb: number;
  fc: number;
  fd: number;
  fe: number;
};

describe('computed fields overhead', () => {
  const formNoComputed = createForm({ initialValues: { qty: 1, unitPrice: 10, total: 0 } });
  const formWithComputed = createForm({
    initialValues: { qty: 1, unitPrice: 10, total: 0 },
    computed: { total: (v: SimpleForm) => v.qty * v.unitPrice },
  });

  bench('set() without computed (baseline)', () => {
    formNoComputed.set('qty', 2);
  });
  bench('set() with 1 computed field', () => {
    formWithComputed.set('qty', 2);
  });

  const form5 = createForm({
    initialValues: { a: 1, b: 1, c: 1, d: 1, e: 1, fa: 0, fb: 0, fc: 0, fd: 0, fe: 0 },
    computed: {
      fa: (v: MultiForm) => v.a * 2,
      fb: (v: MultiForm) => v.b * 2,
      fc: (v: MultiForm) => v.c * 2,
      fd: (v: MultiForm) => v.d * 2,
      fe: (v: MultiForm) => v.e * 2,
    },
  });
  bench('set() with 5 independent computed fields', () => {
    form5.set('a', 2);
  });
});
