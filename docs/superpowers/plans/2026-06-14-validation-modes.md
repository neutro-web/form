# Per-Field Validation Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `validationMode` to `FormConfig` and `validateOn` to `ConnectOptions` so each field can control when validation triggers, with four modes (`onChange`, `onBlur`, `onTouched`, `onSubmitOnly`) and `onTouched` as the new default.

**Architecture:** All changes are in `packages/core/src/index.ts`. A private `resolveFieldMode(path, connectOverride?)` function inside the `createForm` closure applies a four-level priority chain. `connect()` calls it once at connection time and branches `syncValueFromDOM` and `handleBlur` on the resolved mode. No adapter changes needed — `getFieldMode` on `FormInstance` is exposed automatically through all adapters.

**Tech Stack:** TypeScript, Vitest, jsdom (DOM event tests for `connect()` modes).

---

## File Map

| File | Change |
|---|---|
| `packages/core/src/index.ts` | Add types, extend interfaces, implement `resolveFieldMode`, modify `connect()`, expose `getFieldMode` |
| `packages/core/test/form.test.ts` | Add `getFieldMode` unit tests (no DOM needed) |
| `packages/core/test/connect-modes.test.ts` | New — jsdom behavioral tests for each mode in `connect()` |
| `docs/api/core.md` | Add `validationMode` to `FormConfig`, add `getFieldMode` method section |
| `docs/api/connect.md` | Add `validateOn` to `ConnectOptions` block |
| `docs/getting-started.md` | Add "Validation Modes" section before "Next Steps" |
| `docs/guides/react.md` | Add "Validation Modes" section |
| `docs/guides/vue.md` | Add "Validation Modes" section |
| `docs/guides/svelte.md` | Add "Validation Modes" section |
| `docs/guides/solid.md` | Add "Validation Modes" section |
| `docs/guides/angular.md` | Add "Validation Modes" section |
| `docs/public/playground.html` | Add new step demoing all four modes side-by-side |

---

### Task A: Core types, interfaces, and `getFieldMode`

**Files:**
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/form.test.ts`

Read `packages/core/src/index.ts` before editing. The key locations:
- `BuiltInRule` type ends around line 103. `FormConfig` starts around line 105. `ConnectOptions` is around line 117. `FormInstance` is around line 122. Inside `createForm`, the closure body starts at line 552; `getState` is defined around line 580.

- [ ] **Step 1: Write failing tests for `getFieldMode`**

Append a new `describe` block at the end of `packages/core/test/form.test.ts`:

```ts
describe('getFieldMode', () => {
  it('returns onTouched when no validationMode configured', () => {
    const form = createForm({ initialValues: { name: '' } });
    expect(form.getFieldMode('name')).toBe('onTouched');
  });

  it('string shorthand applies to all paths', () => {
    const form = createForm({ initialValues: { name: '', email: '' }, validationMode: 'onBlur' });
    expect(form.getFieldMode('name')).toBe('onBlur');
    expect(form.getFieldMode('email')).toBe('onBlur');
  });

  it('object default applies when no field override', () => {
    const form = createForm({ initialValues: { name: '' }, validationMode: { default: 'onChange' } });
    expect(form.getFieldMode('name')).toBe('onChange');
  });

  it('field-level override beats object default', () => {
    const form = createForm({
      initialValues: { email: '', password: '' },
      validationMode: { default: 'onTouched', fields: { password: 'onChange' } },
    });
    expect(form.getFieldMode('email')).toBe('onTouched');
    expect(form.getFieldMode('password')).toBe('onChange');
  });

  it('unspecified field falls back to default then onTouched', () => {
    const form = createForm({
      initialValues: { email: '', terms: false },
      validationMode: { fields: { terms: 'onSubmitOnly' } },
    });
    expect(form.getFieldMode('email')).toBe('onTouched');
    expect(form.getFieldMode('terms')).toBe('onSubmitOnly');
  });

  it('object without default falls back to onTouched for unlisted paths', () => {
    const form = createForm({
      initialValues: { email: '' },
      validationMode: { default: 'onBlur' },
    });
    expect(form.getFieldMode('email')).toBe('onBlur');
  });
});
```

- [ ] **Step 2: Run failing tests**

```bash
pnpm exec vitest run packages/core/test/form.test.ts
```

Expected: FAIL — `form.getFieldMode is not a function` (or similar). If it passes, something is wrong — stop and investigate.

- [ ] **Step 3: Add `ValidationMode` type and `ValidationModeConfig` interface**

In `packages/core/src/index.ts`, insert after the `BuiltInRule` type block (after line ~103, before `FormConfig`):

```ts
export type ValidationMode = 'onChange' | 'onBlur' | 'onTouched' | 'onSubmitOnly';

