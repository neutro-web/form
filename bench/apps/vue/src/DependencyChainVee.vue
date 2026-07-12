<!-- bench/apps/vue/src/DependencyChainVee.vue -->
<script setup lang="ts">
import { useForm } from 'vee-validate'
import ChainFieldVee from './ChainFieldVee.vue'

const FIELD_COUNT = 200
const FIELDS = Array.from({ length: FIELD_COUNT }, (_, i) => i)

const veeChainValidations: Record<string, number> = {}
;(window as any).__veeChainValidations = veeChainValidations
;(window as any).__veeChainValues = Object.fromEntries(FIELDS.map((i) => [`f${i}`, String(i)]))

useForm({
  initialValues: Object.fromEntries(FIELDS.map((i) => [`f${i}`, String(i)])),
})

const chainTriggers: Array<(() => void) | undefined> = []
</script>

<template>
  <section data-testid="vee-chain-form">
    <ChainFieldVee
      v-for="i in FIELDS"
      :key="i"
      :i="i"
      :name="`f${i}`"
      :prev-name="i > 0 ? `f${i - 1}` : null"
      :chain-triggers="chainTriggers"
    />
  </section>
</template>
