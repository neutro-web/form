import { IsString, MinLength, validate } from 'class-validator'
import { classValidatorAdapter } from '@neutro/form-core'
import type { FormFixture } from '../adapters/interface.js'

// class-validator is decorator-based, so the 100-field DTO can't be hand-written
// per field like schema-zod.ts's z.object({...}). IsString()/MinLength(1) are
// ordinary property-decorator factories ((target, propertyKey) => void) — calling
// them directly is functionally identical to `@IsString() field: string` syntax,
// and needs no experimentalDecorators/emitDecoratorMetadata compiler flag since no
// @Foo syntax is used and class-validator reads instance values at runtime, not via
// design:type reflection.
function buildDto(fieldCount: number): new () => Record<string, string> {
  class Dto {}
  for (let i = 0; i < fieldCount; i++) {
    const key = `field${i}`
    IsString()(Dto.prototype, key)
    MinLength(1)(Dto.prototype, key)
  }
  return Dto as new () => Record<string, string>
}

const ClassValidatorSmallDto = buildDto(10)
const ClassValidatorLargeDto = buildDto(100)

// NOTE: unlike schema-zod.ts/schema-yup.ts (which bypass zodAdapter/yupAdapter and
// hand-roll their own error-flattening), this fixture wraps the real
// classValidatorAdapter on purpose — it's the only one of the three adapters that
// has never been exercised outside a mocked unit test. That means this surface's
// numbers measure classValidatorAdapter's own wrapper cost (Object.assign +
// flattenClassValidationErrors) in addition to validate() itself, and are NOT
// directly comparable to schema-validate/zod/* or schema-validate/yup/*, which
// measure a different layer (raw schema-library call only, no adapter wrapper).
// Don't draw a "class-validator is N% slower/faster" conclusion from these
// numbers side by side without first isolating which layer a delta comes from.
export const schemaClassValidatorSmallFixture: FormFixture = {
  initialValues: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`field${i}`, 'x'])),
  validator: classValidatorAdapter(ClassValidatorSmallDto, validate),
}

export const schemaClassValidatorLargeFixture: FormFixture = {
  initialValues: Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`field${i}`, 'x'])),
  validator: classValidatorAdapter(ClassValidatorLargeDto, validate),
}
