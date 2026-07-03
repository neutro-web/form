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
    // Task 7 wired subscribeToPath's own first-subscribe indexKey call, and
    // connect() internally holds a subscribeToPath subscription (for a11y sync)
    // for as long as it stays connected — so the key remains indexed by that
    // claim alone until disconnect() releases it.
    expect(candidates(form, 'items')).toContain('items.0.name');
    disconnect();
    expect(candidates(form, 'items')).not.toContain('items.0.name');
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

describe('pathIndex — bulk-clear sites', () => {
  it('reset() unindexes every errors/touched/dirty/wasSet/validatedPaths entry, but leaves pathSubscribers-only entries indexed', async () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    const unsub = form.subscribeToPath('items.0.name' as any, () => {});
    form.set('items.0.name', 'changed', { touch: true });
    await form.validate();
    expect(candidates(form, 'items')).toContain('items.0.name');
    form.reset();
    // pathSubscribers still holds a live subscription on this path -> must remain indexed.
    expect(candidates(form, 'items')).toContain('items.0.name');
    unsub();
    // now nothing holds it -> fully unindexed.
    expect(candidates(form, 'items')).not.toContain('items.0.name');
  });

  it('reset() with nothing else referencing the path fully unindexes it', () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    form.set('items.0.name', 'changed', { touch: true });
    expect(candidates(form, 'items')).toContain('items.0.name');
    form.reset();
    expect(candidates(form, 'items')).not.toContain('items.0.name');
  });

  it('hydrate() unindexes errors/touched/dirty entries it clears (no wasSet/validatedPaths involved)', async () => {
    let stored: any = { items: [{ name: 'a' }] };
    const form = createForm({
      initialValues: { items: [{ name: 'a' }] },
      persistence: {
        adapter: {
          read: async () => stored,
          write: async (v: any) => {
            stored = v;
          },
          clear: async () => {
            stored = null;
          },
        },
      } as any,
    });
    form.setErrors({ 'items.0.name': 'bad' });
    expect(candidates(form, 'items')).toContain('items.0.name');
    await form.hydrate();
    expect(candidates(form, 'items')).not.toContain('items.0.name');
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

describe('pathIndex — pathSubscribers call sites', () => {
  it('subscribeToPath indexes the path on first subscriber', () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    const unsub = form.subscribeToPath('items.0.name' as any, () => {});
    expect(candidates(form, 'items')).toContain('items.0.name');
    unsub();
  });

  it('a second subscriber on the same path does not double-index (refcount stays correct)', () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    const unsub1 = form.subscribeToPath('items.0.name' as any, () => {});
    const unsub2 = form.subscribeToPath('items.0.name' as any, () => {});
    unsub1(); // one subscriber removed, one remains -> still indexed
    expect(candidates(form, 'items')).toContain('items.0.name');
    unsub2(); // last subscriber removed -> unindexed
    expect(candidates(form, 'items')).not.toContain('items.0.name');
  });

  it('subscribeToPathDynamic indexes on first subscriber and unindexes on last unsubscribe', () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    const unsub = form.subscribeToPathDynamic('items.0.name', () => {});
    expect(candidates(form, 'items')).toContain('items.0.name');
    unsub();
    expect(candidates(form, 'items')).not.toContain('items.0.name');
  });

  it('the wildcard "*" subscription is never indexed (no-dot key)', () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    const unsub = form.subscribeToPath('*', () => {});
    expect(form._debugPathIndex().size).toBe(0);
    unsub();
  });
});

describe('pathIndex — destroy()', () => {
  it('destroy() releases the pathSubscribers claim on a key, letting it become fully unindexed once errors is also cleared', async () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    form.subscribeToPath('items.0.name' as any, () => {}); // claim #1: pathSubscribers
    // setErrors() places two claims of its own (see "setErrors touching paths
    // indexes them" above): one on `errors`, one on `touched`. clearErrors()
    // only ever releases the `errors` claim, so drain the `touched` claim
    // synthetically below — otherwise it would mask destroy()'s own release
    // of claim #1 by keeping the key indexed regardless of whether destroy()
    // correctly called unindexKey.
    form.setErrors({ 'items.0.name': 'bad' }); // claim #2: errors, claim #3: touched
    form.destroy(); // should release claim #1 (pathSubscribers), leaving claims #2/#3
    expect(candidates(form, 'items')).toContain('items.0.name'); // errors/touched claims still hold it
    form.clearErrors(); // release claim #2 (errors)
    form._debugUnindexKey('items.0.name'); // release claim #3 (touched)
    expect(candidates(form, 'items')).not.toContain('items.0.name'); // fully released now
  });
});

