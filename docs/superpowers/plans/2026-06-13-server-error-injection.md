# Server Error Injection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `form.setErrors(errors)` to `FormInstance<T>` so server-returned field errors can be merged into form state and behave identically to client-side validation errors.

**Architecture:** Three-line implementation inside the `createForm` closure — merge into the existing `errors` object, mark affected paths touched, call `notify()`. The method is added to the `FormInstance<T>` interface and exposed on the return object. The React adapter's `useForm` explicitly enumerates instance methods so it needs a one-line update too. All five framework guides and the getting-started page are updated with the server error pattern.

**Tech Stack:** TypeScript, Vitest, pnpm monorepo

---

## File Map

| File | Change |
|---|---|
| `packages/core/src/index.ts` | Add `setErrors` to interface (line 146), add implementation before `return {}` (line 1044), add to return block (line 1069) |
| `packages/adapters/react/src/index.ts` | Add `setErrors: form.setErrors` to `useForm` return (line 24) |
| `packages/core/test/form.test.ts` | Add `describe('setErrors', ...)` block |
| `docs/api/core.md` | Add `form.setErrors()` section after `form.reset()` |
| `docs/getting-started.md` | Add "Handling Server Errors" section before "Next Steps" |
| `docs/guides/react.md` | Add "Handling Server Errors" section at end of file |
| `docs/guides/vue.md` | Add "Handling Server Errors" section at end of file |
| `docs/guides/svelte.md` | Add "Handling Server Errors" section at end of file |
| `docs/guides/solid.md` | Add "Handling Server Errors" section at end of file |
| `docs/guides/angular.md` | Add "Handling Server Errors" section at end of file |

---

## Task 1: Write failing tests

**Files:**
- Modify: `packages/core/test/form.test.ts` (append after the last `describe` block)

- [ ] **Step 1: Add the test block**

Append this block at the end of `packages/core/test/form.test.ts`:

```ts
// ---------------------------------------------------------------------------
// setErrors
// ---------------------------------------------------------------------------

describe('setErrors', () => {
  it('merges server errors into existing error state without wiping client errors', async () => {
    const form = createForm({
      initialValues: { email: '', username: '' },
      rules: { username: 'required' },
    });
    await form.validate();
    expect(form.getState().errors.username).toBeTruthy();
    expect(form.getState().errors.email).toBeUndefined();

    form.setErrors({ email: 'Already taken' });

    expect(form.getState().errors.email).toBe('Already taken');
    expect(form.getState().errors.username).toBeTruthy();
  });

  it('marks affected paths as touched', () => {
    const form = createForm({ initialValues: { email: '' } });
    expect(form.getState().touched.email).toBeFalsy();

    form.setErrors({ email: 'Already taken' });

    expect(form.getState().touched.email).toBe(true);
  });

  it('marks multiple affected paths as touched in one call', () => {
    const form = createForm({ initialValues: { email: '', username: '' } });

    form.setErrors({ email: 'Already taken', username: 'Unavailable' });

    expect(form.getState().touched.email).toBe(true);
    expect(form.getState().touched.username).toBe(true);
  });

  it('does not touch paths not present in the incoming errors', () => {
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

  it('does not notify path subscriber for an unaffected path', () => {
    const form = createForm({ initialValues: { email: '', username: '' } });
    const listener = vi.fn();
    form.subscribeToPath('username', listener);
    listener.mockClear();

    form.setErrors({ email: 'Already taken' });

    expect(listener).not.toHaveBeenCalled();
  });

  it('server error clears when validate() runs and validator returns no error for that path', async () => {
    const form = createForm({
      initialValues: { email: 'good@example.com' },
      validator: () => ({}),
    });
    form.setErrors({ email: 'Already taken' });
    expect(form.getState().errors.email).toBe('Already taken');

    await form.validate();

    expect(form.getState().errors.email).toBeUndefined();
  });

  it('server error clears when set() is called with validate:true and validator returns no error', async () => {
    const form = createForm({
      initialValues: { email: '' },
      validator: () => ({}),
    });
    form.setErrors({ email: 'Already taken' });

    form.set('email', 'new@example.com', { validate: true });
    await new Promise((r) => setTimeout(r, 0));

    expect(form.getState().errors.email).toBeUndefined();
  });

  it('validate(specificPaths) clears only the validated path, not other server errors', async () => {
    const form = createForm({
      initialValues: { email: '', username: '' },
      validator: () => ({}),
    });
    form.setErrors({ email: 'Already taken', username: 'Unavailable' });

    await form.validate(['email']);

    expect(form.getState().errors.email).toBeUndefined();
    expect(form.getState().errors.username).toBe('Unavailable');
  });

  it('server error survives set() without validate:true', () => {
    const form = createForm({ initialValues: { email: '' } });
    form.setErrors({ email: 'Already taken' });

    form.set('email', 'new@example.com');

    expect(form.getState().errors.email).toBe('Already taken');
  });

  it('reset() clears all server-injected errors', () => {
    const form = createForm({ initialValues: { email: '' } });
    form.setErrors({ email: 'Already taken' });

    form.reset();

    expect(form.getState().errors).toEqual({});
  });

  it('second setErrors call overwrites the same key', () => {
    const form = createForm({ initialValues: { email: '' } });
    form.setErrors({ email: 'Already taken' });
    form.setErrors({ email: 'Try a different address' });

    expect(form.getState().errors.email).toBe('Try a different address');
  });

  it('second setErrors call merges new keys without removing prior server errors', () => {
    const form = createForm({ initialValues: { email: '', username: '' } });
    form.setErrors({ email: 'Already taken' });
    form.setErrors({ username: 'Unavailable' });

    expect(form.getState().errors.email).toBe('Already taken');
    expect(form.getState().errors.username).toBe('Unavailable');
  });

  it('supports nested dot-notation paths', () => {
    const form = createForm({ initialValues: { user: { email: '' } } });

    form.setErrors({ 'user.email': 'Already taken' });

    expect(form.getState().errors['user.email']).toBe('Already taken');
    expect(form.getState().touched['user.email']).toBe(true);
  });

  it('does not affect isValidating state', () => {
    const form = createForm({ initialValues: { email: '' } });

    form.setErrors({ email: 'Already taken' });

    expect(form.getState().isValidating).toBe(false);
  });

  it('handles empty object without throwing or notifying', () => {
    const form = createForm({ initialValues: { email: '' } });
    const listener = vi.fn();
    form.subscribe(listener);
    listener.mockClear();

    expect(() => form.setErrors({})).not.toThrow();
    // notify() is still called; subscriber receives unchanged state
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm exec vitest run packages/core/test/form.test.ts --reporter=verbose 2>&1 | grep -A3 "setErrors"
```

