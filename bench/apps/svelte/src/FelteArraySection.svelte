<script lang="ts">
  import { createForm } from 'felte'

  const ARRAY_ITEMS = Array.from({ length: 10 }, (_, i) => ({ v: `item${i}` }))

  const { form: formAction, data, setFields } = createForm({
    initialValues: { items: ARRAY_ITEMS },
  })

  const renders: Record<string, number> = {}
  ;(window as any).__felteArrayRenders = renders

  function removeAt(i: number) {
    const next = ($data.items as Array<{ v: string }>).filter((_, idx) => idx !== i)
    setFields('items', next, true)
  }

  function moveItem(from: number, to: number) {
    const items = [...($data.items as Array<{ v: string }>)]
    const [moved] = items.splice(from, 1)
    items.splice(to, 0, moved)
    setFields('items', items, true)
  }

  $effect.pre(() => {
    const items = $data.items as Array<{ v: string }>
    for (let i = 0; i < items.length; i++) {
      renders[`item${i}`] = (renders[`item${i}`] ?? 0) + 1
    }
  })
</script>

<form use:formAction>
  <section data-testid="felte-array">
    {#each ($data.items as Array<{ v: string }>) as item, i}
      <span>
        <input data-testid={`felte-array-item-${i}`} name={`items.${i}.v`} value={item.v} />
        <button type="button" data-testid={`felte-array-remove-${i}`} onclick={() => removeAt(i)}>remove</button>
      </span>
    {/each}
    <button type="button" data-testid="felte-array-move-3-7" onclick={() => moveItem(3, 7)}>move</button>
  </section>
</form>