export interface ValidationModeConfig<T> {
  default?: ValidationMode;
  fields?: Partial<Record<Path<T> | (string & {}), ValidationMode>>;
}
```

- [ ] **Step 4: Add `validationMode` to `FormConfig`**

In `FormConfig<T>`, add after `asyncDebounceMs`:

```ts
  /** Per-field validation trigger mode. Defaults to 'onTouched'. */
  validationMode?: ValidationMode | ValidationModeConfig<T>;
```

The full updated `FormConfig` block:

```ts
export interface FormConfig<T> {
  initialValues: T;
  rules?: Partial<Record<Path<T> | (string & {}), BuiltInRule | BuiltInRule[]>>;
  validator?: (
    values: T,
    scopePaths?: string[],
    signal?: AbortSignal
  ) => Record<string, string> | Promise<Record<string, string>>;
  dependencies?: Record<string, string[]>;
  asyncDebounceMs?: number;
  /** Per-field validation trigger mode. Defaults to 'onTouched'. */
  validationMode?: ValidationMode | ValidationModeConfig<T>;
}
```

- [ ] **Step 5: Add `validateOn` to `ConnectOptions`**

Replace the existing `ConnectOptions` interface:

```ts
export interface ConnectOptions {
  persist?: boolean;
  format?: (val: string) => string;
  validateOn?: ValidationMode;
}
```

- [ ] **Step 6: Add `getFieldMode` to `FormInstance`**

In `FormInstance<T>`, add after the `setErrors` line:

```ts
  getFieldMode: (path: string) => ValidationMode;
```

- [ ] **Step 7: Implement `resolveFieldMode` inside `createForm`**

Inside `createForm`, just before the `connect` function definition (around line 900), add:

```ts
  const resolveFieldMode = (path: string, connectOverride?: ValidationMode): ValidationMode => {
    if (connectOverride) return connectOverride;
    if (config.validationMode) {
      if (typeof config.validationMode === 'string') return config.validationMode;
      if (config.validationMode.fields?.[path]) return config.validationMode.fields[path]!;
      if (config.validationMode.default) return config.validationMode.default;
    }
    return 'onTouched';
  };
```

- [ ] **Step 8: Expose `getFieldMode` in the return object**

In the return object of `createForm`, add after `setErrors`:

```ts
    getFieldMode: (path: string) => resolveFieldMode(path),
```

- [ ] **Step 9: Run tests and confirm passing**

```bash
pnpm exec vitest run packages/core/test/form.test.ts
```

Expected: all tests pass, including the 6 new `getFieldMode` tests.

- [ ] **Step 10: Commit**

```bash
git add packages/core/src/index.ts packages/core/test/form.test.ts
git commit -m "feat(core): add ValidationMode types, validationMode config, and getFieldMode"
```

---

### Task B: `connect()` mode behavior

**Files:**
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/test/connect-modes.test.ts`

This task modifies the `connect()` function and adds DOM event tests. jsdom must be available for Vitest. Check first:

```bash
pnpm list jsdom --depth=0
```

If `jsdom` is not listed, install it:

```bash
pnpm add -D jsdom
```

- [ ] **Step 1: Write failing connect-modes tests**

