<script setup lang="ts">
import { onBeforeUpdate } from 'vue'
import { createForm } from '@neutro/form-core'
import { useVueFormPath } from '@neutro/form-vue'

const ARRAY_ITEMS = Array.from({ length: 10 }, (_, i) => ({ v: `item${i}` }))
const arrayForm = createForm({ initialValues: { items: ARRAY_ITEMS } })
const { value: items } = useVueFormPath(arrayForm, 'items')

const renders: Record<string, number> = {}
;(window as any).__neutroArrayRenders = renders
onBeforeUpdate(() => {
  for (let i = 0; i < (items.value as any[])?.length; i++) {
    renders[`item${i}`] = (renders[`item${i}`] ?? 0) + 1
  }
})
</script>

<template>
  <section data-testid="neutro-array">
    <span v-for="(_, i) in (items as any[])" :key="i">
      <input
        :data-testid="`neutro-array-item-${i}`"
        :value="(items as any[])[i].v"
        @input="(e) => arrayForm.set(`items.${i}.v` as any, (e.target as HTMLInputElement).value)"
      />
      <button :data-testid="`neutro-array-remove-${i}`" @click="arrayForm.arrayRemove('items' as any, i)">remove</button>
    </span>
    <button data-testid="neutro-array-move-3-7" @click="arrayForm.arrayMove('items' as any, 3, 7)">move</button>
  </section>
</template>
