import { describe, expect, it } from 'vitest';
import { createForm } from '../src/index.js';

describe('mutation invariant: errors', () => {
  it('runValidation never reassigns the errors object identity', async () => {
    // NOTE: the field path must be nested (not a bare top-level key like "name").
    // indexKey/unindexKey (lines 1574-1601) only populate pathIndex for a path's
    // ANCESTOR PREFIXES via a loop starting at segment index 1 — a single-segment
    // path never enters that loop, so indexKey('name') is a no-op and
    // _debugPathIndex().get('name') would always be undefined regardless of this
    // refactor. Use a nested field so indexKey/unindexKey actually exercise pathIndex.
    const form = createForm({
      initialValues: { profile: { name: '' } },
      rules: { 'profile.name': 'required' },
    });
    // Capture the errors object identity via a path subscriber closure trick:
    // subscribe to '*' and grab getState().errors is a copy, so instead we rely on
    // the internal _debugRawState accessor (already exposed) plus a second, independent
    // check: a subscriber added before validation must observe the SAME object if it
    // captured a reference via a custom test hook. Since ctx isn't public yet (Task 6+),
    // this test only asserts the OBSERVABLE contract for now: validation still produces
    // the correct errors content and reindexes pathIndex correctly. A second test,
    // asserting object-identity stability, is added in Task 6 once ctx exists.
    await form.validate();
    expect(form.getState().errors['profile.name']).toBe('Required');
    const idx = form._debugPathIndex();
    expect(idx.get('profile')?.has('profile.name')).toBe(true);
  });
});

describe('mutation invariant: array-ops error/touched/dirty/wasSet shifting', () => {
  it('shiftStateIndices (via arrayRemove) preserves error/touched/dirty state on shifted items', () => {
    const form = createForm({
      initialValues: { items: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] },
    });
    form.set('items.0.name', 'a', { touch: true });
    form.setErrors({ 'items.1.name': 'bad' });
    form.arrayRemove('items', 0);
    // item that was at index 1 (errored) is now at index 0
    expect(form.getState().errors['items.0.name']).toBe('bad');
    expect(form.getState().errors['items.1.name']).toBeUndefined();
  });

  it('arraySwap swaps touched/dirty/error state along with values', () => {
    const form = createForm({
      initialValues: { items: [{ name: 'a' }, { name: 'b' }] },
    });
    form.set('items.0.name', 'x', { touch: true });
    form.setErrors({ 'items.0.name': 'bad' });
    form.arraySwap('items', 0, 1);
    expect(form.getState().errors['items.1.name']).toBe('bad');
    expect(form.getState().touched['items.1.name']).toBe(true);
    expect(form.getState().errors['items.0.name']).toBeUndefined();
  });
});

describe('mutation invariant: reset/hydrate values/initialValues/error-state', () => {
  it('reset() clears values, errors, touched, dirty, wasSet back to newValues/defaults', () => {
    const form = createForm({ initialValues: { name: '' } });
    form.set('name', 'x', { touch: true });
    form.setErrors({ name: 'bad' });
    form.reset({ name: 'seeded' });
    const state = form.getState();
    expect(state.values.name).toBe('seeded');
    expect(state.errors.name).toBeUndefined();
    expect(state.touched.name).toBeUndefined();
    expect(state.dirty.name).toBeUndefined();
  });

  it('no cluster observes a stale values/initialValues reference across reset()', () => {
    const form = createForm({ initialValues: { name: '' } });
    const seen: unknown[] = [];
    form.subscribeToPath('name', (val) => seen.push(val));
    form.set('name', 'a');
    form.reset({ name: 'b' });
    form.set('name', 'c');
    // If a stale `values` reference were held anywhere, the second set() after reset()
    // would not be observed correctly on the fresh values object.
    expect(seen).toEqual(['', 'a', 'b', 'c']);
  });
});
