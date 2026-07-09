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
