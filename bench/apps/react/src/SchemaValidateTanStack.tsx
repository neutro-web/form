import type React from 'react'
import { useForm } from '@tanstack/react-form'
import { zodSmallSchema, FIELDS, initialValues } from './schemaValidateSchema.js'

const tanstackSchemaRenders: Record<string, number> = {}
;(window as any).__tanstackSchemaRenders = tanstackSchemaRenders

export function SchemaValidateTanStackPage() {
  const mode = new URLSearchParams(window.location.search).get('mode') ?? 'onSubmit'
  const form = useForm({
    defaultValues: initialValues,
    validators: mode === 'onChange' ? { onChange: zodSmallSchema } : { onSubmit: zodSmallSchema },
  })
  return (
    <section data-testid="tanstack-schema-form">
      {FIELDS.map((name) => (
        <form.Field key={name} name={name as any}>
          {(f: any) => {
            tanstackSchemaRenders[name] = (tanstackSchemaRenders[name] ?? 0) + 1
            return (
              <input
                data-testid={`tanstack-${name}`}
                value={f.state.value as string}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => f.handleChange(e.target.value)}
              />
            )
          }}
        </form.Field>
      ))}
      <button data-testid="tanstack-submit" onClick={() => form.handleSubmit()}>
        Submit
      </button>
      <form.Field name="field0">
        {(field0: any) => (
          <div data-testid="tanstack-error" style={{ display: field0.state.meta.errors.length ? 'block' : 'none' }}>
            {(field0.state.meta.errors[0] as any)?.message ?? field0.state.meta.errors[0]}
          </div>
        )}
      </form.Field>
    </section>
  )
}
