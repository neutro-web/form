# Testing Utilities

```ts
import { createFormFixture, fillForm, blurField, triggerValidation } from '@neutro/form/testing'
```

`@neutro/form/testing` is a small set of helpers for writing form tests without hand-rolling `form.batch()`/`form.set()` calls for every field, or juggling `asyncDebounceMs` timers to make async validators resolve synchronously.

## `createFormFixture(config)`

The main entry point. Wraps `createForm()`, defaulting `asyncDebounceMs` to `0` so async validators resolve without fake timers, and returns a small set of convenience methods alongside the underlying form instance.

```ts
function createFormFixture<T extends object>(config: FormConfig<T>): FormFixture<T>
```

```ts
import { createFormFixture } from '@neutro/form/testing'

const fixture = createFormFixture({
  initialValues: { email: '', password: '' },
  rules: { email: ['required', 'email'], password: ['required'] },
})

afterEach(() => fixture.cleanup())

it('flags an invalid email', async () => {
  fixture.fill({ email: 'not-an-email' })
  const isValid = await fixture.validate()
  expect(isValid).toBe(false)
  expect(fixture.form.getState().errors.email).toBeDefined()
})
```

### `FormFixture<T>`

| Member | Type | Description |
|---|---|---|
| `form` | `FormInstance<T>` | The underlying form instance — use it for anything not covered by the fixture's own methods |
| `fill(values)` | `(values: Partial<Record<string, unknown>>) => void` | Batch-sets multiple field values in one notification flush — see [`fillForm`](#fillform-form-values) |
| `blur(path)` | `(path: string) => void` | Marks a field touched without changing its value — see [`blurField`](#blurfield-form-path) |
| `validate(paths?)` | `(paths?: string[]) => Promise<boolean>` | Runs validation — see [`triggerValidation`](#triggervalidation-form-paths) |
| `resetField(path, options?)` | `(path: string, options?: ResetFieldOptions) => void` | Thin passthrough to `form.resetField()` |
| `cleanup()` | `() => void` | Calls `form.destroy()` — always call this in `afterEach` to tear down subscriptions and pending timers |

Pass `asyncDebounceMs` explicitly in the config to override the `0` default (e.g. to specifically test debounce behavior).

## Standalone functions

Each fixture method is also exported standalone, for use against a form instance you created yourself (e.g. one shared across several tests, or one not created via `createFormFixture`).

### `fillForm(form, values)`

```ts
function fillForm<T extends object>(
  form: FormInstance<T>,
  values: Partial<Record<string, unknown>>
): void
```

Batch-sets multiple field values in one notification flush, equivalent to wrapping several `form.set()` calls in `form.batch()`.

```ts
import { fillForm } from '@neutro/form/testing'

fillForm(form, { email: 'user@example.com', password: 'hunter2' })
```

### `blurField(form, path)`

```ts
function blurField<T extends object>(form: FormInstance<T>, path: string): void
```

Marks a field as touched without changing its value — simulates a user visiting and leaving a field. This does **not** trigger validation automatically; call `triggerValidation()` (or `fixture.validate()`) afterward to assert the resulting errors.

```ts
import { blurField, triggerValidation } from '@neutro/form/testing'

blurField(form, 'email')
await triggerValidation(form, ['email'])
expect(form.getState().touched.email).toBe(true)
```

### `triggerValidation(form, paths?)`

```ts
function triggerValidation<T extends object>(
  form: FormInstance<T>,
  paths?: string[]
): Promise<boolean>
```

Thin wrapper around `form.validate()` for discoverability. When using this standalone (not via `createFormFixture`, which already sets `asyncDebounceMs: 0`), set `asyncDebounceMs: 0` on the form yourself to prevent tests from timing out on async validators.

## `FormFixture<T>` type

Exported for annotating helper functions that accept or return a fixture.

```ts
import type { FormFixture } from '@neutro/form/testing'

function fillAndSubmit<T extends object>(fixture: FormFixture<T>, values: Partial<Record<string, unknown>>) {
  fixture.fill(values)
  return fixture.form.submit(async () => {})
}
```
