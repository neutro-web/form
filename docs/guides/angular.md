# Angular Guide

```sh
npm install @neutro/form
# pnpm add @neutro/form
# yarn add @neutro/form
```

Angular 16+ is required. The adapter uses Angular signals internally.

## Injection Context Requirement

Both `useAngularForm` and `useAngularFormPath` **must be called inside an injection context** — typically the component's `constructor` or a function called synchronously from the constructor. They call Angular's `inject()` internally (to access `DestroyRef` for cleanup) and will throw if called outside an injection context.

> Do **not** call them inside `ngOnInit`, `ngAfterViewInit`, event handlers, or `setTimeout`.

---

## `useAngularForm` — Global Signal

`useAngularForm` returns an `AngularFormReturn<T>` object — a `state` Signal containing the full `FormState<T>`, plus all form methods (`set`, `validate`, `resetField`, etc.) forwarded from the core instance. Expose `state` as a class property and read it in templates with `state()`.

```ts
import { Component } from '@angular/core'
import { createForm } from '@neutro/form/core'
import { useAngularForm } from '@neutro/form/adapters/angular'

type LoginValues = { email: string; password: string }

@Component({
  selector: 'app-login-form',
  standalone: true,
  template: `
    <form (ngSubmit)="handleSubmit()">
      <input
        [value]="state().values.email"
        (input)="form.set('email', $event.target.value, { touch: true })"
      />
      @if (state().errors['email']) {
        <span class="error">{{ state().errors['email'] }}</span>
      }

      <input
        type="password"
        [value]="state().values.password"
        (input)="form.set('password', $event.target.value, { touch: true })"
      />
      @if (state().errors['password']) {
        <span class="error">{{ state().errors['password'] }}</span>
      }

      <button type="submit" [disabled]="state().isSubmitting">
        {{ state().isSubmitting ? 'Signing in…' : 'Sign in' }}
      </button>
    </form>
  `,
})
export class LoginFormComponent {
  readonly form = createForm<LoginValues>({
    initialValues: { email: '', password: '' },
    validator: (values) => {
      const errors: Record<string, string> = {}
      if (!values.email.includes('@')) errors.email = 'Invalid email'
      if (values.password.length < 8) errors.password = 'Min 8 characters'
      return errors
    },
  })

  // Must be called in the constructor (injection context)
  private readonly _adapter = useAngularForm(this.form)
  readonly state = this._adapter.state

  async handleSubmit() {
    await this.form.validate()
  }
}
```

---

## `useAngularFormPath` — Field Signals

`useAngularFormPath` returns `{ value: Signal<unknown>, fieldState: Signal<{ error?, touched?, dirty? } | null> }` — two independent readonly signals. Call each to read its current value: `field.value()` for the field's value, `field.fieldState()?.error` for the error message.

```ts
import { Component, input } from '@angular/core'
import { createForm } from '@neutro/form/core'
import { useAngularFormPath } from '@neutro/form/adapters/angular'

@Component({
  selector: 'app-field',
  standalone: true,
  template: `
    <label>
      {{ label() }}
      <input
        [value]="field.value()"
        (input)="onInput($event)"
      />
      @if (field.fieldState()?.touched && field.fieldState()?.error) {
        <span class="error">{{ field.fieldState()?.error }}</span>
      }
    </label>
  `,
})
export class FieldComponent {
  readonly formInstance = input.required<ReturnType<typeof createForm>>()
  readonly path = input.required<string>()
  readonly label = input.required<string>()

  // Called in constructor — injection context is active
  readonly field = useAngularFormPath(this.formInstance(), this.path())

  onInput(event: Event) {
    this.formInstance().set(
      this.path(),
      (event.target as HTMLInputElement).value,
      { touch: true, validate: true }
    )
  }
}
```

---

## Full Example with Zod

```ts
import { Component } from '@angular/core'
import { createForm } from '@neutro/form/core'
import { zodAdapter } from '@neutro/form/core'
import { useAngularForm, useAngularFormPath } from '@neutro/form/adapters/angular'
import { z } from 'zod'

const schema = z.object({
  username: z.string().min(3, 'At least 3 characters'),
  email: z.string().email('Invalid email'),
})

type Values = z.infer<typeof schema>

@Component({
  selector: 'app-profile-form',
  standalone: true,
  template: `
    <form (ngSubmit)="form.validate()">
      <label>
        Username
        <input
          [value]="username.value()"
          (input)="form.set('username', $event.target.value, { touch: true, validate: true })"
        />
        @if (username.fieldState()?.touched && username.fieldState()?.error) {
          <span>{{ username.fieldState()?.error }}</span>
        }
      </label>

      <label>
        Email
        <input
          type="email"
          [value]="email.value()"
          (input)="form.set('email', $event.target.value, { touch: true, validate: true })"
        />
        @if (email.fieldState()?.touched && email.fieldState()?.error) {
          <span>{{ email.fieldState()?.error }}</span>
        }
      </label>

      <button type="submit" [disabled]="state().isSubmitting">Save</button>
    </form>
  `,
})
export class ProfileFormComponent {
  readonly form = createForm<Values>({
    initialValues: { username: '', email: '' },
    validator: zodAdapter(schema),
  })

  // All three called in constructor — injection context required
  private readonly _adapter = useAngularForm(this.form)
  readonly state = this._adapter.state
  readonly username = useAngularFormPath(this.form, 'username')
  readonly email = useAngularFormPath(this.form, 'email')
}
```