Expected: test suite fails with `form.setErrors is not a function` or a TypeScript compile error.

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

Expected: all `setErrors` tests pass. Full suite remains green.

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

In `docs/api/core.md`, locate the `### form.reset()` section. Add the following section immediately after it (after its closing `---` separator, or append one if missing):

```markdown
---

### `form.setErrors(errors)`

```ts
form.setErrors(errors: Partial<Record<string, string>>): void
```

Merges server-returned field errors into form state. Each injected error behaves identically to a client-side validation error — it appears in `state.errors`, notifies all subscribers, and clears the next time the affected field is validated.

**When to use:** inside your submit handler, after an API call returns field-level validation errors.

```ts
form.handleSubmit(async (payload) => {
  const res = await fetch('/api/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const { errors } = await res.json()
    // e.g. { email: 'Already taken', username: 'Unavailable' }
    form.setErrors(errors)
  }
})
```

**Merge semantics:** only the keys present in the argument are written. Existing errors for other fields are untouched.

**Touched:** each path in the argument is marked `touched: true` so the error displays immediately, regardless of whether the user has interacted with the field.

**Clearing:** server errors clear the same way client errors do — when `validate()` runs for a path and the validator returns no error for it. `reset()` clears all errors including server-injected ones.
```

- [ ] **Step 2: Verify the docs build without error**

```bash
pnpm docs:build 2>&1 | tail -10
```

Expected: build succeeds with no warnings.

- [ ] **Step 3: Commit**

```bash
git add docs/api/core.md
git commit -m "docs: document form.setErrors() in API reference"
```

---

## Task 6: Add server error pattern to getting-started

**Files:**
- Modify: `docs/getting-started.md` (add new section before `## Next Steps`)

- [ ] **Step 1: Add the section**

In `docs/getting-started.md`, find the `## Next Steps` heading (currently the last section, after `## Async Validator`). Insert the following block immediately before it:

```markdown
## Handling Server Errors

Client-side validation runs before the request leaves the browser, but servers often return additional field-level errors (duplicate email, reserved username, invalid coupon code). Use `form.setErrors()` to merge these back into form state after a failed API call:

```ts
import { createForm } from '@neutro/form/core'

