# Benchmark: class-validator Core Surface + Retroactive Adapter Docs

**Date:** 2026-07-12
**Status:** Draft — pending user review
**Scope:** `bench/fixtures/`, `bench/suites/core/`, `bench/tsconfig.json`, `bench/package.json`, `docs/api/validation.md`. No docs/benchmarks page changes, no browser surface, no changes to `classValidatorAdapter` itself.

This is v0.5.0 release-gate item 5 (see the `project_v050_release_gate` memory). Items 1-4 and 7 are resolved; item 6 (nested arrays at scale) remains after this.

---

## Problem

neutro/form ships three schema-validator adapters — `zodAdapter`, `yupAdapter`, `classValidatorAdapter` — documented together in `docs/api/validation.md`. Only two of the three have any benchmark coverage: `bench/suites/core/schema-validate.bench.ts` has `schema-validate/zod/{small,large}` and `schema-validate/yup/{small,large}` surfaces (added per `docs/superpowers/specs/2026-07-02-bench-schema-validator-overhead-design.md`), but `classValidatorAdapter` has none. It is exercised only by `packages/core/test/form.test.ts`'s unit tests, all of which pass a **mocked** `validate` function and a plain `class {}` — never the real `class-validator` package's decorators or its real `validate()` call. So there is currently zero data on whether `classValidatorAdapter` has any of the same class of overhead the 2026-07-02 spec was designed to catch (e.g. redoing expensive setup on every call instead of caching it once).

Separately: none of the three adapters' docs mention that benchmark coverage exists for them at all — a developer reading `docs/api/validation.md` has no way to discover `bench/` even exists. This was raised and confirmed out of scope for *publishing numbers* (the existing zod/yup core benchmarks already deliberately don't appear in `docs/benchmarks/index.md` — they're vitest-bench-only, dev/regression-facing data, per the 2026-07-02 spec's "Competitor comparison belongs in the browser suite, not core" section and confirmed unchanged by the user for this item), but the *existence* of that coverage is still worth surfacing from the adapter reference page.

## Design

### 1. New fixture: `bench/fixtures/schema-class-validator.ts`

class-validator is decorator-based, so the 100-field "large" DTO can't be hand-written per field the way `z.object({...})`/`yup.object({...})` are. Decorators are applied programmatically in a loop instead — the same shape of solution the zod/yup fixtures already use (`Object.fromEntries(Array.from({length}, ...))`), just applied to `Reflect`-style decorator calls instead of a schema-builder object:

```ts
import 'reflect-metadata'
import { IsString, MinLength, validate } from 'class-validator'
import { classValidatorAdapter } from '@neutro/form-core'
import type { FormFixture } from '../adapters/interface.js'

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

export const schemaClassValidatorSmallFixture: FormFixture = {
  initialValues: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`field${i}`, 'x'])),
  validator: classValidatorAdapter(ClassValidatorSmallDto, validate),
}

export const schemaClassValidatorLargeFixture: FormFixture = {
  initialValues: Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`field${i}`, 'x'])),
  validator: classValidatorAdapter(ClassValidatorLargeDto, validate),
}
```

Validation rule (`IsString` + `MinLength(1)`, i.e. "non-empty string") matches Zod's `z.string().min(1)` and Yup's `.required()` on the existing fixtures, so the three schema libraries' relative overhead stays comparable — same field counts (10/100), same rule strictness, same `initialValues` shape (`'x'` per field, already valid — matches the existing fixtures' convention of measuring the passing-validation path).

`classValidatorAdapter` itself is unmodified — this spec is benchmark-only, not an API change.

### 2. New surface in `bench/suites/core/schema-validate.bench.ts`

```ts
import { schemaClassValidatorSmallFixture, schemaClassValidatorLargeFixture } from '../../fixtures/schema-class-validator.js'

describe('schema-validate/class-validator/small', () => {
  const a = neutroAdapter(schemaClassValidatorSmallFixture)
  bench(a.name, async () => {
    a.set('field0', 'x')
    await a.validate()
  })
})

describe('schema-validate/class-validator/large', () => {
  const a = neutroAdapter(schemaClassValidatorLargeFixture)
  bench(a.name, async () => {
    a.set('field0', 'x')
    await a.validate()
  })
})
```

Same `set()` + `await validate()` loop as the existing zod/yup blocks — no new benchmarking pattern introduced.

### 3. Tooling changes (isolated to `bench/`)

