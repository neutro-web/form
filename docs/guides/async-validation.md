# Async Validation

`@neutro/form` has first-class support for async validation built into the core engine. This page explains the three mechanisms that prevent stale results, race conditions, and redundant network requests.

---

## Epoch Protection

Every call to `form.validate()` increments an internal `asyncEpoch` counter. When the validator `Promise` resolves, the engine compares the epoch at resolution time to the current epoch. If they differ — meaning a newer validation call has started while this one was in-flight — the result is silently discarded.

```
User types "a"  → epoch 1, validator fires
User types "ab" → epoch 2, validator fires
epoch 1 resolves → discarded (epoch 1 ≠ current epoch 2)
epoch 2 resolves → applied ✓
```

This means you never need to guard against stale results yourself. The engine handles it unconditionally.

---

## Per-Scope Debounce

`asyncDebounceMs` (default 300 ms) is the delay between the last `set` call and the actual `await` of the validator. Importantly, the timer is per-invocation — concurrent fields do not reset each other's timer.

```ts
const form = createForm({
  initialValues: { username: '', email: '' },
  asyncDebounceMs: 400,
  validator: async (values) => { /* ... */ },
})

// User types in the username field — timer A starts (400 ms)
form.set('username', 'alice', { validate: true })

// 200 ms later, user types in the email field — timer B starts independently
form.set('email', 'ali', { validate: true })

// username validator fires at t=400 (timer A expires)
// email validator fires at t=200+400=600 (timer B expires)
// Neither timer reset the other
```

---

## AbortController Integration

Each validation scope gets its own `AbortController`. When a field is re-validated before the previous run for that scope has completed, the engine aborts the previous controller immediately — before the debounce timer even expires.

Pass the `signal` argument to `fetch` (or any abort-aware API) to benefit from this:

```ts
import { createForm } from '@neutro/form/core'

const form = createForm({
  initialValues: { username: '' },
  asyncDebounceMs: 400,

  validator: async (values, _scopePaths, signal) => {
    const errors: Record<string, string> = {}

    if (!values.username) {
      errors.username = 'Required'
      return errors
    }

    if (values.username.length < 3) {
      errors.username = 'At least 3 characters'
      return errors
    }

    // signal is aborted if the user types again before this resolves
    const response = await fetch(
      `/api/check-username?q=${encodeURIComponent(values.username)}`,
      { signal }
    )

    // fetch throws AbortError when signal fires — the engine catches it and
    // discards the result automatically. You do not need a try/catch here.
    const { available } = await response.json()

    if (!available) {
      errors.username = 'Username is already taken'
    }

    return errors
  },
})
```

When `signal` is aborted, `fetch` rejects with an `AbortError`. The engine catches this specifically (it checks `err.name === 'AbortError'`) and treats the invocation as cancelled rather than as a validation failure.

---

## Showing Async Validation Status

While async validation is in progress, `form.getState().isValidating` is `true`. Use this to show a spinner or disable the submit button:

```tsx
// React example
function UsernameField({ form }) {
  const username = useFormPath(form, 'username')         // the field value
  const { isValidating, errors, touched } = useForm(form)

  return (
    <div>
      <input
        value={username}
        onChange={(e) =>
          form.set('username', e.target.value, { touch: true, validate: true })
        }
      />
      {isValidating && <span>Checking availability…</span>}
      {!isValidating && touched.username && errors.username && (
        <span className="error">{errors.username}</span>
      )}
    </div>
  )
}
```

---

## Scoping Async Checks to Specific Fields

The `scopePaths` argument tells the validator which fields triggered this run. Use it to skip expensive async checks when they aren't needed:

```ts
const form = createForm({
  initialValues: { username: '', email: '' },
  asyncDebounceMs: 400,

  validator: async (values, scopePaths, signal) => {
    const errors: Record<string, string> = {}

    // Always run cheap sync checks
    if (!values.email.includes('@')) errors.email = 'Invalid email'
    if (values.username.length < 3) errors.username = 'Too short'

    // Only hit the API when username is explicitly in scope
    if (!errors.username && scopePaths?.includes('username')) {
      const res = await fetch(`/api/check-username?q=${values.username}`, { signal })
      const { available } = await res.json()
      if (!available) errors.username = 'Already taken'
    }

    // Only hit the API when email is in scope
    if (!errors.email && scopePaths?.includes('email')) {
      const res = await fetch(`/api/check-email?q=${values.email}`, { signal })
      const { available } = await res.json()
      if (!available) errors.email = 'Already registered'
    }

    return errors
  },
})
```

This pattern cuts async requests dramatically on forms where only one or two fields have uniqueness requirements.
