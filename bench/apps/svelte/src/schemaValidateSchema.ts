// (same content in bench/apps/react/src/schemaValidateSchema.ts and
//  bench/apps/vue/src/schemaValidateSchema.ts — each app installs zod
//  independently, so this is duplicated per app, not shared via import)
import { z } from 'zod'

export const zodSmallSchema = z.object(
  Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`field${i}`, z.string().min(1)]))
)

export const FIELD_COUNT = 10
export const FIELDS = Array.from({ length: FIELD_COUNT }, (_, i) => `field${i}`)
export const initialValues = Object.fromEntries(FIELDS.map((n) => [n, '']))
