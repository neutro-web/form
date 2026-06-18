import { bench, describe } from 'vitest';
import { createForm } from '../src/index';

const initialValues = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`field${i}`, '']));

describe('set() overhead with path trie (dev mode)', () => {
  const form = createForm({ initialValues });

  bench('set() with 50-field form + trie check', () => {
    form.set('field0', 'x');
  });
});
