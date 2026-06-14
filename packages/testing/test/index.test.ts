import { createForm } from '@neutro/form-core';
import { blurField, createFormFixture, fillForm, triggerValidation } from '@neutro/form-testing';
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

// ---------------------------------------------------------------------------
// createFormFixture
// ---------------------------------------------------------------------------

describe('createFormFixture', () => {
  it('defaults asyncDebounceMs to 0 so async validators resolve without fake timers', async () => {
    // If asyncDebounceMs were 300 (the core default), this test would time out.
    const fixture = createFormFixture({
      initialValues: { email: '' },
      validator: async (v) => (v.email ? {} : { email: 'Required' }),
    });
    const result = await fixture.validate();
    expect(result).toBe(false);
    fixture.cleanup();
  });

  it('respects an explicit asyncDebounceMs override', async () => {
    const fixture = createFormFixture({
      initialValues: { email: '' },
      asyncDebounceMs: 0,
      rules: { email: ['required'] },
    });
    const result = await fixture.validate();
    expect(result).toBe(false);
    fixture.cleanup();
  });

  it('fill sets multiple values on the form', () => {
    const fixture = createFormFixture({ initialValues: { email: '', name: '' } });
    fixture.fill({ email: 'alice@example.com', name: 'Alice' });
    expect(fixture.form.get('email')).toBe('alice@example.com');
    expect(fixture.form.get('name')).toBe('Alice');
    fixture.cleanup();
  });

  it('blur marks a field as touched without changing its value', () => {
    const fixture = createFormFixture({ initialValues: { email: 'x@example.com' } });
    fixture.blur('email');
    expect(fixture.form.getState().touched.email).toBe(true);
    expect(fixture.form.get('email')).toBe('x@example.com');
    fixture.cleanup();
  });

  it('validate returns false and sets errors for invalid fields', async () => {
    const fixture = createFormFixture({
      initialValues: { email: '' },
      rules: { email: ['required'] },
    });
    const result = await fixture.validate();
    expect(result).toBe(false);
    expect(fixture.form.getState().errors.email).toBe('Required');
    fixture.cleanup();
  });

  it('validate returns true after valid values are filled', async () => {
    const fixture = createFormFixture({
      initialValues: { email: '' },
      rules: { email: ['required', 'email'] },
    });
    fixture.fill({ email: 'alice@example.com' });
    const result = await fixture.validate();
    expect(result).toBe(true);
    expect(fixture.form.getState().errors).toEqual({});
    fixture.cleanup();
  });

  it('validate accepts scoped paths', async () => {
    const fixture = createFormFixture({
      initialValues: { email: '', name: '' },
      rules: { email: ['required'], name: ['required'] },
    });
    await fixture.validate(['email']);
    expect(fixture.form.getState().errors.email).toBe('Required');
    expect(fixture.form.getState().errors.name).toBeUndefined();
    fixture.cleanup();
  });

  it('cleanup destroys the form — subscribers stop receiving updates', () => {
    const fixture = createFormFixture({ initialValues: { email: '' } });
    let callCount = 0;
    fixture.form.subscribe(() => {
      callCount++;
    });
    callCount = 0; // reset after initial subscribe fire
    fixture.cleanup();
    fixture.form.set('email', 'x'); // no-op after destroy
    expect(callCount).toBe(0);
  });

  it('exposes the raw FormInstance on fixture.form', () => {
    const fixture = createFormFixture({ initialValues: { email: '' } });
    expect(typeof fixture.form.getState).toBe('function');
    expect(typeof fixture.form.validate).toBe('function');
    fixture.cleanup();
  });
});
