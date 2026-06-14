import { createForm } from '@neutro/form-core';
import { afterEach, describe, expect, it } from 'vitest';
import { effectScope } from 'vue';
import { useVueForm } from '../src/index';

describe('useVueForm — setErrors', () => {
  let scope: ReturnType<typeof effectScope>;

  afterEach(() => {
    scope?.stop();
  });

  it('exposes setErrors pointing to the form instance method', () => {
    const form = createForm({ initialValues: { email: '' } });
    let adapter!: ReturnType<typeof useVueForm>;
    scope = effectScope();
    scope.run(() => {
      adapter = useVueForm(form);
    });
    expect(adapter.setErrors).toBe(form.setErrors);
  });

  it('calling adapter.setErrors updates the reactive state ref', () => {
    const form = createForm({ initialValues: { email: '' } });
    let state!: ReturnType<typeof useVueForm>['state'];
    let setErrors!: ReturnType<typeof useVueForm>['setErrors'];
    scope = effectScope();
    scope.run(() => {
      const adapter = useVueForm(form);
      state = adapter.state;
      setErrors = adapter.setErrors;
    });

    setErrors({ email: 'Already taken' });

    expect(state.value.errors.email).toBe('Already taken');
    expect(state.value.touched.email).toBe(true);
  });

  it('server error clears from the state ref when validate() runs', async () => {
    const form = createForm({
      initialValues: { email: 'good@example.com' },
      validator: () => ({}),
    });
    let state!: ReturnType<typeof useVueForm>['state'];
    let setErrors!: ReturnType<typeof useVueForm>['setErrors'];
    scope = effectScope();
    scope.run(() => {
      const adapter = useVueForm(form);
      state = adapter.state;
      setErrors = adapter.setErrors;
    });

    setErrors({ email: 'Already taken' });
    expect(state.value.errors.email).toBe('Already taken');

    await form.validate();

    expect(state.value.errors.email).toBeUndefined();
  });
});
