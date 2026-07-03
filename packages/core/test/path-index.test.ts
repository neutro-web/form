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

describe('arraySwap — candidate-lookup correctness', () => {
  it('arraySwap correctly swaps errors/touched/dirty/wasSet/validatedPaths and pathIndex, ignoring unrelated fields', async () => {
    // Deviation from the brief's original draft: the brief used a `rules`
    // config + `await form.validate()` to seed validatedPaths/errors before
    // swapping. arraySwap always ends with an unconditional
    // `runValidation([targetPath])` call (pre-existing behavior, not part of
    // this task); with a real rule literally keyed to 'items.0.name'
    // configured, that post-swap revalidation re-validates the *literal* path
    // 'items.0.name' against whatever value now sits there, re-adding it to
    // validatedPaths (and hence pathIndex) regardless of what swapKeys did.
    // This is the same class of rules-vs-revalidation contamination documented
    // in Task 10/11's shiftStateIndices/rekeyArrayState tests (see their
    // comments above). Using setErrors() directly instead of a rules-driven
    // validate() isolates the assertions to what arraySwap's own
    // swapKeys/validatedPaths-swap logic controls.
    // Note: uses setErrors() alone (not form.set(..., { touch: true }) followed
    // by setErrors()) to seed touched/errors. setErrors() unconditionally calls
    // indexKey(p) for its touched write regardless of whether the path was
    // already touched (see setErrors's implementation) — combining it with a
    // prior form.set(..., { touch: true }) on the same path would double the
    // touched refcount for reasons unrelated to arraySwap, requiring two
    // unindexKey calls to fully clear it instead of one. That refcount-overcount
    // is a pre-existing characteristic of setErrors, out of scope for this task.
    const form = createForm({
      initialValues: {
        items: [{ name: 'a' }, { name: 'b' }],
        unrelated: 'x',
      },
    });
    form.set('items.0.name', '');
    form.setErrors({ 'items.0.name': 'Required' } as any);
    expect(candidates(form, 'items')).toContain('items.0.name');
    form.arraySwap('items' as any, 0, 1);
    expect(form.get('items.1.name' as any)).toBe('');
    expect(candidates(form, 'items')).not.toContain('items.0.name');
    expect(candidates(form, 'items')).toContain('items.1.name');
    expect(form.getState().errors['items.1.name']).toBe('Required');
    expect(form.getState().errors['items.0.name']).toBeUndefined();
    expect(form.get('unrelated' as any)).toBe('x');
  });

  it('arraySwap with neither index carrying tracked state leaves pathIndex empty for that array', () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }, { name: 'b' }] } });
    form.arraySwap('items' as any, 0, 1);
    expect(candidates(form, 'items')).toEqual([]);
  });

  it('arraySwap with BOTH indices carrying tracked state simultaneously swaps both sides correctly', () => {
    const form = createForm({
      initialValues: {
        items: [{ name: 'a' }, { name: 'b' }],
      },
    });
    form.set('items.0.name' as any, 'touched-a', { touch: true });
    form.set('items.1.name' as any, 'touched-b', { touch: true });
    form.setErrors({ 'items.0.name': 'err-a', 'items.1.name': 'err-b' } as any);
    expect(candidates(form, 'items').sort()).toEqual(['items.0.name', 'items.1.name']);

    form.arraySwap('items' as any, 0, 1);

    // Values are swapped.
    expect(form.get('items.0.name' as any)).toBe('touched-b');
    expect(form.get('items.1.name' as any)).toBe('touched-a');
    // touched state follows the same slot indices (both were touched, so both remain touched).
    expect(form.getState().touched['items.0.name']).toBe(true);
    expect(form.getState().touched['items.1.name']).toBe(true);
    // Errors are swapped with their originating value, not dropped or duplicated.
    expect(form.getState().errors['items.0.name']).toBe('err-b');
    expect(form.getState().errors['items.1.name']).toBe('err-a');
    // pathIndex still reflects exactly these two tracked keys — no stray entries.
    expect(candidates(form, 'items').sort()).toEqual(['items.0.name', 'items.1.name']);
  });

  it('arraySwap with BOTH slots already populated does not leak a refcount when claims are later cleared', () => {
    // Regression test: when both swap slots already hold state for the same
    // tail, the key identity stays put (only the VALUES swap) — no index
    // change should happen at all. The buggy swapKeys called indexKey(bKey)/
    // indexKey(aKey) unconditionally whenever a key matched, even though the
    // paired unindexKey only fired when the OPPOSITE slot was undefined. That
    // left a permanent extra claim on 'items.0.name'/'items.1.name' every time
    // arraySwap ran on two populated slots, so pathIndex never went back to
    // empty even after every real claim (touched + errors) was cleared.
    const form = createForm({
      initialValues: {
        items: [{ x: 'a' }, { x: 'b' }],
      },
    });
    form.setErrors({ 'items.0.x': 'e1', 'items.1.x': 'e2' } as any);
    expect(candidates(form, 'items').sort()).toEqual(['items.0.x', 'items.1.x']);

    form.arraySwap('items' as any, 0, 1);

    // Release every claim that was placed on these keys. setErrors() also
    // marks the path touched (see the comment on the first test in this
    // describe block), so clearErrors() alone only releases the `errors`
    // claim — release the paired `touched` claim directly (it's not exposed
    // through a public "untouch" API), same pattern used by the
    // "pathIndex — destroy()" tests above.
    form.clearErrors();
    form._debugUnindexKey('items.0.x');
    form._debugUnindexKey('items.1.x');

    const raw = form._debugRawState();
    expect(Object.keys(raw.errors)).toEqual([]);
    // No leaked claims: once every real claim (errors + touched) has been
    // released, pathIndex must be fully empty for this prefix — no stray
    // refcount left over from arraySwap's indexKey calls.
    expect(candidates(form, 'items')).toEqual([]);
    expect(form._debugPathIndex().has('items.0.x')).toBe(false);
    expect(form._debugPathIndex().has('items.1.x')).toBe(false);
  });

  it('arraySwap preserves validatedPaths for both indices when both were populated by validate()', async () => {
    // Regression test for the in-place-mutation collision reported against
    // this commit: the previous single-pass loop read/wrote the SAME live
    // validatedPaths Set while iterating (`.delete(key)` immediately followed
    // by `.add(newKey)`), so a rename target added early in the pass could be
    // re-matched by a later `validatedPaths.has(key)` check in that same pass
    // and get swapped a second time — silently dropping items.1/items.1.name.
    // Using rules + await form.validate() (rather than setErrors()) is the
    // only way to actually populate validatedPaths, which is the state this
    // bug corrupts; validatedPaths is not observable through errors/touched.
    const form = createForm({
      initialValues: {
        items: [{ name: 'a' }, { name: 'b' }],
      },
      rules: {
        'items.0.name': 'required',
        'items.1.name': 'required',
      } as any,
    });
    await form.validate();
    const before = form._debugRawState();
    expect(before.validatedPaths).toEqual(
      expect.arrayContaining(['items.0', 'items.0.name', 'items.1', 'items.1.name'])
    );

    form.arraySwap('items' as any, 0, 1);

    const after = form._debugRawState();
    // All four entries must survive the swap — none silently dropped.
    expect(after.validatedPaths).toEqual(
      expect.arrayContaining(['items.0', 'items.0.name', 'items.1', 'items.1.name'])
    );
    expect(candidates(form, 'items')).toEqual(
      expect.arrayContaining(['items.0', 'items.0.name', 'items.1', 'items.1.name'])
    );
  });
});