Create `packages/core/test/connect-modes.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
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
    const form = createForm({ initialValues: { email: '' }, validator, validationMode: 'onSubmitOnly' });
    const el = makeInput();
    form.connect('email', el);
    fireInput(el, 'bad');
    expect(validator).not.toHaveBeenCalled();
  });

  it('does not validate on blur', () => {
    const validator = vi.fn().mockReturnValue({});
    const form = createForm({ initialValues: { email: '' }, validator, validationMode: 'onSubmitOnly' });
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
    const form = createForm({ initialValues: { email: '' }, validator, validationMode: 'onChange' });
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
    const form = createForm({ initialValues: { email: '' }, validator, validationMode: 'onChange' });
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
    const form = createForm({ initialValues: { email: '' }, validator, validationMode: 'onTouched' });
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
    const form = createForm({ initialValues: { email: '' }, validator, validationMode: 'onTouched' });
    const el = makeInput();
    form.connect('email', el);
    fireBlur(el);
    expect(validator).toHaveBeenCalledTimes(1);
    expect(form.getState().touched.email).toBe(true);
    expect(form.getState().errors.email).toBe('Invalid');
  });

  it('validates on input after first blur', () => {
    const validator = vi.fn().mockReturnValue({});
    const form = createForm({ initialValues: { email: '' }, validator, validationMode: 'onTouched' });
    const el = makeInput();
    form.connect('email', el);
    fireBlur(el);
    const callsAfterBlur = validator.mock.calls.length;
    fireInput(el, 'some@example.com');
    expect(validator.mock.calls.length).toBe(callsAfterBlur + 1);
  });

  it('onTouched is the default when no validationMode set', () => {
    const validator = vi.fn().mockReturnValue({});
    const form = createForm({ initialValues: { email: '' }, validator }); // no validationMode
    const el = makeInput();
    form.connect('email', el);
    fireInput(el, 'bad'); // should not validate — same as onTouched
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
    expect(validator).toHaveBeenCalledTimes(1); // email is onChange
  });
});
```

- [ ] **Step 2: Run failing tests**

```bash
pnpm exec vitest run packages/core/test/connect-modes.test.ts
```

Expected: many tests FAIL — `syncValueFromDOM` still always touches and the current `handleBlur` always validates. If all pass, stop and investigate.

- [ ] **Step 3: Resolve the mode in `connect()` and update `syncValueFromDOM`**

In `packages/core/src/index.ts`, inside the `connect` function body, add the mode resolution right after the `stringPath` declaration:

```ts
  const stringPath = Array.isArray(path) ? path.join('.') : path;
  const mode = resolveFieldMode(stringPath, options.validateOn);  // ← ADD THIS
```

Then find the end of `syncValueFromDOM` — the line that currently reads:

```ts
    setFieldValue(stringPath, rawVal, { touch: true });
```

Replace that single line with:

```ts
    if (mode === 'onChange') {
      setFieldValue(stringPath, rawVal, { touch: true });
      runValidation([stringPath]);
    } else if (mode === 'onTouched' && touched[stringPath]) {
      setFieldValue(stringPath, rawVal);
      runValidation([stringPath]);
    } else {
      setFieldValue(stringPath, rawVal);
    }
```

- [ ] **Step 4: Update `handleBlur`**

Find the existing `handleBlur` inside `connect()`:

```ts
    const handleBlur = () => {
      touched[stringPath] = true;
      runValidation([stringPath]);
    };
```

Replace it with:

```ts
    const handleBlur = () => {
      touched[stringPath] = true;
      if (mode === 'onBlur' || mode === 'onTouched') {
        runValidation([stringPath]);
      } else {
        // onChange: input handles validation; onSubmitOnly: never validates inline.
        // Either way, notify so subscribers see the touched state change.
        notify(stringPath);
      }
    };
```

- [ ] **Step 5: Run all tests**

```bash
pnpm exec vitest run
```

Expected: all tests pass. If any test in `form.test.ts` fails, the most likely cause is that a test was relying on the old `onBlur`-always-touches-on-input behavior. Fix failing tests to reflect the new `onTouched` default.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/index.ts packages/core/test/connect-modes.test.ts
git commit -m "feat(core): implement per-field validation modes in connect()"
```

---

### Task C: API reference documentation

**Files:**
- Modify: `docs/api/core.md`
- Modify: `docs/api/connect.md`

- [ ] **Step 1: Add `validationMode` to `FormConfig` in `docs/api/core.md`**

Read `docs/api/core.md`. Find the `FormConfig<T>` TypeScript code block. It currently ends with `asyncDebounceMs`. Add `validationMode` after it:

```ts
  /**
   * Validation trigger mode. Controls when validation runs for fields connected
   * via `form.connect()`. Pass a bare string to apply one mode globally, or an
   * object with `default` and per-field `fields` overrides.
   *
   * | Mode | Validates on |
   * |---|---|
   * | `'onTouched'` | input after first blur; always on blur (default) |
   * | `'onChange'` | every input event |
   * | `'onBlur'` | blur only |
   * | `'onSubmitOnly'` | form submit only — no inline validation |
   *
   * @default 'onTouched'
   *
   * @example
   * // Global mode
   * validationMode: 'onBlur'
   *
   * @example
   * // Mixed: default onTouched, password immediate, terms submit-only
   * validationMode: {
   *   default: 'onTouched',
   *   fields: { password: 'onChange', terms: 'onSubmitOnly' }
   * }
   */
  validationMode?: ValidationMode | {
    default?: ValidationMode
    fields?: Record<string, ValidationMode>
  }
