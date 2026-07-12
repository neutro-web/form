<!-- bench/apps/svelte/src/DependencyChainTanStack.svelte -->
<script lang="ts">
  import { createForm as createTsForm } from '@tanstack/svelte-form'

  const FIELD_COUNT = 200
  const FIELDS = Array.from({ length: FIELD_COUNT }, (_, i) => i)

  const tanstackChainValidations: Record<string, number> = {}
  ;(window as any).__tanstackChainValidations = tanstackChainValidations

  const form = createTsForm(() => ({
    defaultValues: Object.fromEntries(FIELDS.map((i) => [`f${i}`, String(i)])),
  }))
</script>

<section data-testid="tanstack-chain-form">
  {#each FIELDS as i}
    {@const name = `f${i}`}
    <form.Field
      {name}
      validators={{
        // Same fix as the React DependencyChainTanStack.tsx above (round-2 plan
        // review): the cascade trigger must live HERE, not in a separate
        // `listeners.onChange` -- validateField() only re-invokes the target
        // field's own validators.onChange, not its listeners, so a listeners-only
        // trigger dies after one hop. Deferred via queueMicrotask to avoid nesting
        // 199 stack frames synchronously inside one keystroke's event handler.
        onChange: ({ value, fieldApi }) => {
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
      {#snippet children(field)}
        <input
          data-testid={`tanstack-field-${name}`}
          value={field.state.value}
          oninput={(e) => field.handleChange((e.target as HTMLInputElement).value)}
        />
      {/snippet}
    </form.Field>
  {/each}
</section>
