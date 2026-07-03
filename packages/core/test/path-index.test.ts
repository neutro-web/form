// @vitest-environment jsdom
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
    form.set('items.0.name', 'changed'); // real refcount for the key is now 2: one
    // claim from wasSet's indexKey call, one from dirty's indexKey call (see the
    // "setFieldValue indexes a dirty write" test above).
    //
    // resetField's dirty-clearing loop and wasSet-clearing loop are gated by the
    // same `!options?.keepDirty` condition, so a plain reset here can't clear one
    // without the other — asserting mere absence afterward would pass even if
    // dirty's own unindexKey(k) call were deleted, because wasSet's decrement alone
    // (2 -> 1) wouldn't be enough to fully evict the key, UNLESS a bug elsewhere
    // masked that. To make the assertion depend on *both* decrements actually
    // firing, add a third synthetic claim first so the refcount starts at 3.
    form._debugIndexKey('items.0.name');
    form.resetField('items.0.name' as any);
    // If both the dirty and wasSet loops fired their unindexKey call (3 -> 1), the
    // key must still be present, held up solely by the synthetic claim.
    expect(candidates(form, 'items')).toContain('items.0.name');
    // Draining the synthetic claim should now fully zero the refcount. If dirty's
    // unindexKey(k) call had been dropped from resetField, only one real decrement
    // (wasSet's) would have fired above (3 -> 2), and this final drain (2 -> 1)
    // would leave the key still indexed — failing this assertion.
    form._debugUnindexKey('items.0.name');
    expect(candidates(form, 'items')).not.toContain('items.0.name');
  });
});

describe('pathIndex — touched call sites', () => {
  it('setFieldValue with touch:true indexes the touched write', () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    form.set('items.0.name', 'b', { touch: true });
    expect(candidates(form, 'items')).toContain('items.0.name');
  });

  it('submit() marks every path touched and indexes them', async () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    await form.submit(() => {});
    expect(candidates(form, 'items')).toContain('items.0.name');
  });

  it('resetField unindexes touched entries for the reset field', () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    // Touch the field via connect()'s blur handler rather than form.set(), so the
    // ONLY structure claiming this key in the pathIndex is `touched` — form.set()
    // would also claim it via wasSet and (if the value changed) dirty, and since
    // resetField's default options clear all three together, an absence check
    // afterward could pass even if touched's own unindexKey call were missing,
    // masked by wasSet/dirty's independent decrements (the same trap that hit the
    // Task 3 dirty test). Using blur-only touch means resetField's touched-clearing
    // loop is the sole thing that can zero this key's refcount.
    const input = document.createElement('input');
    const disconnect = form.connect('items.0.name' as any, input);
    input.dispatchEvent(new Event('blur'));
    expect(candidates(form, 'items')).toContain('items.0.name');
    form.resetField('items.0.name' as any);
    expect(candidates(form, 'items')).not.toContain('items.0.name');
    disconnect();
  });

  it('setErrors touching paths indexes them', () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    form.setErrors({ 'items.0.name': 'bad' });
    expect(candidates(form, 'items')).toContain('items.0.name');
  });
});

