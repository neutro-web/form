import { createForm } from '@neutro/form-core';
import { describe, expect, it } from 'vitest';

describe('core form exposes setErrors (React adapter cannot be tested without React runtime)', () => {
  it('form instance has setErrors as a function', () => {
    const form = createForm({ initialValues: { email: '' } });
    expect(typeof form.setErrors).toBe('function');
  });

  it('form.setErrors called through the form instance updates state', () => {
    const form = createForm({ initialValues: { email: '' } });
    form.setErrors({ email: 'Already taken' });
    expect(form.getState().errors.email).toBe('Already taken');
  });
});

describe('core form exposes setErrors (SolidJS adapter cannot be tested without Solid runtime)', () => {
  it('form.setErrors called through the form instance updates state', () => {
    const form = createForm({ initialValues: { email: '' } });
    form.setErrors({ email: 'Already taken' });
    expect(form.getState().errors.email).toBe('Already taken');
  });
});

describe('core form exposes setErrors (Angular adapter cannot be tested without Angular injection context)', () => {
  it('form.setErrors called through the form instance updates state', () => {
    const form = createForm({ initialValues: { email: '' } });
    form.setErrors({ email: 'Already taken' });
    expect(form.getState().errors.email).toBe('Already taken');
  });
});
