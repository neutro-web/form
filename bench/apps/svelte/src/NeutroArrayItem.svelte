<script lang="ts">
  import type { FormInstance } from '@neutro/form-core'
  import { useSvelteFormPath } from '@neutro/form-svelte'

  const {
    form,
    index,
    renders,
  }: {
    form: FormInstance<any>
    index: number
    renders: Record<string, number>
  } = $props()

  const field = useSvelteFormPath(form, `items.${index}.v`)

  $effect.pre(() => {
    void $field.value
    renders[`item${index}`] = (renders[`item${index}`] ?? 0) + 1
  })
</script>

<input
  data-testid={`neutro-array-item-${index}`}
  value={$field.value as string}
  oninput={(e) => form.set(`items.${index}.v` as any, (e.target as HTMLInputElement).value)}
/>