describe('shiftStateIndices — candidate-lookup correctness', () => {
  it('arrayRemove shifts EVERY affected index correctly (not just one) and preserves exact state counts', async () => {
    // Deviation from the brief's original draft (see task-10-report.md for full
    // rationale): no `rules`/`validator` config is used here. arrayRemove always
    // ends with an unconditional `runValidation([targetPath])` call (pre-existing
    // behavior, not part of this task); with real rules configured that revalidates
    // every literal rule path under 'items' and re-populates validatedPaths using
    // the OLD (pre-shift) literal path names, which stomps on and masks the exact
    // count invariants this test wants to isolate. With no rules/validator, the
    // config-free branch of runValidation only ever adds the exact scope path
    // passed to it ('items', already tracked) and never touches per-field paths,
    // so shiftStateIndices's own validatedPaths bookkeeping is what's being
    // observed here, not incidental revalidation noise.
    const form = createForm({
      initialValues: {
        items: [{ name: '' }, { name: 'b' }, { name: 'c' }, { name: 'd' }, { name: 'e' }],
        unrelatedField1: 'x',
        unrelatedField2: 'y',
      },
    });
    // Give every index a distinguishable dirty/touched/wasSet footprint so a
    // shift bug affecting any single index is individually detectable.
    for (let i = 1; i <= 4; i++) {
      form.set(`items.${i}.name` as any, `changed-${i}`, { touch: true });
    }
    // Seed a genuine error at index 0 directly (no rules engine involved) so the
    // count-invariant assertions below depend on there being a real error to
    // drop when index 0 is removed. setErrors() also marks the path touched
    // (see its implementation) — accounted for in the touched-count assertion.
    form.setErrors({ 'items.0.name': 'Required' } as any);
    // With no rules/validator configured, validate() takes the no-op branch and
    // just walks extractAllPaths(values), populating validatedPaths for every
    // real path in `values` (both the array-item object path `items.N` and its
    // leaf `items.N.name`) — giving a full, deterministic baseline unaffected by
    // rule-engine revalidation.
    await form.validate();
    const before = form._debugRawState();
    const beforeErrorCount = Object.keys(before.errors).length;
    const beforeTouchedCount = Object.keys(before.touched).length;
    const beforeDirtyCount = Object.keys(before.dirty).length;
    const beforeWasSetCount = Object.keys(before.wasSet).length;
    const beforeValidatedCount = before.validatedPaths.length;

    form.arrayRemove('items' as any, 0); // every remaining index (1-4) shifts down by 1

    // Every shifted item's value AND its touched/dirty footprint followed it.
    expect(form.get('items.0.name' as any)).toBe('changed-1');
    expect(form.get('items.1.name' as any)).toBe('changed-2');
    expect(form.get('items.2.name' as any)).toBe('changed-3');
    expect(form.get('items.3.name' as any)).toBe('changed-4');
    for (let i = 0; i <= 3; i++) {
      expect(form.isFieldDirty(`items.${i}.name` as any)).toBe(true);
    }

    // Exact count invariants: removing index 0 should drop exactly the removed
    // index's tracked entries and leave every other entry's COUNT unchanged
    // (renamed, not duplicated or dropped) — a too-narrow or too-broad
    // candidate set would change these counts even if the specific assertions
    // above happen to still look right.
    const after = form._debugRawState();
    // Index 0's touched entry (set by setErrors above) is genuinely dropped;
    // every other touched entry (indices 1-4) is renamed, not duplicated/lost.
    expect(Object.keys(after.touched).length).toBe(beforeTouchedCount - 1);
    expect(Object.keys(after.dirty).length).toBe(beforeDirtyCount); // no dirty state on removed index 0
    // arrayRemove unconditionally marks the array root itself as wasSet
    // (`wasSet[targetPath] = true` at the top of arrayRemove, pre-existing
    // behavior unrelated to shiftStateIndices) — so the count grows by
    // exactly one for that root marker, on top of the unchanged per-index
    // entries carried over by the shift.
    expect(Object.keys(after.wasSet).length).toBe(beforeWasSetCount + 1); // no wasSet state on removed index 0 beyond the array-root marker
    expect(Object.keys(after.errors).length).toBe(beforeErrorCount - 1); // index 0's error is dropped, not orphaned
    // Index 0 contributes TWO tracked validatedPaths entries (the array-item
    // object path 'items.0' AND its leaf 'items.0.name'), both dropped on removal.
    expect(after.validatedPaths.length).toBe(beforeValidatedCount - 2);
  });

  it('arrayRemove leaves state below the removed index completely untouched', async () => {
    const form = createForm({
      initialValues: { items: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] },
    });
    form.set('items.0.name' as any, 'unaffected', { touch: true });
    const before = form._debugRawState();
    form.arrayRemove('items' as any, 2); // remove the LAST index; index 0 must not move or be touched
    const after = form._debugRawState();
    expect(after.touched['items.0.name']).toBe(before.touched['items.0.name']);
    expect(after.dirty['items.0.name']).toBe(before.dirty['items.0.name']);
    expect(form.get('items.0.name' as any)).toBe('unaffected');
  });

  it('arrayInsert correctly shifts state up and leaves unrelated fields alone', () => {
    const form = createForm({
      initialValues: { items: [{ name: 'a' }, { name: 'b' }], other: 'unchanged' },
    });
    form.set('items.1.name', 'b-touched', { touch: true });
    form.arrayInsert('items' as any, 0, { name: 'new' } as any);
    expect(form.get('items.2.name' as any)).toBe('b-touched');
    expect(form.get('other' as any)).toBe('unchanged');
  });

  it('pathIndex candidates for the array prefix shrink to zero once all array state is cleared', async () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }] } });
    form.set('items.0.name', 'changed', { touch: true });
    expect(candidates(form, 'items').length).toBeGreaterThan(0);
    form.arrayRemove('items' as any, 0);
    expect(candidates(form, 'items').length).toBe(0);
  });
});