```

- [ ] **Step 2: Add `getFieldMode` method section to `docs/api/core.md`**

Find `### form.setErrors(errors)` in `docs/api/core.md`. Add the following section immediately before it:

```markdown
### `form.getFieldMode(path)`

```ts
form.getFieldMode(path: string): ValidationMode
```

Returns the effective validation mode for `path`. Useful in framework adapters to decide when to call `form.validate([path])` in event handlers.

Resolution order (first match wins):

1. `validateOn` in the `ConnectOptions` passed to `form.connect()` for that element
2. `validationMode.fields[path]` in `FormConfig`
3. `validationMode.default` in `FormConfig`
4. `'onTouched'` (library default)

```ts
const mode = form.getFieldMode('email')
// → 'onTouched' | 'onChange' | 'onBlur' | 'onSubmitOnly'
```

---
```

- [ ] **Step 3: Add `validateOn` to `ConnectOptions` in `docs/api/connect.md`**

Read `docs/api/connect.md`. Find the `ConnectOptions` interface block (lines ~7–22). It currently has `persist` and `format`. Add `validateOn` after `format`:

```ts
  /**
   * Overrides the form-level `validationMode` for this specific element.
   * Useful when one field needs different validation timing than the global default.
   *
   * @example
   * // Validate this field on blur even if the form default is 'onChange'
   * form.connect('email', emailEl, { validateOn: 'onBlur' })
   */
  validateOn?: ValidationMode
```

- [ ] **Step 4: Commit**

```bash
git add docs/api/core.md docs/api/connect.md
git commit -m "docs(api): document validationMode, validateOn, and getFieldMode"
```

---

### Task D: Getting-started documentation

**Files:**
- Modify: `docs/getting-started.md`

- [ ] **Step 1: Add "Validation Modes" section**

Read `docs/getting-started.md`. Find the `## Handling Server Errors` section and `## Next Steps` section. Insert the following between them:

```markdown
## Validation Modes

By default, `connect()` validates a field **on input, but only after the user has blurred it at least once** (`'onTouched'`). This avoids interrupting the user on first entry while providing immediate feedback during correction. You can change this globally or per field:

```ts
const form = createForm({
  initialValues: { email: '', password: '', terms: false },
  validationMode: {
    default: 'onTouched',    // most fields: validate after first blur
    fields: {
      password: 'onChange',  // password: validate on every keystroke
      terms: 'onSubmitOnly', // checkbox: only validate on submit
    },
  },
})
```

The four modes:

| Mode | When validation runs |
|---|---|
| `'onTouched'` | On input events, but only after the field has been blurred once. Also on every blur. **(default)** |
| `'onChange'` | On every input event immediately. |
| `'onBlur'` | On blur only. Never validates while typing. |
| `'onSubmitOnly'` | Only when `form.submit()` runs. No inline validation. |

Pass a single string to apply one mode to all fields:

```ts
const form = createForm({
  initialValues: { email: '', name: '' },
  validationMode: 'onBlur',
})
```

Override per element at `connect()` time using `validateOn`:

```ts
// Global mode is onTouched, but this specific field validates on change
form.connect('password', passwordEl, { validateOn: 'onChange' })
```

Framework adapter users can query the configured mode to implement the right event wiring:

```ts
const mode = form.getFieldMode('email') // → 'onTouched' | 'onChange' | 'onBlur' | 'onSubmitOnly'
```

```

- [ ] **Step 2: Commit**

```bash
git add docs/getting-started.md
git commit -m "docs: add validation modes section to getting-started"
```

---

### Task E: Framework guide documentation

**Files:**
- Modify: `docs/guides/react.md`
- Modify: `docs/guides/vue.md`
- Modify: `docs/guides/svelte.md`
- Modify: `docs/guides/solid.md`
- Modify: `docs/guides/angular.md`

Read each guide file first to find where to insert (look for `## Handling Server Errors` or the last section before any footer/next-steps section). Add the Validation Modes section after the server errors section in each guide.

- [ ] **Step 1: Add to `docs/guides/react.md`**

