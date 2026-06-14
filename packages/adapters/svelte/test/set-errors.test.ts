import { createForm } from '@neutro/form-core';
import { get } from 'svelte/store';
import { describe, expect, it } from 'vitest';
import { useSvelteForm } from '../src/index';

describe('useSvelteForm — setErrors', () => {
  it('exposes setErrors pointing to the form instance method', () => {
    const form = createForm({ initialValues: { email: '' } });
    const adapter = useSvelteForm(form);
    expect(adapter.setErrors).toBe(form.setErrors);
  });

  it('calling adapter.setErrors updates the readable state store', () => {
    const form = createForm({ initialValues: { email: '' } });
    const { state, setErrors } = useSvelteForm(form);

    setErrors({ email: 'Already taken' });

    const snapshot = get(state);
    expect(snapshot.errors.email).toBe('Already taken');
    expect(snapshot.touched.email).toBe(true);
  });

  it('server error clears from the store when validate() runs', async () => {
    const form = createForm({
      initialValues: { email: 'good@example.com' },
      validator: () => ({}),
    });
    const { state, setErrors } = useSvelteForm(form);

    setErrors({ email: 'Already taken' });
    expect(get(state).errors.email).toBe('Already taken');

    await form.validate();

    expect(get(state).errors.email).toBeUndefined();
  });
});
