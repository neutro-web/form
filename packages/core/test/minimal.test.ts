import { describe, expect, it } from 'vitest';
import { createForm } from '../src/minimal.js';

describe('minimal tier', () => {
  it('supports set/get/validate/subscribe/reset/submit', async () => {
    const form = createForm({ initialValues: { name: '' }, rules: { name: 'required' } });
    form.set('name', 'x', { touch: true });
    expect(form.get('name')).toBe('x');
    expect(await form.validate()).toBe(true);
    let payload: unknown;
    await form.submit(async (p) => {
      payload = p;
    });
    expect(payload).toEqual({ name: 'x' });
    form.reset();
    expect(form.get('name')).toBe('');
  });

  it('supports batch/resetField/setErrors/clearErrors/watch/isDirty/isFieldDirty/isFieldValid', async () => {
    const form = createForm({ initialValues: { a: 1, b: 2 } });
    let watched: Record<string, unknown> | undefined;
    const unwatch = form.watch('a', (vals) => {
      watched = vals;
    });
    form.batch(() => {
      form.set('a', 10, { touch: true });
      form.set('b', 20);
    });
    expect(form.get('a')).toBe(10);
    expect(watched).toEqual({ a: 10 });
    unwatch();

    expect(form.isDirty()).toBe(true);
    expect(form.isFieldDirty('a')).toBe(true);

    form.setErrors({ a: 'bad' });
    expect(form.getState().errors.a).toBe('bad');
    await form.validate(['a']);
    expect(form.isFieldValid('a')).toBe(false);
    form.clearErrors();
    expect(form.getState().errors).toEqual({});

    form.resetField('a');
    expect(form.get('a')).toBe(1);
  });

  it('supports subscribeToPath/subscribeToPathDynamic/getFieldMode/setDynamic/getDynamic/destroy', () => {
    const form = createForm({ initialValues: { nested: { v: 1 } } });
    let seen: unknown;
    const unsub = form.subscribeToPath('nested.v', (val) => {
      seen = val;
    });
    form.set('nested.v', 5, { touch: true });
    expect(seen).toBe(5);
    unsub();

    let dynSeen: unknown;
    const unsubDyn = form.subscribeToPathDynamic('nested.v', (val) => {
      dynSeen = val;
    });
    form.setDynamic('nested.v', 9);
    expect(dynSeen).toBe(9);
    expect(form.getDynamic('nested.v')).toBe(9);
    unsubDyn();

    expect(form.getFieldMode('nested.v')).toBe('onTouched');

    const unsubAction = form._subscribeToActions(() => {});
    unsubAction();
    expect(form._debugPathIndex()).toBeInstanceOf(Map);
    form._debugIndexKey('nested.v');
    form._debugUnindexKey('nested.v');
    expect(form._debugRawState()).toHaveProperty('errors');

    form.destroy();
  });

  it('does not expose array-ops/dom-bridge/persistence methods at compile time', () => {
    const form = createForm({ initialValues: { items: [1, 2] } });
    // These are compile-time-only checks (arrayRemove/connect/hydrate must not
    // type-check on MinimalFormInstance); at runtime they are indeed absent,
    // so wrap the calls in expect(...).toThrow() rather than invoking them bare.
    expect(() => {
      // @ts-expect-error - arrayRemove does not exist on MinimalFormInstance
      form.arrayRemove('items', 0);
    }).toThrow();
    expect(() => {
      // @ts-expect-error - connect does not exist on MinimalFormInstance
      form.connect('items');
    }).toThrow();
    expect(() => {
      // @ts-expect-error - hydrate does not exist on MinimalFormInstance
      form.hydrate();
    }).toThrow();
  });

  it('computed fields are a silent no-op under minimal (per spec: array-ops, dom-bridge, persistence, AND computed-fields are all excluded from minimal)', () => {
    const form = createForm({
      initialValues: { a: 1, b: 0 },
      computed: { b: { fn: (v: { a: number }) => v.a * 2 } },
    });
    // No error, no warning required — the config is silently accepted but not honored,
    // exactly as the spec's Public API surface section documents for the `computed` option.
    expect(form.get('b')).toBe(0);
    form.set('a', 5);
    expect(form.get('b')).toBe(0);
  });
});