---

## Cleanup

Both hooks inject `DestroyRef` and register an `onDestroy` callback to unsubscribe from the form. You do not need to manually unsubscribe or implement `OnDestroy` — Angular handles it automatically when the component is destroyed.

---

## Resetting a Single Field

`resetField` is exposed on the Angular adapter's return object and can be called from a component method or template:

```ts
@Component({
  template: `
    <input [value]="state().values.email" (input)="onEmail($event)" />
    <button *ngIf="state().errors['email']" (click)="form.resetField('email')">
      Reset
    </button>
  `,
})
export class EmailFieldComponent {
  readonly form = createForm({
    initialValues: { email: '' },
    rules: { email: ['required', 'email'] },
  })

  private readonly _adapter = useAngularForm(this.form)
  readonly state = this._adapter.state

  onEmail(e: Event) {
    this.form.set('email', (e.target as HTMLInputElement).value, { touch: true })
  }
}
```

---

## Notes

- The adapter requires Angular 16 or later (signals API).
- If you need to create the form asynchronously (e.g. after an HTTP call), create the form instance eagerly with empty initial values and call `form.reset(newValues)` when the data arrives. Do not defer the `useAngularForm` / `useAngularFormPath` calls.
- Template expressions reading signal values (e.g. `state().errors['email']`) are automatically tracked by Angular's change detection when using `OnPush` — no `markForCheck()` needed.

---

## Handling Server Errors

Use `this.form.setErrors()` inside your submit handler to feed API validation errors back into form state. They surface in `state().errors` and clear on the next validation run — no extra wiring required.

```ts
import { Component } from '@angular/core'
import { createForm } from '@neutro/form/core'
import { useAngularForm } from '@neutro/form/adapters/angular'

@Component({
  selector: 'app-register-form',
  standalone: true,
  template: `
    <form (ngSubmit)="handleSubmit()">
      <input
        [value]="state().values.email"
        (input)="form.set('email', $event.target.value, { touch: true })"
      />
      @if (state().touched['email'] && state().errors['email']) {
        <span class="error">{{ state().errors['email'] }}</span>
      }

      <input
        [value]="state().values.username"
        (input)="form.set('username', $event.target.value, { touch: true })"
      />
      @if (state().touched['username'] && state().errors['username']) {
        <span class="error">{{ state().errors['username'] }}</span>
      }

      <button type="submit" [disabled]="state().isSubmitting">Register</button>
    </form>
  `,
})
export class RegisterFormComponent {
  readonly form = createForm({
    initialValues: { email: '', username: '' },
    rules: { email: ['required', 'email'], username: 'required' },
  })

  private readonly _adapter = useAngularForm(this.form)
  readonly state = this._adapter.state

  async handleSubmit() {
    const valid = await this.form.validate()
    if (!valid) return

    const res = await fetch('/api/register', {
      method: 'POST',
      body: JSON.stringify(this.form.getPayload()),
    })
    if (!res.ok) {
      const { errors } = await res.json()
      this.form.setErrors(errors)
    }
  }
}
```

## Validation Modes

Configure when validation triggers globally and per field via `validationMode` in `createForm`:

```ts
const form = createForm({
  initialValues: { email: '', password: '' },
  validationMode: {
    default: 'onTouched',
    fields: { password: 'onChange' },
  },
})
```

For Angular template-driven inputs, use `this.form.getFieldMode(path)` in your component:

```ts
@Component({
  template: `
    <input
      [value]="form.get('email')"
      (input)="handleInput('email', $event.target.value)"
      (blur)="handleBlur('email')"
    />
  `
})
export class FormComponent {
  handleInput(path: string, value: string) {
    this.form.set(path, value)
    if (this.form.getFieldMode(path) === 'onChange') {
      this.form.validate([path])
    }
  }

  handleBlur(path: string) {
    const mode = this.form.getFieldMode(path)
    if (mode === 'onBlur' || mode === 'onTouched') {
      this.form.validate([path])
    }
  }
}
```