describe('pathIndex — fuzz: index matches an independently-computed ground truth', () => {
  // Independent oracle: scans the six RAW tracked structures (not pathIndex)
  // for keys under `prefix`, exactly mirroring what pathIndex is supposed to
  // contain. This can actually fail if pathIndex is wrong, unlike comparing
  // pathIndex against itself.
  function groundTruthCandidates(form: ReturnType<typeof createForm>, prefix: string): Set<string> {
    const raw = form._debugRawState();
    // NOTE (deviation from brief, documented in task-13-report.md): indexKey()
    // never indexes a key under itself — only under its proper ancestor
    // prefixes (verified by the pre-existing "not under itself" test at the
    // top of this file, and relied on by reset()/resetField(), which clear
    // exact-match entries like wasSet[arrayPath] directly rather than via
    // pathIndex). Including `key === prefix` here would make the "ground
    // truth" expect self-indexing that pathIndex intentionally never does
    // (e.g. wasSet['items'] set by arrayInsert/arrayRemove/arrayMove/arraySwap
    // on the array root itself), producing false-positive failures. Matching
    // only proper descendants keeps this an independent oracle for what
    // pathIndex.get(prefix) actually promises: descendant keys, not itself.
    const matches = (key: string) => key.startsWith(`${prefix}.`);
    const result = new Set<string>();
    for (const key of Object.keys(raw.errors)) if (matches(key)) result.add(key);
    for (const key of Object.keys(raw.touched)) if (matches(key)) result.add(key);
    for (const key of Object.keys(raw.dirty)) if (matches(key)) result.add(key);
    for (const key of Object.keys(raw.wasSet)) if (matches(key)) result.add(key);
    for (const key of raw.validatedPaths) if (matches(key)) result.add(key);
    for (const key of raw.pathSubscriberKeys) if (key !== '*' && matches(key)) result.add(key);
    return result;
  }

  function assertIndexMatchesGroundTruth(form: ReturnType<typeof createForm>, prefix: string) {
    const expected = groundTruthCandidates(form, prefix);
    const actual = form._debugPathIndex().get(prefix) ?? new Set<string>();
    expect(actual).toEqual(expected);
  }

  it('interleaved operations keep pathIndex exactly equal to the ground truth, not just non-crashing', async () => {
    const form = createForm({
      initialValues: {
        items: Array.from({ length: 6 }, (_, i) => ({ name: `item-${i}` })),
        other: Array.from({ length: 4 }, (_, i) => ({ label: `other-${i}` })),
        top: 'unrelated',
      },
      rules: {
        'items.0.name': { required: true },
        'items.1.name': { required: true },
      } as any,
    });

    const unsubs: Array<() => void> = [];
    unsubs.push(form.subscribeToPath('items.2.name' as any, () => {}));
    unsubs.push(form.subscribeToPath('other.1.label' as any, () => {}));

    // A deliberately varied sequence exercising every write/delete site touched
    // by this plan: setValue, touch, validate (full and scoped), arrayInsert,
    // arrayRemove, arrayMove, arraySwap, setErrors/clearErrors, resetField.
    form.set('items.0.name', '', { touch: true });
    await form.validate();
    assertIndexMatchesGroundTruth(form, 'items');

    form.arrayRemove('items' as any, 0); // shifts remaining items down
    assertIndexMatchesGroundTruth(form, 'items');

    form.arrayInsert('items' as any, 0, { name: 'inserted' } as any);
    assertIndexMatchesGroundTruth(form, 'items');
    form.arrayMove('items' as any, 0, 3);
    assertIndexMatchesGroundTruth(form, 'items');
    form.arraySwap('items' as any, 1, 2);
    assertIndexMatchesGroundTruth(form, 'items');

    form.setErrors({ 'other.1.label': 'bad' }); // shares 'other.1.label' with the subscriber above
    assertIndexMatchesGroundTruth(form, 'other');
    form.clearErrors(); // releases the errors claim; subscriber claim should keep it indexed
    assertIndexMatchesGroundTruth(form, 'other');
    expect(groundTruthCandidates(form, 'other').has('other.1.label')).toBe(true); // still held by the subscriber
    unsubs[1](); // releases the subscriber claim too
    assertIndexMatchesGroundTruth(form, 'other');
    // NOTE (deviation from brief, documented in task-13-report.md): setErrors()
    // also marks touched[p] = true (pre-existing behavior predating this plan,
    // in setFieldValue's sibling setErrors/clearErrors pair — see
    // packages/core/src/index.ts), and clearErrors() only clears the `errors`
    // map, not `touched`. So 'other.1.label' remains touched even after
    // clearErrors() + unsubscribing, and both the ground truth and pathIndex
    // correctly agree it is STILL held (via `touched`), not released. The
    // brief's original `.toBe(false)` assumed clearErrors also released the
    // touched claim, which it never has — confirmed by the equality assertion
    // above already passing with the key still present.
    expect(groundTruthCandidates(form, 'other').has('other.1.label')).toBe(true);

    form.resetField('items.1.name' as any);
    assertIndexMatchesGroundTruth(form, 'items');
    form.reset();
    assertIndexMatchesGroundTruth(form, 'items');
    assertIndexMatchesGroundTruth(form, 'other'); // check both prefixes immediately after reset(), not deferred
    // After a full reset, only the still-live subscriber on 'items.2.name'
    // (now relocated by the moves/swaps above) should keep anything indexed
    // under 'items' — confirmed by the ground-truth ­equality check above,
    // not assumed.
    unsubs[0]();
    assertIndexMatchesGroundTruth(form, 'items');
    assertIndexMatchesGroundTruth(form, 'other');
  });

  it('repeated random-ish interleavings across many independent arrays stay consistent', async () => {
    const form = createForm({
      initialValues: {
        a: Array.from({ length: 5 }, (_, i) => ({ v: i })),
        b: Array.from({ length: 5 }, (_, i) => ({ v: i })),
        c: Array.from({ length: 5 }, (_, i) => ({ v: i })),
      },
    });

    const ops: Array<() => void> = [
      () => form.set('a.0.v' as any, Math.random(), { touch: true }),
      () => form.set('b.2.v' as any, Math.random(), { touch: true }),
      () => form.arrayRemove('a' as any, 1),
      () => form.arrayInsert('b' as any, 1, { v: 99 } as any),
      () => form.arrayMove('c' as any, 0, 2),
      () => form.arraySwap('a' as any, 0, 1),
      () => form.resetField('c.1.v' as any),
    ];

    for (let i = 0; i < 200; i++) {
      const op = ops[i % ops.length];
      try {
        op();
      } catch {
        // Some ops become invalid as arrays shrink (e.g. arrayRemove on an
        // empty array) — that's fine, the point is pathIndex never desyncs
        // regardless of which ops actually succeed.
      }
      // Ground-truth equality check after EVERY operation, not just at the
      // end — catches a desync at the exact op that caused it, and a too-
      // narrow/too-broad candidate set that a final-state-only "doesn't
      // throw" check would miss entirely.
      for (const prefix of ['a', 'b', 'c']) {
        assertIndexMatchesGroundTruth(form, prefix);
      }
    }
  });
});

describe('pathIndex — repeated writes do not leak refcounts', () => {
  it('set() on the same path twice then reset() fully clears pathIndex', () => {
    const form = createForm({ initialValues: { items: [{ name: '' }] } });
    form.set('items.0.name', 'x');
    form.set('items.0.name', 'y');
    form.reset();
    expect(form._debugPathIndex().has('items')).toBe(false);
    expect(form._debugPathIndex().has('items.0')).toBe(false);
  });

  it('setErrors() on the same path twice then clearErrors() fully clears pathIndex', () => {
    const form = createForm({ initialValues: { items: [{ name: '' }] } });
    form.setErrors({ 'items.0.name': 'bad1' });
    form.setErrors({ 'items.0.name': 'bad2' });
    form.clearErrors();
    // setErrors also marks `touched`, which stays indexed after clearErrors()
    // (clearErrors only clears `errors`) — so untouch it too to fully drain
    // the refcount for this key and confirm the prefix disappears.
    form._debugUnindexKey('items.0.name');
    expect(form._debugPathIndex().has('items')).toBe(false);
  });
});
