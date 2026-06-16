# Persistence Guide

`@neutro/form` ships two built-in persistence adapters — `localStorageAdapter` and `sessionStorageAdapter` — plus a `PersistenceAdapter` interface for custom storage backends.

## Quick start

```ts
import { createForm, localStorageAdapter } from '@neutro/form/core'

const form = createForm({
  initialValues: { email: '', name: '' },
  persistence: {
    adapter: localStorageAdapter('my-signup-form'),
    debounceMs: 300, // default
  },
})

// Call hydrate() once after mount to restore saved values
await form.hydrate()
```

## Restoring on mount

`hydrate()` reads stored values and merges them with `initialValues`. Fields present in storage override the defaults; fields NOT in storage retain their `initialValues` value (safe across schema evolution).

## Clearing storage

`form.reset()` (no args) clears the storage slot and returns to initial values.
`form.reset(newValues)` writes the new values to storage and re-seeds the form.

## Excluding sensitive fields

```ts
persistence: {
  adapter: localStorageAdapter('form'),
  exclude: ['password', 'creditCard'],
}
```

Excluded paths are neither read from nor written to storage.

## Custom adapter

```ts
import type { PersistenceAdapter } from '@neutro/form/core'

const myAdapter: PersistenceAdapter<MyValues> = {
  async read() {
    const raw = await myDb.get('form-draft')
    return raw ? JSON.parse(raw) : null
  },
  async write(values) {
    await myDb.set('form-draft', JSON.stringify(values))
  },
  async clear() {
    await myDb.delete('form-draft')
  },
}
```

## SSR

Both built-in adapters guard against SSR: if `localStorage`/`sessionStorage` is not available, `read()` returns `null` and `write()`/`clear()` are no-ops. `hydrate()` is safe to call on the server — it returns immediately with no effect when the adapter returns `null`.
