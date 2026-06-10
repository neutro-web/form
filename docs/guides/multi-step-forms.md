# Multi-Step Forms

`@neutro/form` is well-suited to multi-step wizards. The recommended pattern is a **single `createForm` instance** shared across all steps, with `validate(paths)` to scope validation per step and `connect(..., { persist: true })` to retain values from fields that unmount between steps.

---

## Single Form Instance Across Steps

Rather than creating one form per step and merging state at the end, create a single form at the top level with all fields. This avoids the complexity of synchronising multiple forms and gives you one `getPayload()` call at submission time.

```ts
import { createForm } from '@neutro/form/core'

type WizardValues = {
  // Step 1 — personal info
  firstName: string
  lastName: string
  email: string
  // Step 2 — address
  street: string
  city: string
  country: string
  // Step 3 — payment
  cardNumber: string
  expiry: string
}

const form = createForm<WizardValues>({
  initialValues: {
    firstName: '', lastName: '', email: '',
    street: '', city: '', country: '',
    cardNumber: '', expiry: '',
  },
  validator: (values) => {
    const errors: Record<string, string> = {}
    if (!values.firstName) errors.firstName = 'Required'
    if (!values.lastName) errors.lastName = 'Required'
    if (!values.email.includes('@')) errors.email = 'Invalid email'
    if (!values.street) errors.street = 'Required'
    if (!values.city) errors.city = 'Required'
    if (!values.country) errors.country = 'Required'
    if (values.cardNumber.replace(/\s/g, '').length !== 16)
      errors.cardNumber = 'Must be 16 digits'
    if (!/^\d{2}\/\d{2}$/.test(values.expiry))
      errors.expiry = 'Format: MM/YY'
    return errors
  },
})
```

---

## Scoped Validation Per Step

Use `form.validate(paths)` to validate only the fields belonging to the current step. This lets users move between steps without seeing errors for fields they haven't reached yet.

```ts
const STEP_FIELDS: Record<number, string[]> = {
  1: ['firstName', 'lastName', 'email'],
  2: ['street', 'city', 'country'],
  3: ['cardNumber', 'expiry'],
}

async function goToNextStep(currentStep: number): Promise<boolean> {
  const paths = STEP_FIELDS[currentStep]

  // Validate only this step's fields
  await form.validate(paths)

  const state = form.getState()
  const hasStepErrors = paths.some((p) => p in state.errors)

  if (hasStepErrors) return false // stay on current step

  currentStep++
  return true
}
```

---

## Persisting Fields That Unmount

When a step's DOM elements are removed (e.g. the component is unmounted), the MutationObserver clears their field state by default. Use `persist: true` so the values survive across step transitions:

```tsx
// React example — Step 1 component
import { useEffect, useRef } from 'react'

function Step1({ form }) {
  const firstNameRef = useRef(null)
  const lastNameRef = useRef(null)
  const emailRef = useRef(null)

  useEffect(() => {
    const d1 = form.connect('firstName', firstNameRef.current, { persist: true })
    const d2 = form.connect('lastName', lastNameRef.current, { persist: true })
    const d3 = form.connect('email', emailRef.current, { persist: true })

    // Disconnect functions are called on unmount, but because persist: true,
    // the values remain available in getPayload()
    return () => { d1(); d2(); d3() }
  }, [form])

  return (
    <>
      <input ref={firstNameRef} onInput={(e) =>
        form.set('firstName', e.target.value, { touch: true })
      } />
      <input ref={lastNameRef} onInput={(e) =>
        form.set('lastName', e.target.value, { touch: true })
      } />
      <input ref={emailRef} type="email" onInput={(e) =>
        form.set('email', e.target.value, { touch: true })
      } />
    </>
  )
}
```

Alternatively, use the `useFormConnect` hook from the React adapter, which handles the `useEffect` setup for you.

---

## Collecting the Final Payload

At the end of the wizard, validate all fields and call `getPayload()` to get the submission object:

```ts
async function submitWizard() {
  // Validate everything
  await form.validate()

  const state = form.getState()
  if (Object.keys(state.errors).length > 0) {
    // Navigate back to the first step with errors
    return
  }

  // getPayload() returns only connected + persisted paths —
  // all persisted step fields are included even though they're now unmounted
  const payload = form.getPayload()

  await fetch('/api/submit', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
```

---

## Resetting Between Sessions

`form.reset()` restores all values to `initialValues` and clears errors, touched, and dirty maps. Call it when the user abandons the wizard and restarts:

```ts
function handleStartOver() {
  form.reset()
  setCurrentStep(1)
}
```

You can also re-seed the form with data loaded from a draft save:

```ts
async function loadDraft(draftId: string) {
  const draft = await fetch(`/api/drafts/${draftId}`).then((r) => r.json())
  form.reset(draft) // draft values become the new baseline
  setCurrentStep(1)
}
```

---

## Full Pattern Summary

1. Create one `createForm` instance with all fields across all steps.
2. Use `form.validate(stepPaths)` to validate each step before advancing.
3. Connect DOM elements with `persist: true` so values survive step transitions.
4. Use `form.getPayload()` at submission to collect only the relevant field data.
5. Use `form.reset(newValues?)` to support drafts or start-over flows.
