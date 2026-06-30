<script setup lang="ts">
import { onBeforeUpdate } from 'vue'
import { useField } from 'vee-validate'

const props = defineProps<{ name: string; renders: Record<string, number> }>()
// Count initial render
props.renders[props.name] = (props.renders[props.name] ?? 0) + 1
// Count reactive re-renders
onBeforeUpdate(() => {
  props.renders[props.name] = (props.renders[props.name] ?? 0) + 1
})

const { value, handleChange } = useField<string>(props.name)
</script>

<template>
  <input
    :data-testid="`vee-${name}`"
    :value="value"
    @input="(e) => handleChange((e.target as HTMLInputElement).value)"
  />
</template>