const form = createForm({
  initialValues: { email: '', username: '' },
  rules: {
    email: ['required', 'email'],
    username: 'required',
  },
})

form.handleSubmit(async (payload) => {
  const res = await fetch('/api/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const { errors } = await res.json()
    // errors might be: { email: 'Already taken', username: 'Unavailable' }
    form.setErrors(errors)
    return
  }

  // success path
})
```

Server errors behave exactly like client errors: they appear in `state.errors`, fire all the same subscribers, and clear the next time that field is validated. Calling `form.reset()` wipes them along with everything else.

```

- [ ] **Step 2: Verify docs build**

```bash
pnpm docs:build 2>&1 | tail -10
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add docs/getting-started.md
git commit -m "docs: add server error handling section to getting-started"
```

---

## Task 7: Add server error pattern to framework guides

**Files:**
- Modify: `docs/guides/react.md`
- Modify: `docs/guides/vue.md`
- Modify: `docs/guides/svelte.md`
- Modify: `docs/guides/solid.md`
- Modify: `docs/guides/angular.md`

Each guide gets a `## Handling Server Errors` section appended at the end of the file. The submit pattern already exists in each guide's global state section — these additions show what to do when the server responds with errors.

- [ ] **Step 1: Append to `docs/guides/react.md`**

Append at the end of the file:

```markdown
## Handling Server Errors

Use `form.setErrors()` inside your submit handler to feed API validation errors back into form state. They surface in `errors` and clear on the next validation run — no extra wiring required.

```tsx
import { createForm } from '@neutro/form/core'
import { useForm } from '@neutro/form/adapters/react'

const registerForm = createForm({
  initialValues: { email: '', username: '' },
  rules: { email: ['required', 'email'], username: 'required' },
})

export function RegisterForm() {
  const { errors, touched, isSubmitting } = useForm(registerForm)

  const handleSubmit = registerForm.handleSubmit(async (payload) => {
    const res = await fetch('/api/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const { errors } = await res.json()
      registerForm.setErrors(errors)
    }
  })

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={registerForm.get('email') as string}
        onChange={(e) => registerForm.set('email', e.target.value, { touch: true })}
      />
      {touched.email && errors.email && <span>{errors.email}</span>}

      <input
        value={registerForm.get('username') as string}
        onChange={(e) => registerForm.set('username', e.target.value, { touch: true })}
      />
      {touched.username && errors.username && <span>{errors.username}</span>}

      <button type="submit" disabled={isSubmitting}>Register</button>
    </form>
  )
}
```
```

- [ ] **Step 2: Append to `docs/guides/vue.md`**

Append at the end of the file:

```markdown
## Handling Server Errors

Use `form.setErrors()` inside your submit handler to feed API validation errors back into form state.

```vue
<script setup lang="ts">
import { createForm } from '@neutro/form/core'
import { useVueForm } from '@neutro/form/adapters/vue'

const form = createForm({
  initialValues: { email: '', username: '' },
  rules: { email: ['required', 'email'], username: 'required' },
})

const { state } = useVueForm(form)

async function handleSubmit() {
  const valid = await form.validate()
  if (!valid) return

  const res = await fetch('/api/register', {
    method: 'POST',
    body: JSON.stringify(form.getPayload()),
  })
  if (!res.ok) {
    const { errors } = await res.json()
    form.setErrors(errors)
  }
}
</script>

<template>
  <form @submit.prevent="handleSubmit">
    <input
      :value="state.values.email"
      @input="form.set('email', ($event.target as HTMLInputElement).value, { touch: true })"
    />
    <span v-if="state.touched.email && state.errors.email">{{ state.errors.email }}</span>

    <input
      :value="state.values.username"
      @input="form.set('username', ($event.target as HTMLInputElement).value, { touch: true })"
    />
    <span v-if="state.touched.username && state.errors.username">{{ state.errors.username }}</span>

    <button type="submit" :disabled="state.isSubmitting">Register</button>
  </form>
</template>
```
```

- [ ] **Step 3: Append to `docs/guides/svelte.md`**

Append at the end of the file:

```markdown
## Handling Server Errors

Use `form.setErrors()` inside your submit handler to feed API validation errors back into form state.

```svelte
<script lang="ts">
  import { createForm } from '@neutro/form/core'
  import { useSvelteForm } from '@neutro/form/adapters/svelte'

  const form = createForm({
    initialValues: { email: '', username: '' },
    rules: { email: ['required', 'email'], username: 'required' },
  })

  const { state } = useSvelteForm(form)

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    const valid = await form.validate()
    if (!valid) return

    const res = await fetch('/api/register', {
      method: 'POST',
      body: JSON.stringify(form.getPayload()),
    })
    if (!res.ok) {
      const { errors } = await res.json()
      form.setErrors(errors)
    }
  }
