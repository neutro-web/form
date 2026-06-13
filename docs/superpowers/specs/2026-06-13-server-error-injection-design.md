# Server Error Injection — Design Spec

**Date:** 2026-06-13  
**Status:** Approved

## Problem

`errors` state is fully internal to the `createForm` closure. The only writer is the validator function. When a server responds with field-level errors (e.g. `{ email: "Already taken" }`), there is no path to surface those errors into form state. Errors thrown inside the `handleSubmit` callback are caught and silently dropped.

## Solution

Add `form.setErrors(errors)` to `FormInstance<T>`. Server errors merge into the existing `errors` state and behave identically to client-side validation errors from that point forward — same subscribers, same display logic, same clearing mechanism.

## API

### Signature

```ts
// Added to FormInstance<T>
setErrors(errors: Partial<Record<Path<T> | (string & {}), string>>): void
```

Accepts any valid form path. The `string & {}` union is the same escape hatch used throughout the existing API for dynamic/runtime paths.

### Behavior

**On call:**
- Merges incoming errors into internal `errors` state. Keys not present in the incoming object are untouched.
- Marks each affected path as `touched: true` so errors display immediately in UIs that gate error visibility on the `touched` flag.
- Calls `notify()` — all subscribers (path subscribers, global subscribers, framework adapters) receive the update synchronously.

**Clearing:**
- Server errors clear the same way client errors do: when `runValidation` runs for a path, whatever the validator returns replaces the error for that path. If the validator returns no error, the field clears.
- `form.reset()` clears all errors including server-injected ones, same as the full state wipe it already performs.
- Calling `form.set(path, value)` alone (without `validate: true`) does not clear server errors, identical to client error behavior.

### Usage

```ts
form.handleSubmit(async (payload) => {
  const res = await fetch('/api/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const { errors } = await res.json()
    form.setErrors(errors)
  }
})
```

After `handleSubmit` runs, all fields are already marked touched (existing behavior in `submit()`). `setErrors` then merges the server errors in and notifies subscribers. No additional touched-marking is needed for the standard post-submit case.

## Implementation

### Core closure (`packages/core/src/index.ts`)

Add inside the `createForm` closure:

```ts
const setErrors = (incoming: Record<string, string>) => {
  Object.assign(errors, incoming);
  Object.keys(incoming).forEach(p => { touched[p] = true; });
  notify();
};
```

Add to the `return {}` block:

```ts
setErrors,
```

### `FormInstance<T>` interface (`packages/core/src/index.ts`)

Add to the interface:

```ts
setErrors(errors: Partial<Record<Path<T> | (string & {}), string>>): void;
```

### No adapter changes required

Framework adapters (`react`, `vue`, `svelte`, `solid`, `angular`) already subscribe to `errors` state. `setErrors` writes to the same `errors` object and calls `notify()`, so adapters receive the update through their existing subscription paths with no changes.

### `useForm` return shape (React adapter)

`useForm` currently spreads the `FormInstance` methods onto its return value. `setErrors` will be included automatically since it's added to the instance. No explicit change needed in `packages/adapters/react/src/index.ts`.

## Testing

- `setErrors` merges correctly — existing client errors for unrelated fields survive
- `setErrors` marks affected paths as `touched`
- Subscribers are notified after `setErrors`
- Server error clears when `validate()` runs for that path and validator returns no error
- Server error survives a `set()` call without `validate: true`
- `reset()` clears server-injected errors
- TypeScript: `setErrors` accepts valid `Path<T>` strings and rejects unknown keys (with `string & {}` escape)

## Scope

This spec covers only `setErrors`. A companion `clearErrors(paths?: string[])` method is explicitly out of scope — developers can call `form.validate(paths)` to clear specific errors, or `form.reset()` to clear all. No new clearing mechanism is needed.
