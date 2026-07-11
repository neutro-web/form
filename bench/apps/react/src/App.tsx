import React, { useCallback } from 'react'
import { useSyncExternalStore } from 'react'
import { createForm } from '@neutro/form-core'
import { useFormPath } from '@neutro/form-react'
import { useForm as useRhfForm, Controller, useFieldArray } from 'react-hook-form'
import { Formik, useFormikContext, FieldArray } from 'formik'
import { useForm as useTsForm } from '@tanstack/react-form'
import { SchemaValidateNeutroPage } from './SchemaValidateNeutro.js'
import { SchemaValidateRhfPage } from './SchemaValidateRhf.js'
import { SchemaValidateTanStackPage } from './SchemaValidateTanStack.js'

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
  const neutroSchemaRenders = (window as any).__neutroSchemaRenders as Record<string, number> | undefined
  const rhfSchemaRenders = (window as any).__rhfSchemaRenders as Record<string, number> | undefined
  const tanstackSchemaRenders = (window as any).__tanstackSchemaRenders as Record<string, number> | undefined
  if (neutroSchemaRenders) for (const k in neutroSchemaRenders) neutroSchemaRenders[k] = 0
  if (rhfSchemaRenders) for (const k in rhfSchemaRenders) rhfSchemaRenders[k] = 0
  if (tanstackSchemaRenders) for (const k in tanstackSchemaRenders) tanstackSchemaRenders[k] = 0
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

// ==================== ARRAY-OPS ====================
const ARRAY_ITEMS = Array.from({ length: 10 }, (_, i) => ({ v: `item${i}` }))

const neutroArrayRenders: Record<string, number> = {}
const rhfArrayRenders: Record<string, number> = {}
const formikArrayRenders: Record<string, number> = {}
const tanstackArrayRenders: Record<string, number> = {}
;(window as any).__neutroArrayRenders = neutroArrayRenders
;(window as any).__rhfArrayRenders = rhfArrayRenders
;(window as any).__formikArrayRenders = formikArrayRenders
;(window as any).__tanstackArrayRenders = tanstackArrayRenders
;(window as any).__resetArrayRenders = () => {
  for (const k in neutroArrayRenders) neutroArrayRenders[k] = 0
  for (const k in rhfArrayRenders) rhfArrayRenders[k] = 0
  for (const k in formikArrayRenders) formikArrayRenders[k] = 0
  for (const k in tanstackArrayRenders) tanstackArrayRenders[k] = 0
}

const neutroArrayForm = createForm({ initialValues: { items: ARRAY_ITEMS } })

function NeutroArrayItem({ index }: { index: number }) {
  const value = useFormPath(neutroArrayForm, `items.${index}.v` as any)
  neutroArrayRenders[`item${index}`] = (neutroArrayRenders[`item${index}`] ?? 0) + 1
  return (
    <input
      data-testid={`neutro-array-item-${index}`}
      value={value as string}
      onChange={e => neutroArrayForm.set(`items.${index}.v` as any, e.target.value)}
    />
  )
}
function NeutroArraySection() {
  const items = useFormPath(neutroArrayForm, 'items' as any) as Array<{ v: string }>
  return (
    <section data-testid="neutro-array">
      {items.map((_, i) => (
        <span key={i}>
          <NeutroArrayItem index={i} />
          <button data-testid={`neutro-array-remove-${i}`} onClick={() => neutroArrayForm.arrayRemove('items' as any, i)}>remove</button>
        </span>
      ))}
      <button data-testid="neutro-array-move-3-7" onClick={() => neutroArrayForm.arrayMove('items' as any, 3, 7)}>move</button>
    </section>
  )
}

function RhfArraySection() {
  const { control } = useRhfForm({ defaultValues: { items: ARRAY_ITEMS } })
  const { fields, remove, move } = useFieldArray({ control, name: 'items' })
  return (
    <section data-testid="rhf-array">
      {fields.map((field, i) => (
        <span key={field.id}>
          <Controller
            control={control} name={`items.${i}.v`}
            render={({ field: f }) => {
              rhfArrayRenders[`item${i}`] = (rhfArrayRenders[`item${i}`] ?? 0) + 1
              return <input data-testid={`rhf-array-item-${i}`} value={f.value} onChange={f.onChange} />
            }}
          />
          <button data-testid={`rhf-array-remove-${i}`} onClick={() => remove(i)}>remove</button>
        </span>
      ))}
      <button data-testid="rhf-array-move-3-7" onClick={() => move(3, 7)}>move</button>
    </section>
  )
}

function FormikArrayItem({ index }: { index: number }) {
  const { values, handleChange } = useFormikContext<{ items: Array<{ v: string }> }>()
  formikArrayRenders[`item${index}`] = (formikArrayRenders[`item${index}`] ?? 0) + 1
  return (
    <input
      data-testid={`formik-array-item-${index}`}
      name={`items.${index}.v`}
      value={values.items[index].v}
      onChange={handleChange}
    />
  )
}
function FormikArraySection() {
  return (
    <Formik initialValues={{ items: ARRAY_ITEMS }} onSubmit={() => {}}>
      {({ values }) => (
        <FieldArray name="items">
          {(helpers) => (
            <section data-testid="formik-array">
              {values.items.map((_, i) => (
                <span key={i}>
                  <FormikArrayItem index={i} />
                  <button data-testid={`formik-array-remove-${i}`} onClick={() => helpers.remove(i)}>remove</button>
                </span>
              ))}
              <button data-testid="formik-array-move-3-7" onClick={() => helpers.move(3, 7)}>move</button>
            </section>
          )}
        </FieldArray>
      )}
    </Formik>
  )
}

