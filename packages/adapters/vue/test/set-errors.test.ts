import { describe, it, expect } from 'vitest';
import { createForm } from '@neutro/form-core';
import { useVueForm } from '../src/index';

describe('useVueForm — setErrors', () => {
  it('exposes setErrors pointing to the form instance method', () => {
    const form = createForm({ initialValues: { email: '' } });
    const adapter = useVueForm(form);
    expect(adapter.setErrors).toBe(form.setErrors);
  });

  it('calling adapter.setErrors updates the reactive state ref', () => {
    const form = createForm({ initialValues: { email: '' } });
    const { state, setErrors } = useVueForm(form);

    setErrors({ email: 'Already taken' });

    expect(state.value.errors.email).toBe('Already taken');
    expect(state.value.touched.email).toBe(true);
  });

  it('server error clears from the state ref when validate() runs', async () => {
    const form = createForm({
      initialValues: { email: 'good@example.com' },
      validator: () => ({}),
    });
    const { state, setErrors } = useVueForm(form);

    setErrors({ email: 'Already taken' });
    expect(state.value.errors.email).toBe('Already taken');

    await form.validate();

    expect(state.value.errors.email).toBeUndefined();
  });
});
