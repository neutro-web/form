import { Injector, runInInjectionContext } from '@angular/core';
import { createForm } from '@neutro/form-core';
import { describe, expect, it } from 'vitest';
import { useAngularForm, useAngularFormPath, useAngularWatch } from '../src/index';

function withInjectionContext<R>(fn: () => R): { result: R; injector: Injector } {
  const injector = Injector.create({ providers: [] });
  let result!: R;
  runInInjectionContext(injector, () => {
    result = fn();
  });
  return { result, injector };
}

describe('useAngularForm', () => {
  it('reflects the initial form state', () => {
    const form = createForm({ initialValues: { email: '' } });
    const { result } = withInjectionContext(() => useAngularForm(form));
    expect(result.state().values.email).toBe('');
  });

  it('updates the signal when the form changes', () => {
    const form = createForm({ initialValues: { email: '' } });
    const { result } = withInjectionContext(() => useAngularForm(form));
    form.set('email', 'x@test.com');
    expect(result.state().values.email).toBe('x@test.com');
  });

  it('unsubscribes from the core engine when the injector is destroyed', () => {
    const form = createForm({ initialValues: { email: '' } });
    const { result, injector } = withInjectionContext(() => useAngularForm(form));

    injector.destroy();
    const beforeDestroy = result.state();
    form.set('email', 'after-destroy@test.com');

    // If the subscriber were still attached, state() would have been
    // reassigned to a fresh snapshot reflecting the new value.
    expect(result.state()).toBe(beforeDestroy);
    expect(result.state().values.email).not.toBe('after-destroy@test.com');
  });

  it('exposes get/set as direct passthroughs to the form instance', () => {
    const form = createForm({ initialValues: { email: '' } });
    const { result } = withInjectionContext(() => useAngularForm(form));
    expect(result.get).toBe(form.get);
    expect(result.set).toBe(form.set);
  });
});

describe('useAngularFormPath', () => {
  it('reflects the initial value and field state for a path', () => {
    const form = createForm({ initialValues: { email: '' } });
    const { result } = withInjectionContext(() => useAngularFormPath(form, 'email'));
    expect(result.value()).toBe('');
  });

  it('updates the value signal when the path changes', () => {
    const form = createForm({ initialValues: { email: '' } });
    const { result } = withInjectionContext(() => useAngularFormPath(form, 'email'));
    form.set('email', 'x@test.com');
    expect(result.value()).toBe('x@test.com');
  });

  it('reflects fieldState (touched/error/dirty) updates', async () => {
    const form = createForm({
      initialValues: { email: '' },
      rules: { email: 'email' },
    });
    const { result } = withInjectionContext(() => useAngularFormPath(form, 'email'));
    form.set('email', 'not-an-email', { touch: true });
    await form.validate(['email']);
    expect(result.fieldState()?.touched).toBe(true);
    expect(result.fieldState()?.error).toBeTruthy();
  });

  it('unsubscribes from the core engine when the injector is destroyed', () => {
    const form = createForm({ initialValues: { email: '' } });
    const { result, injector } = withInjectionContext(() => useAngularFormPath(form, 'email'));

    injector.destroy();
    form.set('email', 'after-destroy@test.com');

    expect(result.value()).not.toBe('after-destroy@test.com');
  });
});

describe('useAngularWatch', () => {
  it('reflects the initial snapshot of the watched paths', () => {
    const form = createForm({ initialValues: { a: '1', b: '2' } });
    const { result } = withInjectionContext(() => useAngularWatch(form, ['a', 'b']));
    expect(result()).toEqual({ a: '1', b: '2' });
  });

  it('updates when a watched field changes', () => {
    const form = createForm({ initialValues: { a: '1', b: '2' } });
    const { result } = withInjectionContext(() => useAngularWatch(form, ['a', 'b']));
    form.set('a', 'changed');
    expect(result().a).toBe('changed');
  });

  it('unsubscribes from the core engine when the injector is destroyed', () => {
    const form = createForm({ initialValues: { a: '1' } });
    const { result, injector } = withInjectionContext(() => useAngularWatch(form, ['a']));

    injector.destroy();
    form.set('a', 'after-destroy');

    expect(result().a).not.toBe('after-destroy');
  });
});
