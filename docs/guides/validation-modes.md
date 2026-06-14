# Validation Modes

Validation modes control *when* the form engine checks a field for errors. Choosing the right mode determines how quickly users see feedback — and how intrusive that feedback feels.

## The Four Modes

### `onTouched` (default)

```ts
createForm({ validationMode: 'onTouched' })
```

The field is silent until the user leaves it for the first time (blur). After that first blur, the field switches to live feedback — every keystroke re-runs validation so the user can see errors clear in real time as they correct them.

This is the recommended default because it balances two goals: don't show errors before the user has had a chance to type, but once they've visited the field, keep feedback instant.

**Timeline:**
1. User types — no errors shown
2. User tabs away (first blur) — validation runs, errors appear if invalid
3. User returns and types — validation runs on every keystroke
4. User clears the error — error disappears immediately, not on next blur

---

### `onBlur`

```ts
createForm({ validationMode: 'onBlur' })
```

Validation runs only on blur — every time the user leaves the field. Between blurs, the form is quiet. Unlike `onTouched`, there is no upgrade to live keystroke feedback after the first blur.

Use this when validation is expensive or when live feedback would be distracting (for example, a field whose valid state changes mid-word, like a URL being typed).

**Timeline:**
1. User types — no errors shown
2. User tabs away — validation runs, errors appear if invalid
3. User returns and types — still no errors shown while typing
4. User tabs away again — validation runs again

::: tip `onTouched` vs `onBlur`
Both modes show the first error on blur. The difference is what happens *after*:
- **`onTouched`** upgrades to live keystroke feedback — errors clear the moment the input becomes valid.
- **`onBlur`** stays blur-only forever — the user must leave the field again to see the error clear.

If you're unsure, prefer `onTouched`. The only reason to choose `onBlur` is when you want to deliberately suppress keystroke-level feedback even after the user has already visited the field.
:::

---

### `onChange`

```ts
createForm({ validationMode: 'onChange' })
```

Validation runs on every keystroke from the very first character. Errors can appear while the user is still typing.

This is the most aggressive mode. Use it sparingly — it's appropriate for fields where the format is obvious and instant feedback is genuinely helpful, like a password strength meter or a character counter.

**Timeline:**
1. User types first character — validation runs, errors may appear immediately
2. Every subsequent keystroke — validation runs

---

### `onSubmitOnly`

```ts
createForm({ validationMode: 'onSubmitOnly' })
```

No inline validation at all. The form stays silent until `form.submit()` is called, at which point every field is validated simultaneously. After a failed submit, the errors remain visible but do not update reactively while the user edits.

The word "only" means *submit is the only trigger* — there is no blur-based or keystroke-based feedback. Crucially, this does not mean submit is optional: `form.submit()` **always** force-validates all fields regardless of which mode is active. The difference with `onSubmitOnly` is simply that nothing validates *before* the user hits submit.

Use this for short, simple forms where you prefer a clean, error-free experience while filling out, and a single validation pass at the end.

---

## Submit Always Validates Everything

Regardless of the active validation mode, calling `form.submit()` runs validation on every field before the submit handler is invoked. You cannot opt out of this.

```ts
const form = createForm({
  validationMode: 'onSubmitOnly',
  // ...
})

// Even in onSubmitOnly mode, submit() validates all fields
form.submit(async (values) => {
  await saveToServer(values)
})
```

This means "Validate All" / Submit buttons always give the user a complete error picture, even in `onSubmitOnly` mode.

---

## Per-Field Overrides

You can mix modes: set a global default and override specific fields individually.

```ts
createForm({
  validationMode: {
    default: 'onTouched',   // most fields
    fields: {
      password: 'onChange',    // instant feedback on password strength
      terms:    'onSubmitOnly' // don't nag about a checkbox
    }
  }
})
```

When using the DOM bridge (`form.connect()`), you can also override the mode at the element level:

```ts
form.connect(input, { path: 'email', validateOn: 'onBlur' })
```

Element-level `validateOn` takes precedence over both the field-level and global settings.

---

## Choosing a Mode

| Scenario | Recommended mode |
|---|---|
| General-purpose forms | `onTouched` |
| Expensive or slow validators | `onBlur` |
| Password strength / character limit | `onChange` |
| Short, low-stakes forms | `onSubmitOnly` |
| Terms checkbox, read-only fields | `onSubmitOnly` (per-field) |

## API Reference

See [`validationMode`](/api/core#validationmode) in the Core API reference for the full type signature and configuration options.
