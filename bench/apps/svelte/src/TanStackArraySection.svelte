<script lang="ts">
  import { createForm } from '@tanstack/svelte-form'

  const form = createForm(() => ({
    defaultValues: { items: Array.from({ length: 10 }, (_, i) => ({ v: `item${i}` })) },
  }))

  const renders: Record<string, number> = {}
  ;(window as any).__tanstackArrayRenders = renders
</script>

<form.Field name="items" mode="array">
  {#snippet children(arrayField)}
    <section data-testid="tanstack-array">
      {#each arrayField.state.value as _, i}
        <form.Field name={`items[${i}].v`}>
          {#snippet children(field)}
            {@const _track = (renders[`item${i}`] = (renders[`item${i}`] ?? 0) + 1)}
            <input
              data-testid={`tanstack-array-item-${i}`}
              value={field.state.value}
              oninput={(e) => field.handleChange((e.target as HTMLInputElement).value)}
            />
          {/snippet}
        </form.Field>
        <button data-testid={`tanstack-array-remove-${i}`} onclick={() => arrayField.removeValue(i)}>remove</button>
      {/each}
      <button data-testid="tanstack-array-move-3-7" onclick={() => arrayField.moveValue(3, 7)}>move</button>
    </section>
  {/snippet}
</form.Field>
