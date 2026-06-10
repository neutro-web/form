# Dependency Graph

The `dependencies` option lets you declare that validating one field should automatically re-validate other fields. The dependency graph is compiled into a transitive closure once at `createForm` init time, so runtime lookup is O(1) — no graph traversal on every keystroke.

---

## Declaring Dependencies

```ts
const form = createForm({
  initialValues: {
    password: '',
    confirmPassword: '',
  },
  validator: (values) => {
    const errors: Record<string, string> = {}
    if (values.password.length < 8) errors.password = 'Min 8 characters'
    if (values.confirmPassword !== values.password)
      errors.confirmPassword = 'Passwords do not match'
    return errors
  },

  dependencies: {
    // When 'password' is validated, also validate 'confirmPassword'
    password: ['confirmPassword'],
  },
})
```

Now when the user changes `password`:

```ts
form.set('password', 'newPass', { validate: true })
// → validates ['password', 'confirmPassword'] in one pass
```

Without this dependency, `confirmPassword` would only be checked when the user explicitly edits that field — meaning a user who fills in `confirmPassword` first, then changes `password`, would not see the mismatch error until they touch `confirmPassword` again.

---

## Transitive Closure

Dependencies are resolved transitively. If A depends on B, and B depends on C, then changing A will validate A, B, and C.

```ts
const form = createForm({
  initialValues: { startDate: '', endDate: '', duration: '' },
  dependencies: {
    startDate: ['endDate'],    // changing startDate also validates endDate
    endDate: ['duration'],     // changing endDate also validates duration
    // transitive: startDate → endDate → duration
    // so changing startDate validates all three
  },
  validator: (values) => {
    const errors: Record<string, string> = {}
    const start = new Date(values.startDate)
    const end = new Date(values.endDate)

    if (end <= start) errors.endDate = 'Must be after start date'

    const days = (end.getTime() - start.getTime()) / 86_400_000
    if (values.duration !== String(Math.round(days)))
      errors.duration = 'Duration does not match dates'

    return errors
  },
})
```

The transitive closure is computed by `compileDependencyScopes` at init time and stored in `preComputedScopes`. There is no runtime graph traversal.

---

## Wildcard Paths

For array fields, use the `*` wildcard to match any index:

```ts
const form = createForm({
  initialValues: {
    destinations: [
      { departDate: '', returnDate: '' },
    ],
  },
  dependencies: {
    'destinations.*.departDate': ['destinations.*.returnDate'],
  },
  validator: (values) => {
    const errors: Record<string, string> = {}
    values.destinations.forEach((dest, i) => {
      if (dest.returnDate && dest.returnDate <= dest.departDate) {
        errors[`destinations.${i}.returnDate`] = 'Must be after departure'
      }
    })
    return errors
  },
})
```

When `destinations.1.departDate` changes, the engine substitutes the concrete index (`1`) for the wildcard and resolves the dependent path to `destinations.1.returnDate`. The wildcard substitution happens inside `runValidation` at runtime, after the O(1) scope lookup.

---

## Bidirectional Dependencies

To make validation symmetric — so that either field change re-validates both — declare the dependency in both directions:

```ts
dependencies: {
  password: ['confirmPassword'],
  confirmPassword: ['password'],
}
```

This is common for cross-field equality checks where it's unclear which field the user will edit last.

---

## Combined Example: Sign-Up Form

```ts
import { createForm } from '@agnostic-web/form-core'

const form = createForm({
  initialValues: {
    email: '',
    password: '',
    confirmPassword: '',
    startDate: '',
    endDate: '',
  },
  dependencies: {
    password: ['confirmPassword'],
    confirmPassword: ['password'],
    startDate: ['endDate'],
  },
  validator: async (values, _scope, signal) => {
    const errors: Record<string, string> = {}

    if (!values.email.includes('@'))
      errors.email = 'Invalid email'

    if (values.password.length < 8)
      errors.password = 'Min 8 characters'

    if (values.confirmPassword !== values.password)
      errors.confirmPassword = 'Passwords do not match'

    if (values.endDate && values.startDate && values.endDate <= values.startDate)
      errors.endDate = 'Must be after start date'

    return errors
  },
})

// User changes password — confirmPassword is automatically re-validated
form.set('password', 'secret123', { touch: true, validate: true })

// User changes startDate — endDate is automatically re-validated
form.set('startDate', '2025-03-01', { touch: true, validate: true })
```
