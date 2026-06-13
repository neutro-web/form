# Server Error Injection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `form.setErrors(errors)` to `FormInstance<T>` so server-returned field errors can be merged into form state and behave identically to client-side validation errors.

**Architecture:** Three-line implementation inside the `createForm` closure — merge into the existing `errors` object, mark affected paths touched, call `notify()`. The method is added to the `FormInstance<T>` interface and exposed on the return object. The React adapter's `useForm` explicitly enumerates instance methods so it needs a one-line update too.

**Tech Stack:** TypeScript, Vitest, pnpm monorepo

---

## File Map

| File | Change |
|---|---|
| `packages/core/src/index.ts` | Add `setErrors` to interface (line 146), add implementation before `return {}` (line 1044), add to return block (line 1069) |
| `packages/adapters/react/src/index.ts` | Add `setErrors: form.setErrors` to `useForm` return (line 24) |
| `packages/core/test/form.test.ts` | Add `describe('setErrors', ...)` block |
| `docs/api/core.md` | Add `form.setErrors()` section |

---

## Task 1: Write failing tests

**Files:**
- Modify: `packages/core/test/form.test.ts` (append after the last `describe` block)

- [ ] **Step 1: Add the test block**

Append this block at the end of `packages/core/test/form.test.ts`, before the final closing line if any, or simply at the end of the file:

```ts
// ---------------------------------------------------------------------------
// setErrors
// ---------------------------------------------------------------------------

describe('setErrors', () => {
  it('merges server errors into existing error state', async () => {
    const form = createForm({
      initialValues: { email: '', username: '' },
      rules: { username: 'required' },
    });
    await form.validate();
    // username has a client error; email does not
    expect(form.getState().errors.username).toBeTruthy();
    expect(form.getState().errors.email).toBeUndefined();

    form.setErrors({ email: 'Already taken' });

    // server error added; client error for username untouched
    expect(form.getState().errors.email).toBe('Already taken');
    expect(form.getState().errors.username).toBeTruthy();
  });

  it('marks affected paths as touched', () => {
    const form = createForm({ initialValues: { email: '' } });
    expect(form.getState().touched.email).toBeFalsy();

    form.setErrors({ email: 'Already taken' });

    expect(form.getState().touched.email).toBe(true);
  });

  it('does not touch paths not in the incoming errors', () => {
    const form = createForm({ initialValues: { email: '', username: '' } });

    form.setErrors({ email: 'Already taken' });

    expect(form.getState().touched.username).toBeFalsy();
  });

  it('notifies global subscribers', () => {
    const form = createForm({ initialValues: { email: '' } });
    const listener = vi.fn();
    form.subscribe(listener);
    listener.mockClear();

    form.setErrors({ email: 'Already taken' });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].errors.email).toBe('Already taken');
  });

  it('notifies path subscriber for the affected path', () => {
    const form = createForm({ initialValues: { email: '' } });
    const listener = vi.fn();
    form.subscribeToPath('email', listener);
    listener.mockClear();

    form.setErrors({ email: 'Already taken' });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][1].error).toBe('Already taken');
  });

  it('server error clears when validate() runs and validator returns no error', async () => {
    const form = createForm({
      initialValues: { email: 'good@example.com' },
      validator: () => ({}),
    });
    form.setErrors({ email: 'Already taken' });
    expect(form.getState().errors.email).toBe('Already taken');

    await form.validate();

    expect(form.getState().errors.email).toBeUndefined();
  });

  it('server error survives set() without validate:true', () => {
    const form = createForm({ initialValues: { email: '' } });
    form.setErrors({ email: 'Already taken' });

    form.set('email', 'new@example.com');

    expect(form.getState().errors.email).toBe('Already taken');
  });

  it('reset() clears server-injected errors', () => {
    const form = createForm({ initialValues: { email: '' } });
    form.setErrors({ email: 'Already taken' });
    expect(form.getState().errors.email).toBe('Already taken');

    form.reset();

    expect(form.getState().errors.email).toBeUndefined();
    expect(form.getState().errors).toEqual({});
  });

  it('overwrites a previously injected server error with a new one', () => {
    const form = createForm({ initialValues: { email: '' } });
    form.setErrors({ email: 'Already taken' });
    form.setErrors({ email: 'Try a different address' });

    expect(form.getState().errors.email).toBe('Try a different address');
  });

  it('handles empty object without throwing', () => {
    const form = createForm({ initialValues: { email: '' } });
    expect(() => form.setErrors({})).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm exec vitest run packages/core/test/form.test.ts --reporter=verbose 2>&1 | grep -A3 "setErrors"
```