```markdown
## Validation Modes

Configure when validation triggers globally and per field:

```ts
const form = createForm({
  initialValues: { email: '', password: '' },
  validationMode: {
    default: 'onTouched',
    fields: { password: 'onChange' },
  },
})
```

For `connect()`-wired inputs this is automatic. For controlled inputs in React, call `form.getFieldMode(path)` to implement the right event wiring:

```tsx
function Field({ name }: { name: string }) {
  const { get, set, validate, getFieldMode } = useForm(form)
  const mode = getFieldMode(name)

  return (
    <input
      value={String(get(name) ?? '')}
      onChange={e => {
        set(name, e.target.value)
        if (mode === 'onChange') validate([name])
      }}
      onBlur={() => {
        if (mode === 'onBlur' || mode === 'onTouched') validate([name])
      }}
    />
  )
}
```

Override the mode for a single `useFormConnect`-wired field via `validateOn`:

```tsx
const ref = useFormConnect(form, 'email', { validateOn: 'onBlur' })
```
```

- [ ] **Step 2: Add to `docs/guides/vue.md`**

```markdown
## Validation Modes

Configure when validation triggers globally and per field:

```ts
const form = createForm({
  initialValues: { email: '', password: '' },
  validationMode: {
    default: 'onTouched',
    fields: { password: 'onChange' },
  },
})
```

For `connect()`-wired inputs this is automatic. For reactive inputs in Vue, use `getFieldMode` to wire the right events:

```vue
<script setup>
const { state, set, validate, getFieldMode } = useVueForm(form)

function handleChange(path, value) {
  set(path, value)
  if (getFieldMode(path) === 'onChange') validate([path])
}

function handleBlur(path) {
  const mode = getFieldMode(path)
  if (mode === 'onBlur' || mode === 'onTouched') validate([path])
}
</script>

<template>
  <input
    :value="state.values.email"
    @input="handleChange('email', $event.target.value)"
    @blur="handleBlur('email')"
  />
</template>
```
```

- [ ] **Step 3: Add to `docs/guides/svelte.md`**

```markdown
## Validation Modes

Configure when validation triggers globally and per field:

```ts
const form = createForm({
  initialValues: { email: '', password: '' },
  validationMode: {
    default: 'onTouched',
    fields: { password: 'onChange' },
  },
})
```

For `connect()`-wired inputs this is automatic. For Svelte reactive inputs, use `getFieldMode`:

```svelte
<script>
  const { state, set, validate, getFieldMode } = useSvelteForm(form)

  function handleInput(path, value) {
    set(path, value)
    if (getFieldMode(path) === 'onChange') validate([path])
  }

  function handleBlur(path) {
    const mode = getFieldMode(path)
    if (mode === 'onBlur' || mode === 'onTouched') validate([path])
  }
</script>

<input
  value={$state.values.email}
  on:input={e => handleInput('email', e.target.value)}
  on:blur={() => handleBlur('email')}
/>
```
```

- [ ] **Step 4: Add to `docs/guides/solid.md`**

```markdown
## Validation Modes

Configure when validation triggers globally and per field:

```ts
const form = createForm({
  initialValues: { email: '', password: '' },
  validationMode: {
    default: 'onTouched',
    fields: { password: 'onChange' },
  },
})
```

For `connect()`-wired inputs this is automatic. For SolidJS reactive inputs, call `form.getFieldMode` directly (not through `actions`):

```tsx
const { state } = useSolidForm(form)

function Field(props: { name: string }) {
  const mode = form.getFieldMode(props.name)
  return (
    <input
      value={state.values[props.name] as string ?? ''}
      onInput={e => {
        form.set(props.name, e.currentTarget.value)
        if (mode === 'onChange') form.validate([props.name])
      }}
      onBlur={() => {
        if (mode === 'onBlur' || mode === 'onTouched') form.validate([props.name])
      }}
    />
  )
}
```
```

- [ ] **Step 5: Add to `docs/guides/angular.md`**

```markdown
## Validation Modes

Configure when validation triggers globally and per field:

```ts
const form = createForm({
  initialValues: { email: '', password: '' },
  validationMode: {
    default: 'onTouched',
    fields: { password: 'onChange' },
  },
})
```

For `connect()`-wired inputs this is automatic. For Angular template-driven inputs, use `getFieldMode` in your component:

```ts
@Component({
  template: `
    <input
      [value]="form.get('email')"
      (input)="handleInput('email', $event.target.value)"
      (blur)="handleBlur('email')"
    />
  `
})
export class FormComponent {
  readonly neutroForm = useAngularForm(this.form, this.ngZone)

