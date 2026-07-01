<script lang="ts">
  import { createForm } from '@tanstack/svelte-form'

  function cancellationDelay(value: string): number {
    return value.includes('slow') ? 600 : 100
  }

  const form = createForm(() => ({
    defaultValues: { email: '' },
  }))
</script>

<div>
  <form.Field
    name="email"
    validators={{
      onChangeAsync: async ({ value }: { value: string }) => {
        await new Promise((r) => setTimeout(r, cancellationDelay(value)))
        if (!String(value).includes('@')) return 'Invalid email'
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
