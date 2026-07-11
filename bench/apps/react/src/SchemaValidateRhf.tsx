import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { zodSmallSchema, FIELDS, initialValues } from './schemaValidateSchema.js'

const rhfSchemaRenders: Record<string, number> = {}
;(window as any).__rhfSchemaRenders = rhfSchemaRenders

export function SchemaValidateRhfPage() {
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: initialValues,
    resolver: zodResolver(zodSmallSchema),
    mode: 'onSubmit', // validate on submit only -- matches the submit-latency spec's intent
  })
  for (const name of FIELDS) rhfSchemaRenders[name] = (rhfSchemaRenders[name] ?? 0) + 1
  return (
    <section data-testid="rhf-schema-form">
      {FIELDS.map((name) => (
        <input key={name} data-testid={`rhf-${name}`} {...register(name as any)} />
      ))}
      <button data-testid="rhf-submit" onClick={handleSubmit(() => {})}>
        Submit
      </button>
      <div data-testid="rhf-error" style={{ display: (errors as any).field0 ? 'block' : 'none' }}>
        {(errors as any).field0?.message}
      </div>
    </section>
  )
}
