// @vitest-environment jsdom
import { afterEach, describe, expect, it, test, vi } from 'vitest';
import { createForm } from '../src/index';

function makeInput(): HTMLInputElement {
  const el = document.createElement('input');
  document.body.appendChild(el);
  return el;
}

function fireInput(el: HTMLInputElement, value: string) {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function fireBlur(el: HTMLInputElement) {
  el.dispatchEvent(new Event('blur', { bubbles: true }));
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('connect() — onSubmitOnly', () => {
  it('does not validate on input', () => {
    const validator = vi.fn().mockReturnValue({});
    const form = createForm({
      initialValues: { email: '' },
      validator,
      validationMode: 'onSubmitOnly',
    });
    const el = makeInput();
    form.connect('email', el);
    fireInput(el, 'bad');
    expect(validator).not.toHaveBeenCalled();
  });

  it('does not validate on blur', () => {
    const validator = vi.fn().mockReturnValue({});
    const form = createForm({
      initialValues: { email: '' },
      validator,
      validationMode: 'onSubmitOnly',
    });
    const el = makeInput();
    form.connect('email', el);
    fireBlur(el);
    expect(validator).not.toHaveBeenCalled();
  });

  it('sets touched on blur', () => {
    const form = createForm({ initialValues: { email: '' }, validationMode: 'onSubmitOnly' });
    const el = makeInput();
    form.connect('email', el);
    fireBlur(el);
    expect(form.getState().touched.email).toBe(true);
  });

  it('does not set touched on input', () => {
    const form = createForm({ initialValues: { email: '' }, validationMode: 'onSubmitOnly' });
    const el = makeInput();
    form.connect('email', el);
    fireInput(el, 'x');
    expect(form.getState().touched.email).toBeUndefined();
  });
});

describe('connect() — onBlur', () => {
  it('does not validate on input', () => {
    const validator = vi.fn().mockReturnValue({});
    const form = createForm({ initialValues: { email: '' }, validator, validationMode: 'onBlur' });
    const el = makeInput();
    form.connect('email', el);
    fireInput(el, 'bad');
    expect(validator).not.toHaveBeenCalled();
  });

  it('validates on blur', () => {
    const validator = vi.fn().mockReturnValue({ email: 'Invalid' });
    const form = createForm({ initialValues: { email: '' }, validator, validationMode: 'onBlur' });
    const el = makeInput();
    form.connect('email', el);
    fireInput(el, 'bad');
    fireBlur(el);
    expect(validator).toHaveBeenCalledTimes(1);
    expect(form.getState().errors.email).toBe('Invalid');
  });

  it('does not set touched on input', () => {
    const form = createForm({ initialValues: { email: '' }, validationMode: 'onBlur' });
    const el = makeInput();
    form.connect('email', el);
    fireInput(el, 'x');
    expect(form.getState().touched.email).toBeUndefined();
  });
});

describe('connect() — onChange', () => {
  it('validates on input', () => {
    const validator = vi.fn().mockReturnValue({ email: 'Invalid' });
    const form = createForm({
      initialValues: { email: '' },
      validator,
      validationMode: 'onChange',
    });
    const el = makeInput();
    form.connect('email', el);
    fireInput(el, 'bad');
    expect(validator).toHaveBeenCalledTimes(1);
    expect(form.getState().errors.email).toBe('Invalid');
  });

  it('sets touched on input', () => {
    const form = createForm({ initialValues: { email: '' }, validationMode: 'onChange' });
    const el = makeInput();
    form.connect('email', el);
    fireInput(el, 'x');
    expect(form.getState().touched.email).toBe(true);
  });

  it('does not re-validate on blur (only sets touched)', () => {
    const validator = vi.fn().mockReturnValue({});
    const form = createForm({
      initialValues: { email: '' },
      validator,
      validationMode: 'onChange',
    });
    const el = makeInput();
    form.connect('email', el);
    fireBlur(el);
    expect(validator).not.toHaveBeenCalled();
    expect(form.getState().touched.email).toBe(true);
  });
});

describe('connect() — onTouched (default)', () => {
  it('does not validate on input before first blur', () => {
    const validator = vi.fn().mockReturnValue({});
    const form = createForm({
      initialValues: { email: '' },
      validator,
      validationMode: 'onTouched',
    });
    const el = makeInput();
    form.connect('email', el);
    fireInput(el, 'bad');
    expect(validator).not.toHaveBeenCalled();
  });

  it('does not set touched on input before first blur', () => {
    const form = createForm({ initialValues: { email: '' }, validationMode: 'onTouched' });
    const el = makeInput();
    form.connect('email', el);
    fireInput(el, 'x');
    expect(form.getState().touched.email).toBeUndefined();
  });

  it('validates and sets touched on first blur', () => {
    const validator = vi.fn().mockReturnValue({ email: 'Invalid' });
    const form = createForm({
      initialValues: { email: '' },
      validator,
      validationMode: 'onTouched',
    });
    const el = makeInput();
    form.connect('email', el);
    fireBlur(el);
    expect(validator).toHaveBeenCalledTimes(1);
    expect(form.getState().touched.email).toBe(true);
    expect(form.getState().errors.email).toBe('Invalid');
  });

  it('validates on input after first blur', () => {
    const validator = vi.fn().mockReturnValue({});
    const form = createForm({
      initialValues: { email: '' },
      validator,
      validationMode: 'onTouched',
    });
    const el = makeInput();
    form.connect('email', el);
    fireBlur(el);
    const callsAfterBlur = validator.mock.calls.length;
    fireInput(el, 'some@example.com');
    expect(validator.mock.calls.length).toBe(callsAfterBlur + 1);
  });

  it('onTouched is the default when no validationMode set', () => {
    const validator = vi.fn().mockReturnValue({});
    const form = createForm({ initialValues: { email: '' }, validator });
    const el = makeInput();
    form.connect('email', el);
    fireInput(el, 'bad');
    expect(validator).not.toHaveBeenCalled();
  });
});

describe('connect() — validateOn ConnectOptions override', () => {
  it('element-level validateOn overrides FormConfig mode', () => {
    const validator = vi.fn().mockReturnValue({});
    const form = createForm({
      initialValues: { email: '' },
      validator,
      validationMode: 'onSubmitOnly',
    });
    const el = makeInput();
    form.connect('email', el, { validateOn: 'onChange' });
    fireInput(el, 'x');
    expect(validator).toHaveBeenCalledTimes(1);
  });

  it('per-field config overrides global default', () => {
    const validator = vi.fn().mockReturnValue({});
    const form = createForm({
      initialValues: { email: '', terms: false },
      validator,
      validationMode: { default: 'onBlur', fields: { email: 'onChange' } },
    });
    const emailEl = makeInput();
    form.connect('email', emailEl);
    fireInput(emailEl, 'x');
    expect(validator).toHaveBeenCalledTimes(1);
  });
});

describe('focus() and focusFirstError()', () => {
  test('focus() focuses the connected element and returns true', () => {
    const form = createForm({ initialValues: { email: '' } })
    const input = document.createElement('input')
    document.body.appendChild(input)
    form.connect('email', input)
    const result = form.focus('email')
    expect(result).toBe(true)
    expect(document.activeElement).toBe(input)
    document.body.removeChild(input)
  })

  test('focus() returns false when no element is connected for path', () => {
    const form = createForm({ initialValues: { email: '' } })
    const result = form.focus('email')
    expect(result).toBe(false)
  })

  test('focus() returns false when element is removed from DOM', () => {
    const form = createForm({ initialValues: { email: '' } })
    const input = document.createElement('input')
    document.body.appendChild(input)
    form.connect('email', input)
    document.body.removeChild(input)
    const result = form.focus('email')
    expect(result).toBe(false)
  })

  test('focusFirstError() focuses first error element in DOM order', async () => {
    const form = createForm({
      initialValues: { email: '', username: '' },
      rules: { email: ['email'], username: ['required'] },
    })
    const emailInput = document.createElement('input')
    const usernameInput = document.createElement('input')
    // usernameInput first in DOM, emailInput second
    document.body.appendChild(usernameInput)
    document.body.appendChild(emailInput)
    form.connect('username', usernameInput)
    form.connect('email', emailInput)
    // Both fields have errors
    form.set('email', 'not-an-email')
    await form.validate()
    const result = form.focusFirstError()
    expect(result).toBe(true)
    // usernameInput is first in DOM — it should receive focus
    expect(document.activeElement).toBe(usernameInput)
    document.body.removeChild(emailInput)
    document.body.removeChild(usernameInput)
  })

  test('focusFirstError() returns false when there are no errors', async () => {
    const form = createForm({ initialValues: { email: 'a@b.com' }, rules: { email: ['email'] } })
    const input = document.createElement('input')
    document.body.appendChild(input)
    form.connect('email', input)
    await form.validate()
    const result = form.focusFirstError()
    expect(result).toBe(false)
    document.body.removeChild(input)
  })

  test('focusFirstError() returns false when errors exist but no connected element', () => {
    const form = createForm({ initialValues: { email: '' } })
    form.setErrors({ email: 'Required' })
    const result = form.focusFirstError()
    expect(result).toBe(false)
  })
})