</script>

<form on:submit={handleSubmit}>
  <input
    value={$state.values.email}
    on:input={(e) => form.set('email', e.currentTarget.value, { touch: true })}
  />
  {#if $state.touched.email && $state.errors.email}
    <span class="error">{$state.errors.email}</span>
  {/if}

  <input
    value={$state.values.username}
    on:input={(e) => form.set('username', e.currentTarget.value, { touch: true })}
  />
  {#if $state.touched.username && $state.errors.username}
    <span class="error">{$state.errors.username}</span>
  {/if}

  <button type="submit" disabled={$state.isSubmitting}>Register</button>
</form>
```
```

- [ ] **Step 4: Append to `docs/guides/solid.md`**

Append at the end of the file:

```markdown
## Handling Server Errors

Use `actions.setErrors()` inside your submit handler to feed API validation errors back into form state. In SolidJS, `actions` is the second element returned by `useSolidForm` and holds all `FormInstance` methods.

```tsx
import { createForm } from '@neutro/form/core'
import { useSolidForm } from '@neutro/form/adapters/solid'

const form = createForm({
  initialValues: { email: '', username: '' },
  rules: { email: ['required', 'email'], username: 'required' },
})

export function RegisterForm() {
  const [state, actions] = useSolidForm(form)

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault()
    const valid = await form.validate()
    if (!valid) return

    const res = await fetch('/api/register', {
      method: 'POST',
      body: JSON.stringify(form.getPayload()),
    })
    if (!res.ok) {
      const { errors } = await res.json()
      actions.setErrors(errors)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={state.values.email}
        onInput={(e) => actions.set('email', e.currentTarget.value, { touch: true })}
      />
      {state.touched.email && state.errors.email && <span>{state.errors.email}</span>}

      <input
        value={state.values.username}
        onInput={(e) => actions.set('username', e.currentTarget.value, { touch: true })}
      />
      {state.touched.username && state.errors.username && <span>{state.errors.username}</span>}

      <button type="submit" disabled={state.isSubmitting}>Register</button>
    </form>
  )
}
```
```

- [ ] **Step 5: Append to `docs/guides/angular.md`**

Append at the end of the file:

```markdown
## Handling Server Errors

Use `this.form.setErrors()` inside your submit handler to feed API validation errors back into form state.

```ts
import { Component } from '@angular/core'
import { createForm } from '@neutro/form/core'
import { useAngularForm } from '@neutro/form/adapters/angular'

@Component({
  selector: 'app-register-form',
  standalone: true,
  template: `
    <form (ngSubmit)="handleSubmit()">
      <input
        [value]="state().values.email"
        (input)="form.set('email', $event.target.value, { touch: true })"
      />
      @if (state().touched['email'] && state().errors['email']) {
        <span class="error">{{ state().errors['email'] }}</span>
      }

      <input
        [value]="state().values.username"
        (input)="form.set('username', $event.target.value, { touch: true })"
      />
      @if (state().touched['username'] && state().errors['username']) {
        <span class="error">{{ state().errors['username'] }}</span>
      }

      <button type="submit" [disabled]="state().isSubmitting">Register</button>
    </form>
  `,
})
export class RegisterFormComponent {
  readonly form = createForm({
    initialValues: { email: '', username: '' },
    rules: { email: ['required', 'email'], username: 'required' },
  })

  readonly state = useAngularForm(this.form)

  async handleSubmit() {
    const valid = await this.form.validate()
    if (!valid) return

    const res = await fetch('/api/register', {
      method: 'POST',
      body: JSON.stringify(this.form.getPayload()),
    })
    if (!res.ok) {
      const { errors } = await res.json()
      this.form.setErrors(errors)
    }
  }
}
```
```

- [ ] **Step 6: Verify docs build**

```bash
pnpm docs:build 2>&1 | tail -10
```

Expected: build succeeds with no warnings.

- [ ] **Step 7: Commit**

```bash
git add docs/guides/react.md docs/guides/vue.md docs/guides/svelte.md docs/guides/solid.md docs/guides/angular.md
git commit -m "docs: add server error handling section to all framework guides"
```
