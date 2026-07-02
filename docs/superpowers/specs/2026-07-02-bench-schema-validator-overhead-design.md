# Benchmark: Schema-Validator Overhead (Zod/Yup adapters)

**Date:** 2026-07-02
**Status:** Draft — pending user review
**Scope:** `bench/fixtures/`, `bench/suites/core/`, `bench/adapters/*.ts`

---

## Problem

neutro/form ships Zod, Yup, and class-validator schema adapters (per `packages/core`'s README feature list and `docs/api/validation.md`), and this is a well-known strength area for react-hook-form specifically (its `@hookform/resolvers` package for Zod/Yup is heavily used and optimized). But every current benchmark validator is a hand-written plain function (`(values) => errors`), never a real schema library — `bench/fixtures/small.ts`/`large.ts` have no `validator` at all, and the correctness/async suites use inline functions. This means the bench suite has zero data on the exact area where a real head-to-head against RHF's resolver ecosystem would be most informative.

## Design

### New fixture pair: schema-validated small/large forms

```ts
// bench/fixtures/schema-zod.ts
import { z } from 'zod'
export const zodSchema = z.object({
  email: z.string().email(),
  age: z.number().min(18),
  // ...matching small.ts's 10-field shape, with realistic per-field rules
})
```

Reuses the exact field count/shape of `small.ts`/`large.ts` (10/100 fields) so results are directly comparable to the existing non-schema `set-get` numbers — the delta between "plain validator" and "schema validator" cost is the number that matters, not an absolute.

### New surface: `schema-validate/small`, `schema-validate/large`

Benchmark: `set()` a field, then `await form.validate()` (or the equivalent scoped validate), using the Zod schema adapter. Compare against:
- neutro/form's own plain-function validator baseline (`set-get/small`/`large` already exist — use as the "no schema overhead" reference point).
- react-hook-form + `@hookform/resolvers/zod` — the standard, most-used integration path, not a hand-rolled comparison.
- formik + a Zod-via-`toFormikValidationSchema` or Yup-native path (formik's ecosystem convention is closer to Yup).
- vee-validate + its native Zod/Yup integration.
- tanstack-form's validator adapter pattern.

This requires each competitor's bench adapter (`bench/adapters/*.ts`) to grow a schema-aware variant — likely a new adapter file per library rather than modifying the existing plain-validator adapters, to keep the existing `set-get`/`dependency-scopes` etc. surfaces unaffected by this addition (adapter files are already per-surface-agnostic and reused across suites, so adding schema variants as new files, e.g. `bench/adapters/neutro-zod.ts`, preserves that).

### Two schema libraries, tested separately

Zod and Yup have different validation-cost profiles (Zod's `safeParse` vs Yup's `validate`/`validateSync`) — report them as two separate surfaces (`schema-validate/zod/small`, `schema-validate/yup/small`, etc.) rather than picking one, since "which schema library" is itself a real decision point for a reader evaluating this data, and conflating them would hide that.

## Expected outcome / hypothesis

This is the spec most likely to surface a real, fixable *overhead* in neutro's own schema adapters (`packages/core/src/index.ts`'s Zod/Yup/class-validator integration, wherever that lives) if one exists — e.g. re-parsing the whole schema on every validate call instead of caching a compiled validator, or an unnecessary deep-clone before/after schema execution. Unlike the scale/mount specs (which mostly validate existing claims), this one has a real chance of finding something to *fix*, not just something to measure and report as-is — worth treating any surprising number here as a "stop and investigate root cause" trigger before writing it into the public scorecard, same discipline as this release's array-ops/bundle-size investigations.

## Verification

`bench:core` surface, standard `vitest bench` pattern. Given the higher chance of finding a real neutro-side inefficiency here, plan for this spec's implementation to include an explicit "if neutro is unexpectedly slow, profile before concluding it's architectural" step — mirroring how the v0.5.0 array-ops investigation required tracing actual code, not just accepting a number.

## Out of Scope

- class-validator (decorator-based, TypeScript-specific) — Zod and Yup cover the two dominant schema-validation conventions in the ecosystem and are what competitors actually integrate with; class-validator has no direct RHF/vee-validate/etc. ecosystem equivalent to compare against fairly, so a class-validator benchmark would only ever measure neutro in isolation. Worth its own future spec if there's a specific reason to prioritize it, not bundled here.
- Async schema validation (e.g. Zod's `.refine()` with an async check hitting a server) — the existing `async-latency`/`async-cancellation` surfaces already cover async validation timing generally; this spec is specifically about synchronous schema-parse overhead.
