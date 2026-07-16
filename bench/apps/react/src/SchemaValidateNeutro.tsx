import { useCallback, useSyncExternalStore } from 'react'
import { createForm, zodAdapter } from '@neutro/form-core'
import { useFormPath } from '@neutro/form-react'
import { zodSmallSchema, FIELDS, initialValues } from './schemaValidateSchema.js'

const neutroSchemaRenders: Record<string, number> = {}
;(window as any).__neutroSchemaRenders = neutroSchemaRenders

const mode = new URLSearchParams(window.location.search).get('mode') ?? 'onSubmit'
const form = createForm({
  initialValues,
  validator: zodAdapter(zodSmallSchema),
  validationMode: mode === 'onChange' ? 'onChange' : 'onSubmitOnly',
})

function Field({ name }: { name: string }) {
  neutroSchemaRenders[name] = (neutroSchemaRenders[name] ?? 0) + 1
  const value = useFormPath(form, name as any)
  return (
    <input
      data-testid={`neutro-${name}`}
      value={value as string}
      onChange={(e) => form.set(name as any, e.target.value)}
    />
  )
}

export function SchemaValidateNeutroPage() {
  const getField0Error = useCallback(() => form.getState().errors.field0 ?? '', [])
  const field0Error = useSyncExternalStore(
    (cb) => form.subscribeToPath('field0' as any, cb),
    getField0Error,
  )
  return (
    <section data-testid="neutro-schema-form">
      {FIELDS.map((name) => <Field key={name} name={name} />)}
      <button
        data-testid="neutro-submit"
        onClick={() => form.validate()}
      >
        Submit
      </button>
      <div data-testid="neutro-error" style={{ display: field0Error ? 'block' : 'none' }}>
        {field0Error}
      </div>
    </section>
  )
}
