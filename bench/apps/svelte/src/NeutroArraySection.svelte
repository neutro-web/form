<script lang="ts">
  import { createForm } from '@neutro/form-core'
  import { useSvelteFormPath } from '@neutro/form-svelte'
  import NeutroArrayItem from './NeutroArrayItem.svelte'

  const ARRAY_ITEMS = Array.from({ length: 10 }, (_, i) => ({ v: `item${i}` }))
  const arrayForm = createForm({ initialValues: { items: ARRAY_ITEMS } })
  const itemsField = useSvelteFormPath(arrayForm, 'items')

  const renders: Record<string, number> = {}
  ;(window as any).__neutroArrayRenders = renders
</script>

<section data-testid="neutro-array">
  {#each ($itemsField.value as Array<{ v: string }>) as item, i (i)}
    <span>
      <NeutroArrayItem form={arrayForm} index={i} {renders} />
      <button data-testid={`neutro-array-remove-${i}`} onclick={() => arrayForm.arrayRemove('items' as any, i)}>remove</button>
    </span>
  {/each}
  <button data-testid="neutro-array-move-3-7" onclick={() => arrayForm.arrayMove('items' as any, 3, 7)}>move</button>
</section>
