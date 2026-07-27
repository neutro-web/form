import { createForm } from '@neutro/form-core';
import { afterEach, describe, expect, it } from 'vitest';
import { effectScope } from 'vue';
import { useVueForm, useVueFormPath, useVueWatch } from '../src/index';

// Regression coverage for the onUnmounted -> onScopeDispose fix: onUnmounted
// silently no-ops outside a component instance (bare effectScope(), Pinia
// setup stores, composables called after an await), which previously leaked
// the core subscriber forever. onScopeDispose fires in ANY active scope.
describe('Vue adapter cleanup in a bare effectScope (no component instance)', () => {
  let scope: ReturnType<typeof effectScope>;

  afterEach(() => {
    scope?.stop();
  });

  it('useVueForm unsubscribes when the scope stops', () => {
    const form = createForm({ initialValues: { email: '' } });
    let state!: ReturnType<typeof useVueForm>['state'];
    scope = effectScope();
    scope.run(() => {
      state = useVueForm(form).state;
    });

    scope.stop();
    const beforeStop = state.value;
    form.set('email', 'changed@example.com');

    // If the subscriber were still attached, state.value would have been
    // reassigned to a fresh snapshot reflecting the new value.
    expect(state.value).toBe(beforeStop);
    expect(state.value.values.email).not.toBe('changed@example.com');
  });

  it('useVueFormPath unsubscribes when the scope stops', () => {
    const form = createForm({ initialValues: { email: '' } });
    let value!: ReturnType<typeof useVueFormPath>['value'];
    scope = effectScope();
    scope.run(() => {
      value = useVueFormPath(form, 'email').value;
    });

    scope.stop();
    form.set('email', 'changed@example.com');

    expect(value.value).not.toBe('changed@example.com');
  });

  it('useVueWatch unsubscribes when the scope stops', () => {
    const form = createForm({ initialValues: { email: '' } });
    let watched!: ReturnType<typeof useVueWatch>;
    scope = effectScope();
    scope.run(() => {
      watched = useVueWatch(form, ['email']);
    });

    scope.stop();
    form.set('email', 'changed@example.com');

    expect(watched.value.email).not.toBe('changed@example.com');
  });
});
