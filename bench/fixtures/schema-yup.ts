import * as yup from 'yup'
import type { FormFixture } from '../adapters/interface.js'

const yupSmallSchema = yup.object(
  Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`field${i}`, yup.string().required()]))
)
const yupLargeSchema = yup.object(
  Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`field${i}`, yup.string().required()]))
)

async function toErrors(schema: yup.ObjectSchema<any>, values: any): Promise<Record<string, string>> {
  try {
    await schema.validate(values, { abortEarly: false })
    return {}
  } catch (err) {
    const errors: Record<string, string> = {}
    if (err instanceof yup.ValidationError) {
      for (const inner of err.inner) if (inner.path) errors[inner.path] = inner.message
    }
    return errors
  }
}

export const schemaYupSmallFixture: FormFixture = {
  initialValues: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`field${i}`, 'x'])),
  validator: (values) => toErrors(yupSmallSchema, values),
}

export const schemaYupLargeFixture: FormFixture = {
  initialValues: Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`field${i}`, 'x'])),
  validator: (values) => toErrors(yupLargeSchema, values),
}
