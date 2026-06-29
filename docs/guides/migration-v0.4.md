# Migration Guide — v0.3 → v0.4

v0.4 contains one breaking change: all path-accepting methods on `FormInstance<T>` now require `Path<T>` instead of accepting plain `string`.

## Breaking change: strict path types

Every method that previously accepted `string` now requires a valid `Path<T>`. TypeScript will catch invalid paths at compile time.

**Before:**

```ts
form.set('pricing.vat', 0.2)   // accepted as string
form.get('total')               // accepted as string
form.connect('email', el)       // accepted as string
```

**After:**

```ts
form.set('pricing.vat', 0.2)   // ✅ inferred as Path<T>
form.get('total')               // ✅ inferred as Path<T>
form.connect('email', el)       // ✅ inferred as Path<T>

form.set('typo', 0.2)           // ❌ TS error at compile time
```

**If you see a TypeScript error** it means the path you are passing is not present in your `initialValues` type — this is the feature working correctly.

## Runtime-constructed paths: use `setDynamic` / `getDynamic`

If your path is built at runtime (e.g. from a variable, loop, or user input), use the new escape hatches:

```ts
// Before:
form.set(runtimePath as any, value)
form.get(runtimePath as any)

// After:
form.setDynamic(runtimePath, value) // accepts string, returns void
form.getDynamic(runtimePath)        // accepts string, returns unknown
```

## Dynamic paths for other methods: cast as `Path<T>`

Only `set` and `get` have dynamic variants. For other methods with runtime paths, cast explicitly:

```ts
import type { Path } from '@neutro/form/core'

form.arrayAppend(runtimePath as Path<typeof initialValues>, item)
form.resetField(runtimePath as Path<typeof initialValues>)
```

## Compile-time depth limit

`Path<T>` generates paths up to **5 levels deep**. Paths beyond 5 levels exist at runtime but are not in the `Path<T>` union — use `setDynamic`/`getDynamic` for those.

## Removed overloads

The following overloads have been removed. If you relied on them, migrate to `setDynamic`/`getDynamic` or use a `Path<T>` cast:

| Removed | Replacement |
|---------|------------|
| `get(path: string \| string[])` | `getDynamic(path: string)` |
| `set(path: string[], val, opts)` | Convert to dot-notation: `set('items.0.name', val)` |
| `set<P extends Path<T> \| (string & {})>(...)` | `set<P extends Path<T>>(...)` — strict only |
| `subscribeToPath(path: string, fn)` | `subscribeToPath` now requires `Path<T>` |
| `connect(path: Path<T> \| string, ...)` | `connect(path: Path<T>, ...)` — use cast for runtime paths |
| `isFieldDirty(path: Path<T> \| (string & {}))` | `isFieldDirty(path: Path<T>)` |
| `isFieldValid(path: Path<T> \| (string & {}))` | `isFieldValid(path: Path<T>)` |
| `focus(path: Path<T> \| (string & {}))` | `focus(path: Path<T>)` |
| `resetField(path: Path<T> \| (string & {}) \| string[])` | `resetField(path: Path<T>)` |
| `setErrors(errors: Record<Path<T> \| (string & {}), string>)` | `setErrors(errors: Record<Path<T>, string>)` |
| `watch(paths: Path<T> \| (string & {}) \| Array<...>, ...)` | `watch(paths: Path<T> \| Array<Path<T>>, ...)` |
| `getAriaProps(path: Path<T> \| string, ...)` | `getAriaProps(path: Path<T>, ...)` |
| `arrayAppend(path: string, ...)` loose overload | `arrayAppend<P extends Path<T>>(path: P, ...)` |
| `arrayRemove/Move/Swap` loose string overloads | strict `Path<T>` only |

## Adapter hooks (unchanged in v0.4)

The `paths` parameter in adapter hooks (`useFormPaths`, `useFormField`, etc.) still accepts `Path<T> | string` in v0.4. Strict typing for adapters arrives in v0.5.

## New features in v0.4

- **Computed fields** (`computed`, `computedPassLimit` config) — see [Computed Fields guide](./computed-fields.md)
- **`pathValidation` config** — control when unknown-path warnings fire (`'dev'` / `'always'` / `'off'`)
- **`setDynamic` / `getDynamic`** — explicit runtime-path escape hatches
- **`subscribeToPathDynamic`** — runtime-path variant of `subscribeToPath`; accepts `string` and returns an unsubscribe function
- **`setErrors` now accepts `Partial<Record<Path<T>, string>>`** — only the keys present in the argument are merged; other field errors are untouched
