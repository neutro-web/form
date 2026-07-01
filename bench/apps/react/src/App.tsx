import React, { useCallback } from 'react'
import { useSyncExternalStore } from 'react'
import { createForm } from '@neutro/form-core'
import { useFormPath } from '@neutro/form-react'
import { useForm as useRhfForm, Controller } from 'react-hook-form'
import { Formik, useFormikContext } from 'formik'
// NOTE: Do NOT import Field from formik — it is not used in this file.
import { useForm as useTsForm } from '@tanstack/react-form'

// --- Module-level render counters (survive re-renders; exposed on window) ---
const neutroRenders: Record<string, number> = {}
const rhfRenders: Record<string, number> = {}
const formikRenders: Record<string, number> = {}
const tanstackRenders: Record<string, number> = {}

declare global {
  interface Window {
    __neutroRenders: typeof neutroRenders
    __rhfRenders: typeof rhfRenders
    __formikRenders: typeof formikRenders
    __tanstackRenders: typeof tanstackRenders
    __resetRenders: () => void
    __asyncValidationStart: number
    __asyncValidationEnd: number
  }
}
window.__neutroRenders = neutroRenders
window.__rhfRenders = rhfRenders
window.__formikRenders = formikRenders
window.__tanstackRenders = tanstackRenders
window.__resetRenders = () => {
  for (const k in neutroRenders) neutroRenders[k] = 0
  for (const k in rhfRenders) rhfRenders[k] = 0
  for (const k in formikRenders) formikRenders[k] = 0
  for (const k in tanstackRenders) tanstackRenders[k] = 0
}

const FIELD_COUNT = Number(new URLSearchParams(window.location.search).get('fields')) || 10
const FIELDS = Array.from({ length: FIELD_COUNT }, (_, i) => `field${i}`)

// ==================== NEUTRO ====================
const neutroForm = createForm({ initialValues: Object.fromEntries(FIELDS.map(n => [n, ''])) })

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
function NeutroSection() {
  return <section data-testid="neutro-form">{FIELDS.map(n => <NeutroField key={n} name={n} />)}</section>
}

// ==================== RHF ====================
function RhfSection() {
  const { control } = useRhfForm({ defaultValues: Object.fromEntries(FIELDS.map(n => [n, ''])) })
  return (
    <section data-testid="rhf-form">
      {FIELDS.map(n => (
        <Controller
          key={n} control={control} name={n}
          render={({ field }) => {
            rhfRenders[n] = (rhfRenders[n] ?? 0) + 1
            return <input data-testid={`rhf-${n}`} value={field.value} onChange={field.onChange} />
          }}
        />
      ))}
    </section>
  )
}

// ==================== FORMIK ====================
function FormikField({ name }: { name: string }) {
  const { values, handleChange } = useFormikContext<Record<string, string>>()
  formikRenders[name] = (formikRenders[name] ?? 0) + 1
  return (
    <input
      data-testid={`formik-${name}`}
      name={name}
      value={values[name]}
      onChange={handleChange}
    />
  )
}
function FormikSection() {
  return (
    <Formik initialValues={Object.fromEntries(FIELDS.map(n => [n, '']))} onSubmit={() => {}}>
      <section data-testid="formik-form">{FIELDS.map(n => <FormikField key={n} name={n} />)}</section>
    </Formik>
  )
}

// ==================== TANSTACK ====================
function TanStackField({ field, name }: { field: any; name: string }) {
  tanstackRenders[name] = (tanstackRenders[name] ?? 0) + 1
  return (
    <input
      data-testid={`tanstack-${name}`}
      value={field.state.value}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => field.handleChange(e.target.value)}
    />
  )
}
function TanStackSection() {
  const form = useTsForm({ defaultValues: Object.fromEntries(FIELDS.map(n => [n, ''])) })
  return (
    <section data-testid="tanstack-form">
      {FIELDS.map(n => (
        <form.Field key={n} name={n}>
          {(field: any) => <TanStackField field={field} name={n} />}
        </form.Field>
      ))}
    </section>
  )
}

