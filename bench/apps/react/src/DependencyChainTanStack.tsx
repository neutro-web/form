// bench/apps/react/src/DependencyChainTanStack.tsx
import { useForm } from '@tanstack/react-form'

const FIELD_COUNT = 200
const FIELDS = Array.from({ length: FIELD_COUNT }, (_, i) => i)

const tanstackChainValidations: Record<string, number> = {}
;(window as any).__tanstackChainValidations = tanstackChainValidations

export function DependencyChainTanStackPage() {
  const form = useForm({
    defaultValues: Object.fromEntries(FIELDS.map((i) => [`f${i}`, String(i)])),
  })
  return (
    <section data-testid="tanstack-chain-form">
      {FIELDS.map((i) => {
        const name = `f${i}`
        return (
          <form.Field
            key={i}
            name={name as any}
            validators={{
              // Found in round-2 plan review: an earlier draft split the cascade
              // trigger into a separate `listeners.onChange` to avoid synchronous
              // re-entrancy -- but that's actually WRONG: `fieldApi.form.validateField()`
              // only re-invokes the target field's OWN `validators.onChange` (this
              // function), it does NOT re-fire that field's `listeners.onChange` --
              // so a listeners-only trigger dies after exactly one hop (f0 -> f1),
              // and f199 never increments. The cascade call must live HERE, inside
              // validators.onChange, since this is the one callback validateField()
              // actually re-invokes on the target field, which is what makes each
              // hop's own validate() call the next hop's validate() in turn.
              //
              // To avoid the ORIGINAL synchronous-re-entrancy concern (calling
              // validateField from inside this same callback would otherwise nest
              // up to 199 stack frames deep in one keystroke's event handler),
              // defer the cascade call to a microtask -- each hop then runs in its
              // own turn of the microtask queue rather than nested inside the
              // previous hop's still-executing call frame.
              onChange: ({ value, fieldApi }: any) => {
                tanstackChainValidations[name] = (tanstackChainValidations[name] ?? 0) + 1
                if (i < FIELD_COUNT - 1) {
                  queueMicrotask(() => fieldApi.form.validateField(`f${i + 1}`, 'change'))
                }
                if (i === 0) return undefined
                const prevValue = fieldApi.form.getFieldValue(`f${i - 1}`)
                return value !== prevValue ? undefined : 'must differ from previous field'
              },
            }}
          >
            {(field: any) => (
              <input
                data-testid={`tanstack-field-${name}`}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            )}
          </form.Field>
        )
      })}
    </section>
  )
}
