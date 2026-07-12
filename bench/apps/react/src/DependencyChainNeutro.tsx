// bench/apps/react/src/DependencyChainNeutro.tsx
import { createForm } from '@neutro/form-core'
import { useFormPath } from '@neutro/form-react'

const FIELD_COUNT = 200
const FIELDS = Array.from({ length: FIELD_COUNT }, (_, i) => `f${i}`)

const neutroChainValidations: Record<string, number> = {}
;(window as any).__neutroChainValidations = neutroChainValidations

const dependencies = Object.fromEntries(
  Array.from({ length: FIELD_COUNT - 1 }, (_, i) => [`f${i}`, [`f${i + 1}`]]),
)

// Form-level validator: given the current values and the scope of paths that need
// (re-)validating this pass, increments each validated field's counter and checks
// "must differ from previous field" for every field except f0. The `dependencies`
// config above is what turns ONE form.set('f0', v, { validate: true }) call into a
// scope containing all 200 fields -- this validator just executes each member.
function chainValidator(values: Record<string, string>, scope: string[]) {
  const errors: Record<string, string> = {}
  for (const path of scope) {
    neutroChainValidations[path] = (neutroChainValidations[path] ?? 0) + 1
    const i = Number(path.slice(1))
    if (i === 0) continue
    if (values[path] === values[`f${i - 1}`]) {
      errors[path] = 'must differ from previous field'
    }
  }
  return errors
}

const form = createForm({
  initialValues: Object.fromEntries(FIELDS.map((name, i) => [name, String(i)])),
  dependencies,
  validator: chainValidator,
})

function ChainField({ name }: { name: string }) {
  // Reuses the same @neutro/form-react hook the rest of this app's NeutroField
  // already uses (see App.tsx) -- no need to hand-roll useSyncExternalStore here.
  const value = useFormPath(form, name as any)
  return (
    <input
      data-testid={`neutro-field-${name}`}
      value={value as string}
      onChange={(e) => {
        if (name === 'f0') {
          form.set(name as any, e.target.value, { validate: true })
        } else {
          form.set(name as any, e.target.value)
        }
      }}
    />
  )
}

export function DependencyChainNeutroPage() {
  return (
    <section data-testid="neutro-chain-form">
      {FIELDS.map((name) => <ChainField key={name} name={name} />)}
    </section>
  )
}
