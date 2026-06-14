# Per-Field Validation Modes — Design Spec

**Date:** 2026-06-14
**Status:** Approved

## Problem

Validation triggers are currently hardcoded in `connect()`: every connected field validates on `blur`, and every input event marks the field as `touched`. Developers who want different trigger behavior per field have no option — email must validate on blur, password strength has no inline feedback, and submit-only fields can't suppress inline validation. The only escape hatch is bypassing `connect()` entirely and wiring events manually.

## Solution

Add a `validationMode` config to `createForm` that sets a global default and optional per-field overrides. `ConnectOptions` gains a `validateOn` property for element-level overrides. `FormInstance` gains `getFieldMode(path)` so framework adapter users can query the resolved mode and implement the right event wiring in their templates.

The new default mode is `'onTouched'` — validate on input only after the field has been blurred at least once, giving immediate feedback on correction without interrupting first entry.

## API

### `ValidationMode` type

```ts
export type ValidationMode = 'onChange' | 'onBlur' | 'onTouched' | 'onSubmitOnly';
```

### `ValidationModeConfig<T>` interface

```ts
export interface ValidationModeConfig<T> {
  default?: ValidationMode;   // falls back to 'onTouched' if omitted
  fields?: Partial<Record<Path<T> | (string & {}), ValidationMode>>;
}
```

### `FormConfig<T>` — new key

```ts
validationMode?: ValidationMode | ValidationModeConfig<T>;
```

Accepts a bare string (global mode) or an object with `default` and per-field `fields` overrides.

```ts
// All fields validate on blur
createForm({ initialValues, validationMode: 'onBlur' })

// Mixed: default onTouched, password immediate, terms submit-only
createForm({
  initialValues,
  validationMode: {
    default: 'onTouched',
    fields: {
      password: 'onChange',
      terms: 'onSubmitOnly',
    },
  },
})
```

### `ConnectOptions` — new key

```ts
validateOn?: ValidationMode
```

Overrides the resolved config mode for one specific DOM connection.

```ts
form.connect('email', emailEl, { validateOn: 'onBlur' })
```

### `FormInstance<T>` — new method

```ts
getFieldMode(path: string): ValidationMode
```

Returns the effective validation mode for `path`. Resolution order (highest to lowest):

1. `ConnectOptions.validateOn` passed at `connect()` call time (element-level)
2. `validationMode.fields[path]` (per-field config)
3. `validationMode.default` (global config default)
4. `'onTouched'` (library default)

Framework adapter users call this to decide when to call `form.validate([path])` in their event handlers.

## Mode Behavior in `connect()`

`connect()` is the only place modes auto-apply. Framework adapter event handlers are not intercepted.

| Mode | `input`/`change` event | `blur` event |
|---|---|---|
| `onTouched` *(default)* | update value; validate if `touched[path]` is already `true` | set `touched` + validate |
| `onChange` | update value + set `touched` + validate | set `touched` |
| `onBlur` | update value | set `touched` + validate |
| `onSubmitOnly` | update value | set `touched` (no validation) |

### `touched` semantics

`touched[path]` is only set by `handleBlur` for `onBlur`, `onTouched`, and `onSubmitOnly` modes. Only `onChange` mode sets `touched` on the input event. This preserves the invariant that `touched` means "the user has left this field" — the meaning framework components rely on for display gating (`touched && error`).

Previously `syncValueFromDOM` always passed `{ touch: true }` — this changes.

### `submit()` and `form.validate()`

Unaffected by mode. `submit()` always runs full validation. `form.validate(paths?)` always runs regardless of mode. `onSubmitOnly` suppresses inline validation; it does not disable submit-triggered validation.

## Implementation

### `packages/core/src/index.ts`

1. Export `ValidationMode` type and `ValidationModeConfig<T>` interface.
2. Add `validationMode?` to `FormConfig<T>`.
3. Add `validateOn?: ValidationMode` to `ConnectOptions`.
4. Add `getFieldMode: (path: string) => ValidationMode` to `FormInstance<T>`.
5. Inside `createForm` closure: implement `resolveFieldMode(path: string, connectOverride?: ValidationMode): ValidationMode` — parses the config once and does O(1) path lookup.
6. Modify `connect()`:
   - Resolve mode via `resolveFieldMode(stringPath, options.validateOn)` at connection time.
   - `syncValueFromDOM`: branch on mode for whether to touch and/or validate on input.
   - `handleBlur`: branch on mode for whether to validate on blur.

### No adapter changes

All adapters (`react`, `vue`, `svelte`, `solid`, `angular`) already expose the full `FormInstance`. `getFieldMode` is available automatically. No adapter code changes required.

## Testing

### `packages/core/test/form.test.ts`

**`resolveFieldMode` unit tests:**
- String shorthand (`validationMode: 'onBlur'`) resolves to `'onBlur'` for any path
- Object with `default` and `fields` — field-specific override wins
- `ConnectOptions.validateOn` beats both config levels
- Missing config falls back to `'onTouched'`
- Unspecified field falls back to `default`, then `'onTouched'`

**Behavior tests per mode (jsdom elements):**
- `onChange`: input event triggers validation; blur does not add a second validation pass
- `onBlur`: input event does not trigger validation; blur does
- `onTouched`: input before first blur does not validate; blur validates and sets touched; subsequent input validates
- `onSubmitOnly`: neither input nor blur triggers validation; `submit()` does

## Documentation

### `docs/api/core.md`
- Add `validationMode` to the `FormConfig` section with the type, shorthand/object forms, and a mixed-mode example
- Add `validateOn` to the `ConnectOptions` section
- Add `getFieldMode(path)` as a new method entry with the resolution-order table

### `docs/getting-started.md`
- Add a "Validation Modes" section before "Next Steps" — the four-mode table, the default explanation, and a short example showing the `fields` override map

### Framework guides (`docs/guides/react.md`, `vue.md`, `svelte.md`, `solid.md`, `angular.md`)
- Add a "Validation Modes" section to each showing how to call `getFieldMode(path)` and implement the right event wiring in templates/JSX

### Playground (`docs/public/playground.html`)
- New step with four fields, one per mode, all visible simultaneously so the different trigger behaviors are directly observable

## Scope

This spec covers `validationMode` in `FormConfig`, `validateOn` in `ConnectOptions`, `getFieldMode` on `FormInstance`, and the four modes. Out of scope: reactive mode changes after form creation (mode is read once at `connect()` call time), conditional mode logic (e.g., "validate onChange only if the value matches a pattern"), and mode-aware adapter hooks that auto-wire events.
