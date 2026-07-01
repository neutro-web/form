<script setup lang="ts">
import { onBeforeUpdate } from 'vue'
import { useFieldArray, useForm } from 'vee-validate'

useForm({ initialValues: { items: Array.from({ length: 10 }, (_, i) => ({ v: `item${i}` })) } })
const { fields, remove, move } = useFieldArray<{ v: string }>('items')

const renders: Record<string, number> = {}
;(window as any).__veeArrayRenders = renders
onBeforeUpdate(() => {
  for (let i = 0; i < fields.value.length; i++) {
    renders[`item${i}`] = (renders[`item${i}`] ?? 0) + 1
  }
})
</script>

<template>
  <section data-testid="vee-array">
    <span v-for="(field, i) in fields" :key="field.key">
      <input
        :data-testid="`vee-array-item-${i}`"
        :value="field.value.v"
        @input="(e) => (field.value.v = (e.target as HTMLInputElement).value)"
      />
      <button :data-testid="`vee-array-remove-${i}`" @click="remove(i)">remove</button>
    </span>
    <button data-testid="vee-array-move-3-7" @click="move(3, 7)">move</button>
  </section>
</template>