  handleInput(path: string, value: string) {
    this.form.set(path, value)
    if (this.form.getFieldMode(path) === 'onChange') {
      this.form.validate([path])
    }
  }

  handleBlur(path: string) {
    const mode = this.form.getFieldMode(path)
    if (mode === 'onBlur' || mode === 'onTouched') {
      this.form.validate([path])
    }
  }
}
```
```

- [ ] **Step 6: Commit**

```bash
git add docs/guides/react.md docs/guides/vue.md docs/guides/svelte.md docs/guides/solid.md docs/guides/angular.md
git commit -m "docs(guides): add validation modes section to all framework guides"
```

---

### Task F: Playground demo

**Files:**
- Modify: `docs/public/playground.html`

The `VANILLA` array in `playground.html` holds step objects with `{ title, code, run(el) }` shape. Each `run(el)` function builds its demo, appends to `el`, and returns the form instance (so the harness can call `form.destroy()` on navigation). Read the file to understand the pattern, then add a new step.

- [ ] **Step 1: Read the file and identify the insertion point**

Read `docs/public/playground.html`. Search for `VANILLA` and find the last step in the array. Insert the new step as the last entry (before the closing `]`).

- [ ] **Step 2: Add the validation modes step**

The new step to append to the `VANILLA` array:

```js
{
  title: 'Validation Modes',
  code: `const form = createForm({
  initialValues: { onChange: '', onBlur: '', onTouched: '', onSubmitOnly: '' },
  rules: { onChange: 'required', onBlur: 'required', onTouched: 'required', onSubmitOnly: 'required' },
  validationMode: {
    fields: {
      onChange: 'onChange',
      onBlur: 'onBlur',
      onTouched: 'onTouched',
      onSubmitOnly: 'onSubmitOnly',
    },
  },
})`,
  run(el) {
    const form = createForm({
      initialValues: { onChange: '', onBlur: '', onTouched: '', onSubmitOnly: '' },
      rules: { onChange: 'required', onBlur: 'required', onTouched: 'required', onSubmitOnly: 'required' },
      validationMode: {
        fields: {
          onChange: 'onChange',
          onBlur: 'onBlur',
          onTouched: 'onTouched',
          onSubmitOnly: 'onSubmitOnly',
        },
      },
    });

    el.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
        ${['onChange','onBlur','onTouched','onSubmitOnly'].map(mode => `
        <div>
          <label style="font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em">${mode}</label>
          <input id="vm-${mode}" placeholder="Type here..." style="display:block;width:100%;margin:.25rem 0;padding:.5rem;border:1px solid #d1d5db;border-radius:.375rem;box-sizing:border-box"/>
          <div id="vm-${mode}-err" style="color:#dc2626;font-size:.8rem;min-height:1.2em"></div>
        </div>`).join('')}
      </div>
      <button id="vm-submit" style="margin-top:1rem;padding:.5rem 1.25rem;background:#4f46e5;color:#fff;border:none;border-radius:.375rem;cursor:pointer">Submit (validates all)</button>
      <div id="vm-log" style="margin-top:.75rem;font-family:monospace;font-size:.8rem;background:#f3f4f6;padding:.5rem;border-radius:.375rem;min-height:2rem"></div>
    `;

    const log = el.querySelector('#vm-log');
    const modes = ['onChange', 'onBlur', 'onTouched', 'onSubmitOnly'];
    const unsubs = modes.map(mode => {
      form.connect(mode, el.querySelector(`#vm-${mode}`));
      return form.subscribeToPath(mode, (_, { error }) => {
        el.querySelector(`#vm-${mode}-err`).textContent = error ?? '';
      });
    });

    const unsubGlobal = form.subscribe(state => {
      log.textContent = 'errors: ' + JSON.stringify(state.errors);
    });

    el.querySelector('#vm-submit').addEventListener('click', () => {
      form.submit(() => { log.textContent = 'Valid! ✓'; });
    });

    el._cleanup = () => { unsubs.forEach(u => u()); unsubGlobal(); };
    return form;
  },
},
```

- [ ] **Step 3: Run all tests to confirm nothing regressed**

```bash
pnpm exec vitest run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add docs/public/playground.html
git commit -m "feat(playground): add validation modes demo step"
```
