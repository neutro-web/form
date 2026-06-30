<script lang="ts">
  import { createForm } from '@tanstack/svelte-form'

  const form = createForm(() => ({
    defaultValues: { email: '' },
  }))
</script>

<div>
  <form.Field
    name="email"
    validators={{
      onChangeAsync: async ({ value }: { value: string }) => {
        ;(window as any).__asyncValidationStart = performance.now()
        await new Promise((r) => setTimeout(r, 200))
        if (!String(value).includes('@')) {
          ;(window as any).__asyncValidationEnd = performance.now()
          return 'Invalid email'
        }
        return undefined
      },
    }}
  >
    {#snippet children(field)}
      {@const err = field.state.meta.errors[0]}
      <input
        data-testid="async-email"
        value={field.state.value}
        oninput={(e) => field.handleChange((e.target as HTMLInputElement).value)}
      />
      {#if err}
        <span data-testid="async-error">{err}</span>
      {/if}
    {/snippet}
  </form.Field>
</div>
