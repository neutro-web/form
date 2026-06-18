import { describe, expect, test } from 'vitest';
import { buildPathTrie, isKnownPath } from '../src/path-trie';

const initialValues = {
  email: '',
  address: { city: '', zip: '' },
  items: [{ name: '', qty: 0 }],
};

const trie = buildPathTrie(initialValues);

describe('path trie correctness matrix', () => {
  test('top-level scalar', () => expect(isKnownPath(trie, 'email')).toBe(true));
  test('nested object path', () => expect(isKnownPath(trie, 'address.city')).toBe(true));
  test('nested object path 2', () => expect(isKnownPath(trie, 'address.zip')).toBe(true));
  test('array element path', () => expect(isKnownPath(trie, 'items.0.name')).toBe(true));
  test('array element any index', () => expect(isKnownPath(trie, 'items.5.qty')).toBe(true));
  test('unknown top-level', () => expect(isKnownPath(trie, 'phone')).toBe(false));
  test('unknown nested', () => expect(isKnownPath(trie, 'address.country')).toBe(false));
  test('unknown array child', () => expect(isKnownPath(trie, 'items.0.weight')).toBe(false));
  test('non-numeric array index is invalid', () =>
    expect(isKnownPath(trie, 'items.foo.name')).toBe(false));

  test('after arrayAppend: new index is valid (any numeric index passes)', () => {
    // The trie treats any numeric index as valid under an array node.
    // This is correct post-append.
    expect(isKnownPath(trie, 'items.99.name')).toBe(true);
  });
});
