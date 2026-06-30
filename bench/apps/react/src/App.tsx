import React from 'react'
import { createForm } from '@neutro/form-core'
import { useForm, useFormPath } from '@neutro/form-react'
import { useForm as useRhfForm, Controller } from 'react-hook-form'

// Module-level render counters — not refs, to avoid closure staleness.
// Exposed on window for Playwright to read without React overhead.
const neutroRenders: Record<string, number> = {}
const rhfRenders: Record<string, number> = {}

declare global {
  interface Window {
    __neutroRenders: Record<string, number>
    __rhfRenders: Record<string, number>
    __resetRenders: () => void
    __asyncValidationStart: number
    __asyncValidationEnd: number
  }
}
window.__neutroRenders = neutroRenders
window.__rhfRenders = rhfRenders
window.__resetRenders = () => {
  for (const k in neutroRenders) neutroRenders[k] = 0
  for (const k in rhfRenders) rhfRenders[k] = 0
}

// --- Neutro section ---

const FIELD_NAMES = Array.from({ length: 10 }, (_, i) => `field${i}`)
const neutroForm = createForm({
  initialValues: Object.fromEntries(FIELD_NAMES.map(n => [n, ''])),
})

function NeutroField({ name }: { name: string }) {
  const value = useFormPath(neutroForm, name as any)
  neutroRenders[name] = (neutroRenders[name] ?? 0) + 1
  return (
    <input
      data-testid={`neutro-${name}`}
      value={value as string}
      onChange={e => neutroForm.set(name as any, e.target.value)}
    />
  )
}

function NeutroForm() {
  return (
    <section data-testid="neutro-form">
      {FIELD_NAMES.map(n => <NeutroField key={n} name={n} />)}
    </section>
  )
}

// --- RHF section ---

function RhfForm() {
  const { control } = useRhfForm({
    defaultValues: Object.fromEntries(FIELD_NAMES.map(n => [n, ''])),
  })
  return (
    <section data-testid="rhf-form">
      {FIELD_NAMES.map(n => (
        <Controller
          key={n}
          control={control}
          name={n}
          render={({ field }) => {
            rhfRenders[n] = (rhfRenders[n] ?? 0) + 1
            return (
              <input
                data-testid={`rhf-${n}`}
                value={field.value}
                onChange={field.onChange}
              />
            )
          }}
        />
      ))}
    </section>
  )
}

// --- Async validation latency section ---
// A 200ms async validator; Playwright measures time from input change to error appearing in DOM.

const asyncForm = createForm({
  initialValues: { email: '' },
  validators: {
    onChange: async ({ value }) => {
      window.__asyncValidationStart = performance.now()
      await new Promise(r => setTimeout(r, 200))
      if (!String(value.email).includes('@')) return { email: 'Invalid email' }
      return {}
    },
  },
})

function AsyncField() {
  const { errors } = useForm(asyncForm)
  const email = useFormPath(asyncForm, 'email')
  const error = errors['email']
  if (error) window.__asyncValidationEnd = performance.now()
  return (
    <section data-testid="async-section">
      <input
        data-testid="async-email"
        value={email as string}
        onChange={e => asyncForm.set('email', e.target.value)}
      />
      {error && <span data-testid="async-error">{error}</span>}
    </section>
  )
}

export default function App() {
  return (
    <div>
      <NeutroForm />
      <RhfForm />
      <AsyncField />
    </div>
  )
}