// ==================== ASYNC PAGES ====================
function makeNeutroAsyncForm(debounceMs: number) {
  return createForm({
    initialValues: { email: '' },
    asyncDebounceMs: debounceMs,
    validator: async (values, _scope, signal) => {
      window.__asyncValidationStart = performance.now()
      await new Promise(r => setTimeout(r, 200))
      if (signal?.aborted) return {}
      if (!String(values.email).includes('@')) return { email: 'Invalid email' }
      return {}
    },
    validationMode: 'onChange',
  })
}
const neutroAsyncForm = makeNeutroAsyncForm(300)
const neutroAsyncFormNoDebounce = makeNeutroAsyncForm(0)

function NeutroAsyncPage({ form }: { form: ReturnType<typeof makeNeutroAsyncForm> }) {
  const email = useFormPath(form, 'email')
  const sub = useCallback((cb: () => void) => form.subscribeToPath('email', cb), [form])
  const getErr = useCallback(() => form.getState().errors['email'] ?? '', [form])
  const error = useSyncExternalStore(sub, getErr, getErr)
  if (error) window.__asyncValidationEnd = performance.now()
  return (
    <div>
      <input
        data-testid="async-email"
        value={email as string}
        onChange={e => form.set('email', e.target.value, { validate: true })}
      />
      {error && <span data-testid="async-error">{error}</span>}
    </div>
  )
}

function RhfAsyncPage() {
  const { register, formState: { errors } } = useRhfForm({ mode: 'onChange' })
  const emailProps = register('email', {
    validate: async (value) => {
      window.__asyncValidationStart = performance.now()
      await new Promise(r => setTimeout(r, 200))
      if (!String(value).includes('@')) return 'Invalid email'
      return undefined
    },
  })
  if (errors.email?.message) window.__asyncValidationEnd = performance.now()
  return (
    <div>
      <input data-testid="async-email" {...emailProps} />
      {errors.email && <span data-testid="async-error">{errors.email.message}</span>}
    </div>
  )
}

function FormikAsyncPage() {
  return (
    <Formik
      initialValues={{ email: '' }}
      validateOnChange
      validate={async (values) => {
        window.__asyncValidationStart = performance.now()
        await new Promise(r => setTimeout(r, 200))
        if (!String(values.email).includes('@')) return { email: 'Invalid email' }
        return {}
      }}
    >
      {({ handleChange, errors }) => (
        <div>
          <input
            data-testid="async-email"
            name="email"
            onChange={handleChange}
          />
          {errors.email && (
            <span data-testid="async-error">
              {(() => { window.__asyncValidationEnd = performance.now(); return errors.email })()}
            </span>
          )}
        </div>
      )}
    </Formik>
  )
}

function TanStackAsyncPage() {
  const form = useTsForm({ defaultValues: { email: '' } })
  return (
    <div>
      <form.Field
        name="email"
        validators={{
          onChangeAsync: async ({ value }: { value: string }) => {
            window.__asyncValidationStart = performance.now()
            await new Promise(r => setTimeout(r, 200))
            if (!String(value).includes('@')) return 'Invalid email'
            return undefined
          },
        }}
      >
        {(field: any) => {
          const err = field.state.meta.errors[0]
          if (err) window.__asyncValidationEnd = performance.now()
          return (
            <>
              <input
                data-testid="async-email"
                value={field.state.value}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => field.handleChange(e.target.value)}
              />
              {err && <span data-testid="async-error">{err}</span>}
            </>
          )
        }}
      </form.Field>
    </div>
  )
}

// ==================== ASYNC-CANCELLATION PAGES ====================
// Validator delay depends on the value: anything containing "slow" takes 600ms,
// everything else takes 100ms. Typing "slow@x" then immediately overtyping with
// "fastbad" creates a real race — the slow validation (valid, no error) must not
// overwrite the fast validation's result (invalid, error shown) when it resolves later.
function cancellationDelay(value: string): number {
  return value.includes('slow') ? 600 : 100
}

