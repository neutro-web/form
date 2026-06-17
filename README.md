# @neutro/form

High-performance, zero-dependency, framework-agnostic reactive form engine.

**[Documentation](https://neutro-web.github.io/form/)** · [Getting Started](https://neutro-web.github.io/form/getting-started) · [API Reference](https://neutro-web.github.io/form/api/)

## Install

```bash
npm install @neutro/form
```

## Quick start

```ts
import { createForm } from '@neutro/form/core';

const form = createForm({
  initialValues: { email: '', password: '' },
  rules: {
    email: ['required', 'email'],
    password: ['required', { minLength: 8 }],
  },
});

form.set('email', 'user@example.com');
await form.submit(async (payload) => {
  await fetch('/api/login', { method: 'POST', body: JSON.stringify(payload) });
});

// Reset a single field without affecting others
form.resetField('email');
form.resetField('email', { keepError: true }); // restore value, keep error
```

### React

```tsx
import { useForm, useFormPath } from '@neutro/form/adapters/react';

function LoginForm() {
  const { handleSubmit } = useForm(form);
  const value = useFormPath(form, 'email');

  return (
    <form onSubmit={handleSubmit(async (payload) => console.log(payload))}>
      <input value={value as string} onChange={(e) => form.set('email', e.target.value)} />
    </form>
  );
}
```

## Features

- Zero dependencies — no external runtime
- Framework adapters for React, Svelte, Vue, SolidJS, and Angular
- 30+ built-in validation rules (presence, format, length, array, cross-field, file, conditional)
- Async validation with debounce and `AbortSignal` cancellation
- O(1) dependency graph for cross-field validation
- DOM bridge with `WeakRef`-based automatic field cleanup
- Dynamic arrays with index-safe `move`, `swap`, `insert`, `remove`
- Zod, Yup, and class-validator schema adapters built in
- Strongly typed field paths — `Path<T>`, `GetPathValue<T,P>`, and `ArrayItem<V>` give IDE autocomplete and value-type enforcement on every read and write
- `resetField(path, options?)` — restore a single field to its initial value without touching other fields
- `batch()` — defer all subscriber notifications until a set of mutations completes
- `clearErrors()` — programmatically clear all or specific field errors
- Configurable validation modes per field: `onTouched` (default), `onChange`, `onBlur`, `onSubmitOnly`
- `state.isValid` — three-value validity flag: `null` (not yet validated), `true`, `false`
- Persistence via `localStorageAdapter` / `sessionStorageAdapter` with optional debounce and field exclusion
- Devtools: console logger (`devtools()`) and floating overlay panel (`createNeutroFormDevtoolsPanel()`)

## License

MIT
