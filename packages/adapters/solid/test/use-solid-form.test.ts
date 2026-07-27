import { createForm } from '@neutro/form-core';
import { createRoot } from 'solid-js';
import { describe, expect, it } from 'vitest';
import { useSolidForm, useSolidFormPath, useSolidWatch } from '../src/index';

function withRoot<R>(fn: () => R): { result: R; dispose: () => void } {
  let result!: R;
  let dispose!: () => void;
  createRoot((d) => {
    dispose = d;
    result = fn();
  });
  return { result, dispose };
}

describe('useSolidForm', () => {
  it('reflects the initial form state', () => {
    const form = createForm({ initialValues: { email: '' } });
    const { result } = withRoot(() => useSolidForm(form));
    const [state] = result;
    expect(state.values.email).toBe('');
  });

  it('updates the store when the form changes', () => {
    const form = createForm({ initialValues: { email: '' } });
    const { result } = withRoot(() => useSolidForm(form));
    const [state] = result;
    form.set('email', 'x@test.com');
    expect(state.values.email).toBe('x@test.com');
  });

  it('reflects setErrors/validate round-trips in the store', async () => {
    const form = createForm({ initialValues: { email: '' }, validator: () => ({}) });
    const { result } = withRoot(() => useSolidForm(form));
    const [state, actions] = result;
    actions.setErrors({ email: 'Already taken' });
    expect(state.errors.email).toBe('Already taken');
    await form.validate();
    expect(state.errors.email).toBeUndefined();
  });

  it('unsubscribes from the core engine when the owner is disposed', () => {
    const form = createForm({ initialValues: { email: '' } });
    const { result, dispose } = withRoot(() => useSolidForm(form));
    const [state] = result;

    dispose();
    // A primitive snapshot, not `{ ...state }` -- reconcile() updates matching
    // store slices in place, so a shallow object spread would alias the same
    // nested `values` proxy and trivially "match" even if a leaked
    // subscription mutated it after dispose, defeating the assertion below.
    const beforeDispose = state.values.email;
    form.set('email', 'after-dispose@test.com');

    // If the subscriber were still attached, the store would have been
    // reconciled with a fresh snapshot reflecting the new value.
    expect(state.values.email).toBe(beforeDispose);
    expect(state.values.email).not.toBe('after-dispose@test.com');
  });

  it('exposes get/set as direct passthroughs to the form instance', () => {
    const form = createForm({ initialValues: { email: '' } });
    const { result } = withRoot(() => useSolidForm(form));
    const [, actions] = result;
    expect(actions.get).toBe(form.get);
    expect(actions.set).toBe(form.set);
  });
});

describe('useSolidFormPath', () => {
  it('reflects the initial value for a path', () => {
    const form = createForm({ initialValues: { email: '' } });
    const { result } = withRoot(() => useSolidFormPath(form, 'email'));
    expect(result.value()).toBe('');
  });

  it('updates the value signal when the path changes', () => {
    const form = createForm({ initialValues: { email: '' } });
    const { result } = withRoot(() => useSolidFormPath(form, 'email'));
    form.set('email', 'x@test.com');
    expect(result.value()).toBe('x@test.com');
  });

  it('reflects fieldState (touched/error) updates', async () => {
    const form = createForm({
      initialValues: { email: '' },
      rules: { email: 'email' },
    });
    const { result } = withRoot(() => useSolidFormPath(form, 'email'));
    form.set('email', 'not-an-email', { touch: true });
    await form.validate(['email']);
    expect(result.fieldState()?.touched).toBe(true);
    expect(result.fieldState()?.error).toBeTruthy();
  });

  it('unsubscribes from the core engine when the owner is disposed', () => {
    const form = createForm({ initialValues: { email: '' } });
    const { result, dispose } = withRoot(() => useSolidFormPath(form, 'email'));

    dispose();
    form.set('email', 'after-dispose@test.com');

    expect(result.value()).not.toBe('after-dispose@test.com');
  });
});

describe('useSolidWatch', () => {
  it('reflects the initial snapshot of the watched paths', () => {
    const form = createForm({ initialValues: { a: '1', b: '2' } });
    const { result } = withRoot(() => useSolidWatch(form, ['a', 'b']));
    expect(result()).toEqual({ a: '1', b: '2' });
  });

  it('updates when a watched field changes', () => {
    const form = createForm({ initialValues: { a: '1', b: '2' } });
    const { result } = withRoot(() => useSolidWatch(form, ['a', 'b']));
    form.set('a', 'changed');
    expect(result().a).toBe('changed');
  });

  it('unsubscribes from the core engine when the owner is disposed', () => {
    const form = createForm({ initialValues: { a: '1' } });
    const { result, dispose } = withRoot(() => useSolidWatch(form, ['a']));

    dispose();
    form.set('a', 'after-dispose');

    expect(result().a).not.toBe('after-dispose');
  });
});
