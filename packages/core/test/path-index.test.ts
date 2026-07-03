import { describe, expect, it } from 'vitest';
import { createForm } from '../src/index';

function candidates(form: ReturnType<typeof createForm>, prefix: string): string[] {
  return Array.from(form._debugPathIndex().get(prefix) ?? []).sort();
}

describe('pathIndex — indexKey/unindexKey', () => {
  it('indexes a key under every ancestor prefix, not under itself', () => {
    const form = createForm({ initialValues: {} });
    form._debugIndexKey('items.3.address.city');
    expect(candidates(form, 'items')).toEqual(['items.3.address.city']);
    expect(candidates(form, 'items.3')).toEqual(['items.3.address.city']);
    expect(candidates(form, 'items.3.address')).toEqual(['items.3.address.city']);
    expect(form._debugPathIndex().has('items.3.address.city')).toBe(false);
  });

  it('a top-level key with no dot is never indexed', () => {
    const form = createForm({ initialValues: {} });
    form._debugIndexKey('name');
    expect(form._debugPathIndex().size).toBe(0);
  });

  it('unindexKey removes a key with refcount 1 from every ancestor prefix', () => {
    const form = createForm({ initialValues: {} });
    form._debugIndexKey('items.3.city');
    form._debugUnindexKey('items.3.city');
    expect(form._debugPathIndex().has('items')).toBe(false);
    expect(form._debugPathIndex().has('items.3')).toBe(false);
  });

  it('a key indexed twice (shared by two structures) survives one unindex', () => {
    const form = createForm({ initialValues: {} });
    form._debugIndexKey('items.3.city'); // e.g. errors
    form._debugIndexKey('items.3.city'); // e.g. pathSubscribers
    form._debugUnindexKey('items.3.city'); // errors cleared
    expect(candidates(form, 'items')).toEqual(['items.3.city']); // still held by pathSubscribers
    form._debugUnindexKey('items.3.city'); // pathSubscribers cleared too
    expect(form._debugPathIndex().has('items')).toBe(false);
  });

  it('an empty prefix map is removed once its last key is unindexed', () => {
    const form = createForm({ initialValues: {} });
    form._debugIndexKey('a.b');
    form._debugIndexKey('a.c');
    expect(form._debugPathIndex().has('a')).toBe(true);
    form._debugUnindexKey('a.b');
    expect(form._debugPathIndex().has('a')).toBe(true); // "a.c" still there
    form._debugUnindexKey('a.c');
    expect(form._debugPathIndex().has('a')).toBe(false);
  });

  it('unindexKey on a never-indexed key is a safe no-op', () => {
    const form = createForm({ initialValues: {} });
    expect(() => form._debugUnindexKey('never.indexed')).not.toThrow();
    expect(form._debugPathIndex().size).toBe(0);
  });
});

describe('pathIndex — wasSet call sites', () => {
  it('setFieldValue indexes wasSet writes under the field prefix', () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    form.set('items.0.name', 'b');
    expect(candidates(form, 'items')).toContain('items.0.name');
  });

  it('resetField unindexes wasSet entries for the reset field', () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    form.set('items.0.name', 'b');
    form.resetField('items.0.name' as any);
    expect(candidates(form, 'items')).not.toContain('items.0.name');
  });

  it('arrayInsert marks the array root as wasSet without desyncing pathIndex', () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }, { name: 'b' }] } });
    expect(() => form.arrayInsert('items' as any, 1, { name: 'c' } as any)).not.toThrow();
    expect(form.isFieldDirty('items' as any)).toBe(true);
  });
});

describe('pathIndex — dirty call sites', () => {
  it('setFieldValue indexes a dirty write', () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    form.set('items.0.name', 'changed');
    expect(candidates(form, 'items')).toContain('items.0.name');
  });

  it('setting a value back to its initial value deletes dirty and unindexes it', () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    form.set('items.0.name', 'changed');
    form.set('items.0.name', 'a'); // back to initial -> dirty[path] deleted
    // wasSet still holds 'items.0.name' (Task 2), so the key must still be indexed —
    // this exercises the refcount, not a full eviction.
    expect(candidates(form, 'items')).toContain('items.0.name');
  });

  it('resetField unindexes dirty entries for the reset field', () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    form.set('items.0.name', 'changed');
    form.resetField('items.0.name' as any);
    expect(candidates(form, 'items')).not.toContain('items.0.name');
  });
});
