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
  validator: (values) => {
    const errors: Record<string, string> = {};
    if (!values.email.includes('@')) errors.email = 'Invalid email';
    if (values.password.length < 8) errors.password = 'Min 8 characters';
    return errors;
  },
});

form.set('email', 'user@example.com');
form.handleSubmit(async (payload) => {
  await fetch('/api/login', { method: 'POST', body: JSON.stringify(payload) });
});
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
- Async validation with debounce and `AbortSignal` cancellation
- O(1) dependency graph for cross-field validation
- DOM bridge with `WeakRef`-based automatic field cleanup
- Dynamic arrays with index-safe `move`, `swap`, `insert`, `remove`
- Zod, Yup, and class-validator schema adapters built in

## License

MIT