function TanStackArraySection() {
  const form = useTsForm({ defaultValues: { items: ARRAY_ITEMS } })
  return (
    <form.Field name="items" mode="array">
      {(arrayField: any) => (
        <section data-testid="tanstack-array">
          {arrayField.state.value.map((_: unknown, i: number) => (
            <span key={i}>
              <form.Field name={`items[${i}].v`}>
                {(field: any) => {
                  tanstackArrayRenders[`item${i}`] = (tanstackArrayRenders[`item${i}`] ?? 0) + 1
                  return (
                    <input
                      data-testid={`tanstack-array-item-${i}`}
                      value={field.state.value}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => field.handleChange(e.target.value)}
                    />
                  )
                }}
              </form.Field>
              <button data-testid={`tanstack-array-remove-${i}`} onClick={() => arrayField.removeValue(i)}>remove</button>
            </span>
          ))}
          <button data-testid="tanstack-array-move-3-7" onClick={() => arrayField.moveValue(3, 7)}>move</button>
        </section>
      )}
    </form.Field>
  )
}

// ==================== DOM-CLEANUP ====================
const cleanupForm = createForm({
  initialValues: Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`f${i}`, ''])),
})
;(window as any).__getConnectedCount = () => cleanupForm.getConnectedCount()

function CleanupField({ name }: { name: string }) {
  const ref = React.useRef<HTMLInputElement | null>(null)
  React.useEffect(() => {
    if (!ref.current) return
    return cleanupForm.connect(name as any, ref.current)
  }, [name])
  return <input ref={ref} data-testid={`cleanup-${name}`} />
}

function CleanupPage() {
  const [batch, setBatch] = React.useState(0)
  const [mounted, setMounted] = React.useState(true)
  const fieldNames = Object.keys(Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`f${i}`, ''])))

  React.useEffect(() => {
    if (mounted) {
      // Unmount and count this cycle. Batch is incremented on unmount (not remount) so
      // that once batch reaches the limit, the fields stay unmounted/disconnected —
      // otherwise the loop would remount one final time and never disconnect it.
      const t = setTimeout(() => {
        setMounted(false)
        setBatch(b => b + 1)
      }, 20)
      return () => clearTimeout(t)
    } else {
      if (batch >= 10) {
        ;(window as any).__cleanupDone = true
        return
      }
      const t = setTimeout(() => setMounted(true), 20)
      return () => clearTimeout(t)
    }
  }, [batch, mounted])

  return mounted ? <div>{fieldNames.map(n => <CleanupField key={n} name={n} />)}</div> : <div data-testid="cleanup-unmounted" />
}

function RhfCleanupField({ name, register }: { name: string; register: ReturnType<typeof useRhfForm>['register'] }) {
  return <input data-testid={`rhf-cleanup-${name}`} {...register(name)} />
}

function RhfCleanupPage() {
  const { register } = useRhfForm({
    defaultValues: Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`f${i}`, ''])),
  })
  const [batch, setBatch] = React.useState(0)
  const [mounted, setMounted] = React.useState(true)
  const fieldNames = Array.from({ length: 50 }, (_, i) => `f${i}`)

  React.useEffect(() => {
    if (mounted) {
      const t = setTimeout(() => {
        setMounted(false)
        setBatch(b => b + 1)
      }, 20)
      return () => clearTimeout(t)
    } else {
      if (batch >= 10) {
        ;(window as any).__rhfCleanupDone = true
        return
      }
      const t = setTimeout(() => setMounted(true), 20)
      return () => clearTimeout(t)
    }
  }, [batch, mounted])

  return mounted
    ? <div>{fieldNames.map(n => <RhfCleanupField key={n} name={n} register={register} />)}</div>
    : <div data-testid="rhf-cleanup-unmounted" />
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
  if (path.startsWith('/schema-validate/')) {
    const lib = path.slice('/schema-validate/'.length)
    const pages: Record<string, () => React.ReactElement> = {
      neutro: () => <SchemaValidateNeutroPage />,
      rhf: () => <SchemaValidateRhfPage />,
      tanstack: () => <SchemaValidateTanStackPage />,
    }
    return pages[lib]?.() ?? <div data-testid="not-found">Unknown: {lib}</div>
  }
  if (path === '/cleanup') {
    return <CleanupPage />
  }
  if (path === '/cleanup-rhf') {
    return <RhfCleanupPage />
  }
  if (path === '/array') {
    return (
      <div>
        <NeutroArraySection />
        <RhfArraySection />
        <FormikArraySection />
        <TanStackArraySection />
      </div>
    )
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
