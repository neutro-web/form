import { z } from 'zod'
import type { FormFixture } from '../adapters/interface.js'

const zodSmallSchema = z.object(
  Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`field${i}`, z.string().min(1)]))
)
const zodLargeSchema = z.object(
  Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`field${i}`, z.string().min(1)]))
)

function toErrors(result: ReturnType<typeof zodSmallSchema.safeParse>): Record<string, string> {
  if (result.success) return {}
  const errors: Record<string, string> = {}
  for (const issue of result.error.issues) errors[issue.path.join('.')] = issue.message
  return errors
}

export const schemaZodSmallFixture: FormFixture = {
  initialValues: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`field${i}`, 'x'])),
  validator: async (values) => toErrors(zodSmallSchema.safeParse(values)),
}

export const schemaZodLargeFixture: FormFixture = {
  initialValues: Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`field${i}`, 'x'])),
  validator: async (values) => toErrors(zodLargeSchema.safeParse(values)),
}
