<script setup lang="ts">
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import VeeField from './VeeField.vue'
import { zodSmallSchema, FIELDS } from './schemaValidateSchema.js'

const veeSchemaRenders: Record<string, number> = {}
;(window as any).__veeSchemaRenders = veeSchemaRenders

const mode = new URLSearchParams(window.location.search).get('mode') ?? 'onSubmit'

const { handleSubmit, errors } = useForm({
  validationSchema: toTypedSchema(zodSmallSchema),
  validateOnMount: false,
})
</script>

<template>
  <section data-testid="vee-schema-form">
    <VeeField
      v-for="name in FIELDS"
      :key="name"
      :name="name"
      :renders="veeSchemaRenders"
      :validate-on-value-update="mode === 'onChange'"
    />
    <button data-testid="vee-submit" @click="handleSubmit(() => {})()">Submit</button>
    <div data-testid="vee-error" v-show="errors.field0">{{ errors.field0 }}</div>
  </section>
</template>
