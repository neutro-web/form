<script setup lang="ts">
import { onBeforeUpdate } from 'vue'
import type { FormInstance } from '@neutro/form-core'
import { useVueFormPath } from '@neutro/form-vue'

const props = defineProps<{
  form: FormInstance<any>
  name: string
  renders: Record<string, number>
}>()

const { value } = useVueFormPath(props.form, props.name)
// Count the initial render (mirrors React function-body semantics)
props.renders[props.name] = (props.renders[props.name] ?? 0) + 1
// Count every subsequent reactive re-render
onBeforeUpdate(() => {
  props.renders[props.name] = (props.renders[props.name] ?? 0) + 1
})
</script>

<template>
  <input
    :data-testid="`neutro-${name}`"
    :value="(value as unknown) as string"
    @input="form.set(name as any, ($event.target as HTMLInputElement).value)"
  />
</template>
