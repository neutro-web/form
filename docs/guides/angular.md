# Angular Guide

Install the adapter alongside the core:

```sh
pnpm add @agnostic-web/form-core @agnostic-web/form-angular
```

Angular 16+ is required. The adapter uses Angular signals internally.

## Injection Context Requirement

Both `useAngularForm` and `useAngularFormPath` **must be called inside an injection context** — typically the component's `constructor` or a function called synchronously from the constructor. They call Angular's `inject()` internally (to access `DestroyRef` for cleanup) and will throw if called outside an injection context.

> Do **not** call them inside `ngOnInit`, `ngAfterViewInit`, event handlers, or `setTimeout`.

---

## `useAngularForm` — Global Signal

`useAngularForm` returns an Angular signal containing the full `FormState<T>`. Read it inside the template or in computed expressions with `state()`.

```ts
import { Component } from '@angular/core'
import { createForm } from '@agnostic-web/form-core'
import { useAngularForm } from '@agnostic-web/form-angular'

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
  readonly state = useAngularForm(this.form)

  async handleSubmit() {
    await this.form.validate()
  }
}
```

---

## `useAngularFormPath` — Field Signal

`useAngularFormPath` returns a signal for a single field path. It updates only when that path's value or state changes.

```ts
import { Component, input } from '@angular/core'
import { createForm } from '@agnostic-web/form-core'
import { useAngularFormPath } from '@agnostic-web/form-angular'

@Component({
  selector: 'app-field',
  standalone: true,
  template: `
    <label>
      {{ label() }}
      <input
        [value]="field().value"
        (input)="onInput($event)"
      />
      @if (field().touched && field().error) {
        <span class="error">{{ field().error }}</span>
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
import { createForm } from '@agnostic-web/form-core'
import { zodAdapter } from '@agnostic-web/form-core'
import { useAngularForm, useAngularFormPath } from '@agnostic-web/form-angular'
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
          [value]="username().value"
          (input)="form.set('username', $event.target.value, { touch: true, validate: true })"
        />
        @if (username().touched && username().error) {
          <span>{{ username().error }}</span>
        }
      </label>

      <label>
        Email
        <input
          type="email"
          [value]="email().value"
          (input)="form.set('email', $event.target.value, { touch: true, validate: true })"
        />
        @if (email().touched && email().error) {
          <span>{{ email().error }}</span>
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
  readonly state = useAngularForm(this.form)
  readonly username = useAngularFormPath(this.form, 'username')
  readonly email = useAngularFormPath(this.form, 'email')
}
```

---

## Cleanup

Both hooks inject `DestroyRef` and register an `onDestroy` callback to unsubscribe from the form. You do not need to manually unsubscribe or implement `OnDestroy` — Angular handles it automatically when the component is destroyed.

---

## Notes

- The adapter requires Angular 16 or later (signals API).
- If you need to create the form asynchronously (e.g. after an HTTP call), create the form instance eagerly with empty initial values and call `form.reset(newValues)` when the data arrives. Do not defer the `useAngularForm` / `useAngularFormPath` calls.
- Template expressions reading signal values (e.g. `state().errors['email']`) are automatically tracked by Angular's change detection when using `OnPush` — no `markForCheck()` needed.
