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
type ChainForm = { a: number; b: number; c: number; d: number; e: number };

describe('computed fields overhead', () => {
  const formNoComputed = createForm<SimpleForm>({
    initialValues: { qty: 1, unitPrice: 10, total: 0 },
  });

  const formWithComputed = createForm<SimpleForm>({
    initialValues: { qty: 1, unitPrice: 10, total: 0 },
    computed: { total: { fn: (v) => v.qty * v.unitPrice } },
  });

  const form5 = createForm<MultiForm>({
    initialValues: { a: 1, b: 1, c: 1, d: 1, e: 1, fa: 0, fb: 0, fc: 0, fd: 0, fe: 0 },
    computed: {
      fa: { fn: (v) => v.a * 2 },
      fb: { fn: (v) => v.b * 2 },
      fc: { fn: (v) => v.c * 2 },
      fd: { fn: (v) => v.d * 2 },
      fe: { fn: (v) => v.e * 2 },
    },
  });

  const formChain = createForm<ChainForm>({
    initialValues: { a: 1, b: 0, c: 0, d: 0, e: 0 },
    computed: {
      b: { fn: (v) => v.a * 2 },
      c: { fn: (v) => v.b + 1 },
      d: { fn: (v) => v.c * 3 },
      e: { fn: (v) => v.d - 1 },
    },
  });

  bench('set() without computed (baseline)', () => {
    formNoComputed.set('qty', 2);
  });

  bench('set() with 1 computed field (pass limit: 5)', () => {
    formWithComputed.set('qty', 2);
  });

  bench('set() with 5 independent computed fields', () => {
    form5.set('a', 2);
  });

  bench('set() with 4-deep A→B→C→D→E chain', () => {
    formChain.set('a', 2);
  });
});