Expected: test suite fails with `form.setErrors is not a function` (or TypeScript compile error — either means Task 1 is done correctly).

---

## Task 2: Add `setErrors` to the `FormInstance<T>` interface

**Files:**
- Modify: `packages/core/src/index.ts` (line 146 — after `destroy: () => void;`)

- [ ] **Step 1: Add the method signature**

In `packages/core/src/index.ts`, find the `FormInstance<T>` interface. The current last line before the closing `}` is:

```ts
  destroy: () => void;
```

Change it to:

```ts
  destroy: () => void;
  setErrors(errors: Partial<Record<Path<T> | (string & {}), string>>): void;
```

---

## Task 3: Implement `setErrors` and expose it on the return object

**Files:**
- Modify: `packages/core/src/index.ts` (before `return {` at line 1045; inside return block after `batch,` at line 1069)

- [ ] **Step 1: Add the implementation**

In `packages/core/src/index.ts`, find this block (around line 1043):

```ts
  };

  return {
    subscribe,
```

Insert the `setErrors` function immediately before the `return {` line:

```ts
  const setErrors = (incoming: Record<string, string>): void => {
    Object.assign(errors, incoming);
    Object.keys(incoming).forEach(p => { touched[p] = true; });
    notify();
  };

  return {
    subscribe,
```

- [ ] **Step 2: Add `setErrors` to the return block**

In `packages/core/src/index.ts`, find this line in the return block (around line 1069):

```ts
    batch,
```

Add `setErrors` after it:

```ts
    batch,
    setErrors,
```

- [ ] **Step 3: Run the core tests and verify they pass**

```bash
pnpm exec vitest run packages/core/test/form.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: all `setErrors` tests pass. Full suite should remain green.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/index.ts packages/core/test/form.test.ts
git commit -m "feat(core): add setErrors for server error injection"
```

---

## Task 4: Update React adapter `useForm`

**Files:**
- Modify: `packages/adapters/react/src/index.ts` (line 24 — after `arraySwap: form.arraySwap,`)

`useForm` explicitly enumerates all `FormInstance` methods. Without this change TypeScript will error because the return type (`Omit<FormInstance<T>, 'subscribe' | 'getState'>`) requires `setErrors` but the object literal won't have it.

- [ ] **Step 1: Add `setErrors` to the `useForm` return**

In `packages/adapters/react/src/index.ts`, find:

```ts
    arraySwap: form.arraySwap,
  } as FormState<T> & Omit<FormInstance<T>, 'subscribe' | 'getState'>;
```

Change to:

```ts
    arraySwap: form.arraySwap,
    setErrors: form.setErrors,
  } as FormState<T> & Omit<FormInstance<T>, 'subscribe' | 'getState'>;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @neutro/form-react exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run full test suite**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/adapters/react/src/index.ts
git commit -m "feat(react): expose setErrors from useForm"
```

---

## Task 5: Document `form.setErrors()` in the API reference

**Files:**
- Modify: `docs/api/core.md` (add new section after `form.reset()`)

- [ ] **Step 1: Add the documentation section**

In `docs/api/core.md`, locate the `form.reset()` section. Add the following section immediately after it:

```markdown
---

### `form.setErrors(errors)`

```ts
form.setErrors(errors: Partial<Record<string, string>>): void
```

Merges server-returned field errors into form state. Each injected error behaves identically to a client-side validation error — it appears in `state.errors`, notifies all subscribers, and clears the next time the field is validated.

**When to use:** inside your submit handler, after an API call returns field-level validation errors.

```ts
form.handleSubmit(async (payload) => {
  const res = await fetch('/api/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const { errors } = await res.json()
    // errors: { email: 'Already taken', username: 'Unavailable' }
    form.setErrors(errors)
  }
})
```

**Merge semantics:** only the keys in `errors` are written. Existing errors for other fields are untouched.

**Touched:** each path in `errors` is marked `touched: true` so errors display immediately, regardless of whether the user has interacted with those fields.

**Clearing:** server errors clear the same way client errors do — when `validate()` runs for a path and the validator returns no error for it. `reset()` clears all errors including server-injected ones.
```

- [ ] **Step 2: Verify the docs build without error**

```bash
pnpm docs:build 2>&1 | tail -10
```

Expected: build succeeds with no warnings about broken links or missing references.

- [ ] **Step 3: Commit**

```bash
git add docs/api/core.md
git commit -m "docs: document form.setErrors() API"
```
