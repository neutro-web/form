<!-- bench/apps/vue/src/ChainFieldVee.vue -->
<script setup lang="ts">
import { useField } from 'vee-validate'
import { onMounted } from 'vue'

const props = defineProps<{
  i: number
  name: string
  prevName: string | null
  chainTriggers: Array<(() => void) | undefined>
}>()

// Synchronous-recursion tradeoff considered (round-3 plan review, same class of
// risk flagged for RHF's trigger() and originally for TanStack's cascade): calling
// chainTriggers[i+1]?.() re-enters the next field's own validate() synchronously,
// up to ~199 native stack frames deep for one keystroke. Safely within engine
// stack limits, so accepted as-is rather than deferred.
const rule = props.i === 0 ? undefined : (value: string) => {
  const counters = (window as any).__veeChainValidations
  counters[props.name] = (counters[props.name] ?? 0) + 1
  if (props.i < 199) {
    props.chainTriggers[props.i + 1]?.()
  }
  const prevValue = (window as any).__veeChainValues?.[props.prevName as string]
  return value !== prevValue || 'must differ from previous field'
}

const { value, validate } = useField<string>(props.name, rule, { validateOnValueUpdate: false })

onMounted(() => {
  props.chainTriggers[props.i] = () => { void validate() }
  const values = ((window as any).__veeChainValues ??= {})
  values[props.name] = value.value
})

// Deliberately NOT using v-model here (found in plan review): v-model attaches its
// own internal input-event listener via the vModelText directive, separate from a
// template @input handler on the same element -- whether the directive's listener
// (which updates `value`) or an explicit @input handler runs first on a given
// keystroke is unspecified ordering, not a documented Vue guarantee. Driving both
// `value` and the window map from ONE explicit handler removes that race entirely.
function onInput(e: Event) {
  const v = (e.target as HTMLInputElement).value
  value.value = v
  const values = ((window as any).__veeChainValues ??= {})
  values[props.name] = v
  if (props.i === 0) props.chainTriggers[1]?.()
}
</script>

<template>
  <input :data-testid="`vee-field-${name}`" :value="value" @input="onInput" />
</template>
