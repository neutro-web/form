<script lang="ts">
  import type { FieldApi } from '@tanstack/form-core'

  const {
    field,
    name,
    renders,
  }: {
    field: FieldApi<any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any>
    name: string
    renders: Record<string, number>
  } = $props()

  $effect.pre(() => {
    // field.state is a reactive getter backed by $state runes via useStore
    void field.state.value
    renders[name] = (renders[name] ?? 0) + 1
  })
</script>

<input
  data-testid={`tanstack-${name}`}
  value={field.state.value}
  oninput={(e) => field.handleChange((e.target as HTMLInputElement).value)}
/>
