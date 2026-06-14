// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createForm } from '../src/index.js';

describe('getAriaProps', () => {
  it('aria-invalid is false when no error', () => {
    const form = createForm({ initialValues: { email: '' } });
    expect(form.getAriaProps('email')['aria-invalid']).toBe('false');
  });

  it('aria-invalid is true when error exists', async () => {
    const form = createForm({
      initialValues: { email: '' },
      rules: { email: ['required', 'email'] },
    });
    await form.validate();
    expect(form.getAriaProps('email')['aria-invalid']).toBe('true');
  });

  it('aria-describedby is undefined when no error', () => {
    const form = createForm({ initialValues: { email: '' } });
    expect(form.getAriaProps('email')['aria-describedby']).toBeUndefined();
  });

  it('aria-describedby is error-email when error on email path', async () => {
    const form = createForm({
      initialValues: { email: '' },
      rules: { email: ['required'] },
    });
    await form.validate();
    expect(form.getAriaProps('email')['aria-describedby']).toBe('error-email');
  });

  it('aria-describedby uses dot-to-dash for nested paths', async () => {
    const form = createForm({
      initialValues: { billing: { address: '' } },
      rules: { 'billing.address': ['required'] },
    });
    await form.validate();
    expect(form.getAriaProps('billing.address')['aria-describedby']).toBe('error-billing-address');
  });

  it('errorId option overrides generated id', async () => {
    const form = createForm({
      initialValues: { email: '' },
      rules: { email: ['required'] },
    });
    await form.validate();
    expect(form.getAriaProps('email', { errorId: 'my-email-error' })['aria-describedby']).toBe('my-email-error');
  });

  it('aria-required auto-detected from string rule', () => {
    const form = createForm({
      initialValues: { email: '' },
      rules: { email: 'required' },
    });
    expect(form.getAriaProps('email')['aria-required']).toBe(true);
  });

  it('aria-required auto-detected from array rules', () => {
    const form = createForm({
      initialValues: { email: '' },
      rules: { email: ['required', 'email'] },
    });
    expect(form.getAriaProps('email')['aria-required']).toBe(true);
  });

  it('options.required: true forces aria-required even with no rules', () => {
    const form = createForm({ initialValues: { username: '' } });
    expect(form.getAriaProps('username', { required: true })['aria-required']).toBe(true);
  });

  it('options.required: false suppresses aria-required even when rules include required', () => {
    const form = createForm({
      initialValues: { email: '' },
      rules: { email: ['required'] },
    });
    expect(form.getAriaProps('email', { required: false })['aria-required']).toBeUndefined();
  });

  it('aria-required is undefined when field has no required rule', () => {
    const form = createForm({
      initialValues: { email: '' },
      rules: { email: ['email'] },
    });
    expect(form.getAriaProps('email')['aria-required']).toBeUndefined();
  });
});

describe('getAriaProps — additional cases', () => {
  it('aria-invalid flips back to false after errors are cleared', async () => {
    const form = createForm({
      initialValues: { email: '' },
      rules: { email: ['required'] },
      validator: (values) => (values.email ? {} : { email: 'Required' }),
    });
    await form.validate();
    expect(form.getAriaProps('email')['aria-invalid']).toBe('true');

    form.set('email', 'x@example.com');
    await form.validate();

    expect(form.getAriaProps('email')['aria-invalid']).toBe('false');
    expect(form.getAriaProps('email')['aria-describedby']).toBeUndefined();
  });

  it('numeric array path produces correct aria-describedby id', async () => {
    const form = createForm({
      initialValues: { items: [{ name: '' }] },
      rules: { 'items.0.name': ['required'] },
    });
    await form.validate();
    expect(form.getAriaProps('items.0.name')['aria-describedby']).toBe('error-items-0-name');
  });

  it('aria-invalid is true after setErrors injects a server error', () => {
    const form = createForm({ initialValues: { email: '' } });

    form.setErrors({ email: 'Already taken' });

    expect(form.getAriaProps('email')['aria-invalid']).toBe('true');
    expect(form.getAriaProps('email')['aria-describedby']).toBe('error-email');
  });
});

describe('connect() aria-required', () => {
  it('sets aria-required="true" when field has required rule', () => {
    const form = createForm({
      initialValues: { email: '' },
      rules: { email: ['required', 'email'] },
    });
    const el = document.createElement('input');
    form.connect('email', el);
    expect(el.getAttribute('aria-required')).toBe('true');
  });

  it('does not set aria-required when field has no required rule', () => {
    const form = createForm({
      initialValues: { email: '' },
      rules: { email: ['email'] },
    });
    const el = document.createElement('input');
    form.connect('email', el);
    expect(el.hasAttribute('aria-required')).toBe(false);
  });

  it('does not set aria-required when form has no rules config', () => {
    const form = createForm({ initialValues: { email: '' } });
    const el = document.createElement('input');
    form.connect('email', el);
    expect(el.hasAttribute('aria-required')).toBe(false);
  });

  it('sets aria-required="true" when field has required rule as a string (not array)', () => {
    const form = createForm({
      initialValues: { email: '' },
      rules: { email: 'required' },
    });
    const el = document.createElement('input');
    form.connect('email', el);
    expect(el.getAttribute('aria-required')).toBe('true');
  });

  it('aria-invalid updates reactively via subscribeToPath when an error appears', async () => {
    const form = createForm({
      initialValues: { email: '' },
      rules: { email: ['required'] },
    });
    const el = document.createElement('input');
    form.connect('email', el);
    expect(el.getAttribute('aria-invalid')).toBe('false');

    await form.validate();

    expect(el.getAttribute('aria-invalid')).toBe('true');
  });
});