describe('pathIndex — errors call sites', () => {
  it('setErrors indexes the error write', () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    form.setErrors({ 'items.0.name': 'bad' });
    expect(candidates(form, 'items')).toContain('items.0.name');
  });

  it('clearErrors unindexes every cleared error', async () => {
    // setErrors() also marks the path `touched`, which claims its own independent
    // refcount slot in pathIndex — clearErrors() only ever clears `errors`, so
    // asserting mere absence after setErrors()+clearErrors() would still pass
    // even if clearErrors' own unindexKey call were deleted, masked by touched's
    // untouched claim. Populate the error via a rules-based validate() instead,
    // which writes to `errors` only and never touches `touched`, so clearErrors'
    // unindexKey call is the sole thing that can zero this key's refcount.
    const form = createForm({
      initialValues: { items: [{ name: '' }] },
      rules: { 'items.0.name': 'required' } as any,
    });
    await form.validate();
    expect(candidates(form, 'items')).toContain('items.0.name');
    expect(form.getState().touched['items.0.name' as any]).toBeUndefined();
    form.clearErrors();
    // Task 6 note: the validate() call above also adds a validatedPaths claim
    // on this key (clearErrors only clears `errors`, not `validatedPaths`), so
    // drain that claim too before asserting clearErrors' own contribution.
    form._debugUnindexKey('items.0.name');
    expect(candidates(form, 'items')).not.toContain('items.0.name');
  });

  it('resetField unindexes an error for the reset field', () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    form.setErrors({ 'items.0.name': 'bad' });
    form.resetField('items.0.name' as any);
    expect(candidates(form, 'items')).not.toContain('items.0.name');
  });

  it('runValidation indexes errors produced by config.rules and unindexes cleared ones', async () => {
    const form = createForm({
      initialValues: { items: [{ name: '' }] },
      rules: { 'items.0.name': 'required' } as any,
    });
    await form.validate();
    expect(candidates(form, 'items')).toContain('items.0.name');
    // Fixing the value via set() also claims this key for `wasSet` and `dirty`
    // (Task 2), so after the error clears, those two independent claims alone
    // would keep the key in pathIndex — an absence check here would pass even
    // if runValidation's reindexErrors() call were deleted entirely, masked by
    // wasSet/dirty. Drain exactly those two known claims after validating, so
    // only reindexErrors' own unindexKey call can zero the remainder.
    //
    // Task 6 note: each full validate() call also unconditionally re-indexes
    // every extracted path into `validatedPaths` (matching the existing
    // unconditional-reindex pattern used by wasSet/dirty/touched), so the two
    // validate() calls above (initial + post-fix) each add one more claim on
    // top of the wasSet/dirty ones. Drain those two claims as well so the
    // remaining count reflects reindexErrors' own unindexKey call alone.
    form.set('items.0.name', 'filled');
    await form.validate();
    form._debugUnindexKey('items.0.name'); // drains wasSet's claim
    form._debugUnindexKey('items.0.name'); // drains dirty's claim
    form._debugUnindexKey('items.0.name'); // drains validatedPaths' claim from the 1st validate()
    form._debugUnindexKey('items.0.name'); // drains validatedPaths' claim from the 2nd validate()
    expect(candidates(form, 'items')).not.toContain('items.0.name');
  });

  it('runValidation with a scoped validate only reindexes within the diff, leaving unrelated errors indexed', async () => {
    const form = createForm({
      initialValues: { items: [{ name: '' }], other: [{ label: '' }] },
      rules: {
        'items.0.name': 'required',
        'other.0.label': 'required',
      } as any,
    });
    await form.validate();
    expect(candidates(form, 'items')).toContain('items.0.name');
    expect(candidates(form, 'other')).toContain('other.0.label');
    // See the isolation note above: draining wasSet's and dirty's claims after
    // the scoped validate isolates reindexErrors' own unindexKey contribution.
    // Task 6 note: the initial full validate() and the scoped validate() each
    // add one more validatedPaths claim on 'items.0.name' (see the isolation
    // note in the previous test), so drain those two as well.
    form.set('items.0.name', 'filled');
    await form.validate(['items.0.name'] as any);
    form._debugUnindexKey('items.0.name');
    form._debugUnindexKey('items.0.name');
    form._debugUnindexKey('items.0.name'); // drains validatedPaths' claim from the full validate()
    form._debugUnindexKey('items.0.name'); // drains validatedPaths' claim from the scoped validate()
    expect(candidates(form, 'items')).not.toContain('items.0.name');
    expect(candidates(form, 'other')).toContain('other.0.label'); // untouched by the scoped run
  });
});

describe('pathIndex — validatedPaths call sites', () => {
  it('a full validate() with no validator/rules indexes every extracted path', async () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    await form.validate();
    expect(candidates(form, 'items')).toContain('items.0.name');
  });

  it('a scoped validate() indexes only the scoped path', async () => {
    const form = createForm({
      initialValues: { items: [{ name: 'a' }], other: [{ label: 'b' }] },
      rules: { 'items.0.name': 'required' } as any,
    });
    await form.validate(['items.0.name'] as any);
    expect(candidates(form, 'items')).toContain('items.0.name');
  });

  it('resetField unindexes a validatedPaths entry for the reset field', async () => {
    // No validator/rules, so runValidation's early-return branch only ever
    // calls validatedPaths.add()/indexKey() — no wasSet/dirty/touched/errors
    // claim is placed on this path — so validatedPaths is the sole claimant
    // and this absence check is not masked by another structure's claim.
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    await form.validate();
    form.resetField('items.0.name' as any);
    expect(candidates(form, 'items')).not.toContain('items.0.name');
  });
});
