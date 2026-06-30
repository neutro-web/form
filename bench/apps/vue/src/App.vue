<script setup lang="ts">
import { createForm } from '@neutro/form-core'
import NeutroField from './NeutroField.vue'

const FIELD_NAMES = Array.from({ length: 10 }, (_, i) => `field${i}`)
const neutroForm = createForm({
  initialValues: Object.fromEntries(FIELD_NAMES.map(n => [n, ''])),
})
const neutroRenders: Record<string, number> = {}
;(window as any).__neutroRenders = neutroRenders
;(window as any).__resetRenders = () => {
  for (const k in neutroRenders) neutroRenders[k] = 0
}
</script>

<template>
  <div>
    <section data-testid="neutro-form">
      <NeutroField
        v-for="name in FIELD_NAMES"
        :key="name"
        :form="neutroForm"
        :name="name"
        :renders="neutroRenders"
      />
    </section>
  </div>
</template>