- `bench/tsconfig.json`: add `"experimentalDecorators": true` and `"emitDecoratorMetadata": true` to `compilerOptions`. Scoped to `bench/`'s own tsconfig only — no change to the root `tsconfig.json` or any `packages/*` tsconfig, since `classValidatorAdapter` itself takes a pre-validated `ValidationErrorLike[]` and has no decorator dependency of its own.
- `bench/package.json`: add `class-validator` and `reflect-metadata` to `devDependencies`, matching how `zod`/`yup` are already bench devDependencies (not workspace-shared — bench has its own lockfile per `CLAUDE.md`'s Benchmark Suite section).

### 4. Retroactive docs note in `docs/api/validation.md`

Add one sentence under each of the three existing adapter sections (`zodAdapter`, `yupAdapter`, `classValidatorAdapter`) — no new page section, no numbers, just discoverability:

```markdown
> Overhead relative to the plain-function-validator baseline is benchmarked in `bench/suites/core/schema-validate.bench.ts` (`schema-validate/zod/small`, `/large`).
```

(and the equivalent `schema-validate/yup/...` / `schema-validate/class-validator/...` sentence under each respective section). This makes the existing-but-previously-undiscoverable zod/yup coverage and the new class-validator coverage all equally visible from the page a developer would actually land on when looking up an adapter, without publishing any figures (consistent with the standing decision that core schema-validate numbers stay dev/regression-facing only, not part of the public comparison page).

### 5. Changelog: no manual edit

`CHANGELOG.md` is generated by release-please from conventional commit messages (per `CLAUDE.md`'s Release Flow). This spec's implementation commits should use correct scoping — e.g. `feat(bench): add class-validator core schema-validate benchmark`, `docs: note bench coverage in validation.md for zod/yup/class-validator adapters` — so they surface automatically in the next release's changelog. No direct edit to `CHANGELOG.md` is part of this spec's deliverable.

## Expected outcome / hypothesis

Per the 2026-07-02 spec's framing (still the operative hypothesis here): this class of benchmark has the highest chance in this release cycle of surfacing a real, fixable inefficiency in neutro's own adapter code, because `classValidatorAdapter`'s `Object.assign(new cls(), values)` + `await validate(instance)` pattern has never been measured against real class-validator machinery before. If `schema-validate/class-validator/*` comes back surprising relative to `schema-validate/zod/*`/`schema-validate/yup/*` (accounting for class-validator's own known reflection overhead, which is real and expected to show up as *some* delta), that is a "stop and profile before concluding it's architectural" trigger — same discipline as the 2026-07-02 spec and the v0.5.0 array-ops/bundle-size investigations — not just a number to record and move on from.

## Verification

- `pnpm --dir bench run bench:core` (or `bench:core:sample` for a quick local check) — confirm `schema-validate/class-validator/small` and `/large` report sane, non-error numbers alongside the existing zod/yup blocks.
- `pnpm docs:build` — confirm the three one-line additions to `docs/api/validation.md` render cleanly (no broken Markdown, no VitePress build warnings introduced).
- Full pipeline: `pnpm lint && pnpm exec tsc --noEmit && pnpm build && pnpm test` (per `CLAUDE.md`'s pre-push checklist).
- If the class-validator number is surprising relative to zod/yup (see "Expected outcome" above): profile before writing any conclusion into a commit message or this spec's own record.

## Out of Scope

- Publishing any of the three schema-validate core surfaces' numbers to `docs/benchmarks/index.md` — confirmed unchanged by the user for this item; core schema-validate stays dev/regression-facing only, exactly like it already is for zod/yup.
- Browser-level comparison for class-validator — no fair ecosystem competitor exists to race it against, even at the browser-app level (this was the original reason item 5 was deferred, and it still holds — only the *coverage-gap* half of the original deferral reasoning turned out to be avoidable, since core benches were never competitor comparisons in the first place).
- Any change to `classValidatorAdapter`'s implementation, `zodAdapter`/`yupAdapter`'s implementation, or the `Validator<T>` contract — this spec is benchmark-and-docs only. If the "Expected outcome" investigation does find a real fixable inefficiency, that becomes its own follow-up commit/spec, not silently bundled into this one.
- `valibotAdapter` — it exists and is documented in `docs/api/validation.md` alongside the other three, but was never part of the original 2026-07-02 spec's three-adapter scope or this release gate's item 5; adding benchmark coverage and a docs note for it is a separate, unscoped decision, not bundled here.
- Async schema validation, new Node-level competitor bench adapters — both already ruled out by the 2026-07-02 spec and unaffected by this one.
