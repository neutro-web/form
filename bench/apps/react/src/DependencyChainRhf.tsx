// bench/apps/react/src/DependencyChainRhf.tsx
import { useForm, type UseFormReturn } from 'react-hook-form'

const FIELD_COUNT = 200
const FIELDS = Array.from({ length: FIELD_COUNT }, (_, i) => i)

const rhfChainValidations: Record<string, number> = {}
;(window as any).__rhfChainValidations = rhfChainValidations

function ChainField({ i, form }: { i: number; form: UseFormReturn<Record<string, string>> }) {
  const { register, trigger, getValues } = form
  const name = `f${i}`

  return (
    <input
      data-testid={`rhf-field-${name}`}
      {...register(name as any, {
        validate: (value: string) => {
          rhfChainValidations[name] = (rhfChainValidations[name] ?? 0) + 1
          if (i < FIELD_COUNT - 1) {
            // Synchronous-recursion tradeoff considered (round-3 plan review, same
            // class of risk flagged for TanStack's cascade): this call re-enters
            // the next field's own validate() synchronously, up to ~199 native
            // stack frames deep for one keystroke. That's safely within V8's stack
            // limit (thousands of frames), so this is accepted as-is rather than
            // deferred -- unlike TanStack's cascade, which needed queueMicrotask
            // for a different reason (validateField only re-invokes the target's
            // own validator, so deferring there didn't add stack depth risk, it
            // was required for the chain to propagate at all).
            void trigger(`f${i + 1}` as any)
          }
          if (i === 0) return true
          const prevValue = getValues(`f${i - 1}` as any)
          return value !== prevValue || 'must differ from previous field'
        },
      })}
    />
  )
}

export function DependencyChainRhfPage() {
  const form = useForm<Record<string, string>>({
    defaultValues: Object.fromEntries(FIELDS.map((i) => [`f${i}`, String(i)])),
    mode: 'onChange',
  })
  return (
    <section data-testid="rhf-chain-form">
      {FIELDS.map((i) => <ChainField key={i} i={i} form={form} />)}
    </section>
  )
}