describe('rekeyArrayState (arrayMove) — candidate-lookup correctness', () => {
  it('arrayMove correctly moves touched/dirty/wasSet and updates pathIndex, ignoring unrelated fields', () => {
    // Note: deliberately does NOT call form.validate() with no scope here. A full
    // (unscoped) validate() walks and indexes every path in `values` into
    // validatedPaths (see runValidation's `extractAllPaths(values)` fallback),
    // which would make the shared pathIndex candidate list for 'items' reflect
    // ALL three items regardless of which one was actually touched - contaminating
    // this test's "only the moved item's state should follow it" assertion, since
    // a full permutation of a fully-validated 3-item array keeps every index
    // occupied (by a different item's content) after the move. Keeping this test
    // scoped to only touched/dirty/wasSet (state that's set via form.set, not a
    // form-wide validate) isolates the assertion to what rekeyArrayState actually
    // controls for the single item that moved.
    const form = createForm({
      initialValues: {
        items: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
        unrelated: 'x',
      },
    });
    form.set('items.0.name', '', { touch: true });
    expect(candidates(form, 'items')).toContain('items.0.name');
    form.arrayMove('items' as any, 0, 2); // 'a' (with its touched/dirty state) moves to index 2
    expect(form.get('items.2.name' as any)).toBe('');
    expect(candidates(form, 'items')).not.toContain('items.0.name');
    expect(candidates(form, 'items')).toContain('items.2.name');
    expect(form.getState().touched['items.2.name']).toBe(true);
    expect(form.getState().touched['items.0.name']).toBeUndefined();
    expect(form.get('unrelated' as any)).toBe('x');
  });

  it('pathIndex candidates for the array shrink correctly after arrayMove when the moved item had no tracked state', () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }, { name: 'b' }] } });
    form.set('items.1.name', 'tracked', { touch: true });
    expect(candidates(form, 'items')).toContain('items.1.name');
    form.arrayMove('items' as any, 0, 1); // index 1 ('b', tracked) moves to index 0
    expect(candidates(form, 'items')).toContain('items.0.name');
    expect(candidates(form, 'items')).not.toContain('items.1.name');
  });

  it('shifts EVERY affected index correctly for a multi-item arrayMove (collision-bug guard)', () => {
    // Move index 0 -> 4 across a 5-item array where EVERY index has distinguishable
    // tracked touched state. This is a full cyclic permutation of all 5 keys: every
    // key's destination is also some other key's source, which is exactly the shape
    // that breaks a single-pass interleaved delete/rename loop over pathIndex
    // candidates (Map iteration order is insertion order, not ascending numeric
    // order) - see Task 10's shiftStateIndices collision bug for the same class of
    // failure. Assert every slot's value is fully and independently correct.
    const form = createForm({
      initialValues: {
        items: [{ name: 'v0' }, { name: 'v1' }, { name: 'v2' }, { name: 'v3' }, { name: 'v4' }],
      },
    });
    for (let i = 0; i < 5; i++) {
      form.set(`items.${i}.name` as any, `touched-${i}`, { touch: true });
    }
    for (let i = 0; i < 5; i++) {
      expect(form.getState().touched[`items.${i}.name`]).toBe(true);
    }
    form.arrayMove('items' as any, 0, 4);
    // Expected sliding-window permutation for fromIndex=0, toIndex=4:
    // index 0 -> 4; indices 1..4 -> shift down by 1 (1->0, 2->1, 3->2, 4->3).
    const expectedValueAtIndex = ['touched-1', 'touched-2', 'touched-3', 'touched-4', 'touched-0'];
    for (let i = 0; i < 5; i++) {
      expect(form.get(`items.${i}.name` as any)).toBe(expectedValueAtIndex[i]);
      expect(form.getState().touched[`items.${i}.name`]).toBe(true);
    }
    // No stray old-index candidates should remain, and no destination should be
    // silently dropped by a colliding delete/rename in the same pass.
    expect(candidates(form, 'items').sort()).toEqual(
      [0, 1, 2, 3, 4].map((i) => `items.${i}.name`).sort()
    );
  });
});
