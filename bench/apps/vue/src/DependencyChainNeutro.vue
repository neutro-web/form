<!-- bench/apps/vue/src/DependencyChainNeutro.vue -->
<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { createForm } from '@neutro/form-core'

const FIELD_COUNT = 200
const FIELDS = Array.from({ length: FIELD_COUNT }, (_, i) => `f${i}`)

const neutroChainValidations: Record<string, number> = {}
;(window as any).__neutroChainValidations = neutroChainValidations

const dependencies = Object.fromEntries(
  Array.from({ length: FIELD_COUNT - 1 }, (_, i) => [`f${i}`, [`f${i + 1}`]]),
)

function chainValidator(values: Record<string, string>, scope: string[]) {
  const errors: Record<string, string> = {}
  for (const path of scope) {
    neutroChainValidations[path] = (neutroChainValidations[path] ?? 0) + 1
    const i = Number(path.slice(1))
    if (i === 0) continue
    if (values[path] === values[`f${i - 1}`]) {
      errors[path] = 'must differ from previous field'
    }
  }
  return errors
}

const form = createForm({
  initialValues: Object.fromEntries(FIELDS.map((name, i) => [name, String(i)])),
  dependencies,
  validator: chainValidator,
})
const state = ref(form.getState())
const unsubscribe = form.subscribe((s) => { state.value = s })
onUnmounted(unsubscribe)

function onFieldInput(name: string, value: string) {
  if (name === 'f0') {
    form.set(name as any, value, { validate: true })
  } else {
    form.set(name as any, value)
  }
}
</script>

<template>
  <section data-testid="neutro-chain-form">
    <input
      v-for="name in FIELDS"
      :key="name"
      :data-testid="`neutro-field-${name}`"
      :value="state.values[name]"
      @input="onFieldInput(name, ($event.target as HTMLInputElement).value)"
    />
  </section>
</template>
