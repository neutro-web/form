<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { createForm, zodAdapter } from '@neutro/form-core'
import NeutroField from './NeutroField.vue'
import { zodSmallSchema, FIELDS, initialValues } from './schemaValidateSchema.js'

const neutroSchemaRenders: Record<string, number> = {}
;(window as any).__neutroSchemaRenders = neutroSchemaRenders

const mode = new URLSearchParams(window.location.search).get('mode') ?? 'onSubmit'
const form = createForm({
  initialValues,
  validator: zodAdapter(zodSmallSchema),
  validationMode: mode === 'onChange' ? 'onChange' : 'onSubmitOnly', // ValidationMode has no 'onSubmit' member -- it's 'onSubmitOnly' (packages/core/src/index.ts)
})
const state = ref(form.getState())
const unsubscribe = form.subscribe((s) => { state.value = s })
onUnmounted(unsubscribe)
</script>

<template>
  <section data-testid="neutro-schema-form">
    <NeutroField
      v-for="name in FIELDS"
      :key="name"
      :form="form"
      :name="name"
      :renders="neutroSchemaRenders"
    />
    <button data-testid="neutro-submit" @click="form.validate()">Submit</button>
    <div data-testid="neutro-error" v-show="state.errors.field0">{{ state.errors.field0 }}</div>
  </section>
</template>