const neutroCancelForm = createForm({
  initialValues: { email: '' },
  asyncDebounceMs: 0,
  validator: async (values, _scope, signal) => {
    await new Promise(r => setTimeout(r, cancellationDelay(values.email)))
    if (signal?.aborted) return {}
    if (!String(values.email).includes('@')) return { email: 'Invalid email' }
    return {}
  },
  validationMode: 'onChange',
})
function NeutroCancelPage() {
  const email = useFormPath(neutroCancelForm, 'email')
  const sub = useCallback((cb: () => void) => neutroCancelForm.subscribeToPath('email', cb), [])
  const getErr = useCallback(() => neutroCancelForm.getState().errors['email'] ?? '', [])
  const error = useSyncExternalStore(sub, getErr, getErr)
  return (
    <div>
      <input
        data-testid="async-email"
        value={email as string}
        onChange={e => neutroCancelForm.set('email', e.target.value, { validate: true })}
      />
      {error && <span data-testid="async-error">{error}</span>}
    </div>
  )
}

function RhfCancelPage() {
  const { register, formState: { errors } } = useRhfForm({ mode: 'onChange' })
  const emailProps = register('email', {
    validate: async (value) => {
      await new Promise(r => setTimeout(r, cancellationDelay(value)))
      if (!String(value).includes('@')) return 'Invalid email'
      return undefined
    },
  })
  return (
    <div>
      <input data-testid="async-email" {...emailProps} />
      {errors.email && <span data-testid="async-error">{errors.email.message}</span>}
    </div>
  )
}

function FormikCancelPage() {
  return (
    <Formik
      initialValues={{ email: '' }}
      validateOnChange
      validate={async (values) => {
        await new Promise(r => setTimeout(r, cancellationDelay(values.email)))
        if (!String(values.email).includes('@')) return { email: 'Invalid email' }
        return {}
      }}
    >
      {({ handleChange, errors }) => (
        <div>
          <input data-testid="async-email" name="email" onChange={handleChange} />
          {errors.email && <span data-testid="async-error">{errors.email}</span>}
        </div>
      )}
    </Formik>
  )
}

function TanStackCancelPage() {
  const form = useTsForm({ defaultValues: { email: '' } })
  return (
    <div>
      <form.Field
        name="email"
        validators={{
          onChangeAsync: async ({ value }: { value: string }) => {
            await new Promise(r => setTimeout(r, cancellationDelay(value)))
            if (!String(value).includes('@')) return 'Invalid email'
            return undefined
          },
        }}
      >
        {(field: any) => {
          const err = field.state.meta.errors[0]
          return (
            <>
              <input
                data-testid="async-email"
                value={field.state.value}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => field.handleChange(e.target.value)}
              />
              {err && <span data-testid="async-error">{err}</span>}
            </>
          )
        }}
      </form.Field>
    </div>
  )
}

// ==================== ROUTER ====================
const ASYNC_PAGES: Record<string, (debounce: boolean) => React.ReactElement> = {
  neutro: (debounce) => <NeutroAsyncPage form={debounce ? neutroAsyncFormNoDebounce : neutroAsyncForm} />,
  rhf: () => <RhfAsyncPage />,
  formik: () => <FormikAsyncPage />,
  tanstack: () => <TanStackAsyncPage />,
}

const CANCEL_PAGES: Record<string, React.ReactElement> = {
  neutro: <NeutroCancelPage />,
  rhf: <RhfCancelPage />,
  formik: <FormikCancelPage />,
  tanstack: <TanStackCancelPage />,
}

export default function App() {
  const path = window.location.pathname
  if (path.startsWith('/async/')) {
    const lib = path.slice('/async/'.length)
    const debounce = new URLSearchParams(window.location.search).get('debounce') === '0'
    return ASYNC_PAGES[lib]?.(debounce) ?? <div data-testid="not-found">Unknown: {lib}</div>
  }
  if (path.startsWith('/cancel/')) {
    const lib = path.slice('/cancel/'.length)
    return CANCEL_PAGES[lib] ?? <div data-testid="not-found">Unknown: {lib}</div>
  }
  return (
    <div>
      <NeutroSection />
      <RhfSection />
      <FormikSection />
      <TanStackSection />
    </div>
  )
}
