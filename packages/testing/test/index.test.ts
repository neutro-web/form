import { createForm } from '@neutro/form-core';
import { blurField, fillForm, triggerValidation } from '@neutro/form-testing';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// fillForm
// ---------------------------------------------------------------------------

describe('fillForm', () => {
  it('sets multiple values', () => {
    const form = createForm({ initialValues: { email: '', name: '' } });
    fillForm(form, { email: 'alice@example.com', name: 'Alice' });
    expect(form.get('email')).toBe('alice@example.com');
    expect(form.get('name')).toBe('Alice');
  });

  it('batches all sets into a single notification', () => {
    const form = createForm({ initialValues: { email: '', name: '' } });
    let notifyCount = 0;
    form.subscribe(() => {
      notifyCount++;
    });
    notifyCount = 0; // reset after the initial subscribe fire
    fillForm(form, { email: 'alice@example.com', name: 'Alice' });
    expect(notifyCount).toBe(1);
  });

  it('accepts nested dot-path strings', () => {
    const form = createForm({ initialValues: { user: { email: '' } } });
    fillForm(form, { 'user.email': 'alice@example.com' });
    expect(form.get('user.email')).toBe('alice@example.com');
  });
});

// ---------------------------------------------------------------------------
// blurField
// ---------------------------------------------------------------------------

describe('blurField', () => {
  it('marks the field as touched', () => {
    const form = createForm({ initialValues: { email: '' } });
    blurField(form, 'email');
    expect(form.getState().touched.email).toBe(true);
  });

  it('does not change the field value', () => {
    const form = createForm({ initialValues: { email: 'original@example.com' } });
    blurField(form, 'email');
    expect(form.get('email')).toBe('original@example.com');
  });

  it('does not mark other fields as touched', () => {
    const form = createForm({ initialValues: { email: '', name: '' } });
    blurField(form, 'email');
    expect(form.getState().touched.email).toBe(true);
    expect(form.getState().touched.name).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// triggerValidation
// ---------------------------------------------------------------------------

describe('triggerValidation', () => {
  it('returns true when the form is valid', async () => {
    const form = createForm({
      initialValues: { email: 'alice@example.com' },
      asyncDebounceMs: 0,
      rules: { email: ['required', 'email'] },
    });
    const result = await triggerValidation(form);
    expect(result).toBe(true);
  });

  it('returns false and populates errors when the form is invalid', async () => {
    const form = createForm({
      initialValues: { email: '' },
      asyncDebounceMs: 0,
      rules: { email: ['required'] },
    });
    const result = await triggerValidation(form);
    expect(result).toBe(false);
    expect(form.getState().errors.email).toBe('Required');
  });

  it('validates only the scoped paths when provided', async () => {
    const form = createForm({
      initialValues: { email: '', name: '' },
      asyncDebounceMs: 0,
      rules: { email: ['required'], name: ['required'] },
    });
    await triggerValidation(form, ['email']);
    expect(form.getState().errors.email).toBe('Required');
    expect(form.getState().errors.name).toBeUndefined();
  });

  it('resolves immediately with an async validator when asyncDebounceMs is 0', async () => {
    const form = createForm({
      initialValues: { email: '' },
      asyncDebounceMs: 0,
      validator: async (v) => (v.email ? {} : { email: 'Required' }),
    });
    const result = await triggerValidation(form);
    expect(result).toBe(false);
    expect(form.getState().errors.email).toBe('Required');
  });
});
