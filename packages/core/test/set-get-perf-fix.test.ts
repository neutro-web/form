import { describe, expect, it } from 'vitest';
import { createForm } from '../src/index.js';

/**
 * Behavior-pin for the Task 5 hot-path de-indirection (v0.5.0 perf audit):
 * `setFieldValue`/`set`/`get` now read the tracked state records
 * (`wasSet`/`dirty`/`touched`/`values`/`initialValues`) and cross-cluster
 * primitives via direct lexical bindings instead of `ctx.<prop>`. Every binding
 * aliases the SAME object/function on `ctx` (mutation invariant: never
 * reassigned), so this must be exactly behavior-identical. These tests exercise
 * the same operation the `set-get` bench measures (`set(path, v)` + `get(path)`
 * on a flat object with no computed fields / validators / dependencies).
 */
describe('set-get hot path (Task 5 de-indirection pin)', () => {
  it('set() then get() round-trips on a flat field', () => {
    const form = createForm({ initialValues: { field0: 'a', field1: 'b' } });
    form.set('field0', 'x');
    expect(form.get('field0')).toBe('x');
    expect(form.get('field1')).toBe('b');
  });

  it('tracks dirty/isDirty and clears dirty when value returns to initial', () => {
    const form = createForm({ initialValues: { field0: 'a' } });
    expect(form.getState().dirty.field0).toBeUndefined();
    form.set('field0', 'x');
    expect(form.getState().dirty.field0).toBe(true);
    form.set('field0', 'a'); // back to initial -> dirty map entry cleared
    expect(form.getState().dirty.field0).toBeUndefined();
    // isDirty() reflects wasSet (touched-by-set history), which persists even
    // once the value returns to its initial — this is pre-existing behavior and
    // is asserted here to pin it across the de-indirection change.
    expect(form.isDirty()).toBe(true);
  });

  it('set() with touch marks touched; no-op when value is deep-equal', () => {
    const form = createForm({ initialValues: { field0: 'a' } });
    let notifications = 0;
    form.subscribe(() => {
      notifications++;
    });
    const before = notifications;
    form.set('field0', 'a'); // deep-equal to current -> early return, no notify
    expect(notifications).toBe(before);
    form.set('field0', 'y', { touch: true });
    expect(form.getState().touched.field0).toBe(true);
    expect(form.get('field0')).toBe('y');
  });

  it('array-path get/set works via lexical bindings', () => {
    const form = createForm({ initialValues: { items: ['a', 'b'] } });
    form.set(['items', '0'], 'z');
    expect(form.get(['items', '0'])).toBe('z');
    expect(form.get('items.1')).toBe('b');
  });
});
