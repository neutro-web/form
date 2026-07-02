# Benchmark: Schema-Validator Overhead (Zod/Yup adapters)

**Date:** 2026-07-02
**Status:** Draft — pending user review
**Scope:** `bench/fixtures/`, `bench/suites/core/` (neutro-only, matching every existing core surface's convention). Browser-level competitor comparison is explicitly out of scope for this spec — see "Competitor comparison belongs in the browser suite, not core" below.

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

**Async-wrapping confound — must be acknowledged, not silently absorbed.** `bench/adapters/interface.ts`'s `FormFixture.validator` is typed as `(values: any) => Promise<Record<string, string>>` — async-only. The existing `neutro` adapter (`bench/adapters/neutro.ts`) wraps any provided validator in `async (values) => fixture.validator!(values)` regardless of whether the underlying function is actually synchronous. That means even a synchronous `zodSchema.safeParse(values)` call gets measured through a `Promise` wrapper and at least one microtask tick — this is fine for *relative* comparison (plain-validator baseline vs. schema-validator surface both pay the same wrapping cost), but it means this spec's own "Out of Scope" line below (excluding async validation because "this spec is specifically about synchronous schema-parse overhead") is not quite accurate as written — the harness never measures pure synchronous cost in isolation, only "sync work plus a uniform async-wrapper tax." Rephrase the framing during implementation to "schema-parse cost relative to the plain-validator baseline, both measured through the existing async-wrapped harness" rather than claiming a synchronous-only measurement.

### New surface: `schema-validate/small`, `schema-validate/large` — neutro-only at the core level

Benchmark: `set()` a field, then `await form.validate()` (or the equivalent scoped validate), using the Zod schema adapter, measured against neutro/form's own plain-function validator baseline (`set-get/small`/`large` already exist — use as the "no schema overhead" reference point).

**Correction from initial draft: no competitor adapters at the core/Node level.** The original draft proposed growing `bench/adapters/*.ts` with schema-aware variants for react-hook-form, formik, vee-validate, and tanstack-form. This directly re-proposes a pattern the project already built and deliberately reverted — commit `3da9090` ("strip Node.js competitor shims; core suites are now neutro-only") removed exactly this kind of adapter (`bench/adapters/{formik,rhf,tanstack,vee-validate}.ts`, all deleted) because a Node-level "shim" can't actually exercise RHF/Formik's real hook machinery outside a React render context — the deleted `formik.ts` adapter's own comment admitted it was "a plain store; Formik hooks unavailable outside React render context," i.e. not really testing Formik at all. The commit's stated, current policy: **"Real competitor comparisons will live in browser Playwright tests."** Every other core (`bench/suites/core/`) surface in this repo is neutro-only for exactly this reason — `set-get`, `subscriptions`, `dependency-scopes`, `computed-fields`, `array-ops` all only benchmark `neutroAdapter`.

So: `schema-validate/small`/`large` should be a **neutro-only core surface**, following the established pattern — measuring the schema-adapter overhead relative to neutro's own plain-validator baseline, not a cross-library race at the core level.

### Competitor comparison belongs in the browser suite, not core

If a real head-to-head against RHF's `@hookform/resolvers/zod` (or vee-validate's native Zod/Yup integration, etc.) is wanted, it needs to run inside the actual bench apps (`bench/apps/react/src/App.tsx` etc.) using each library's real, idiomatic integration — the same pattern already used for `re-renders`, `array-ops`, and `async-cancellation`. This is a larger, separate addition (new bench-app routes/sections with real `@hookform/resolvers` + Zod wiring, a real `<Formik validationSchema={...}>` setup, etc.) and should be scoped as its own follow-on to this spec once the neutro-only core baseline exists, not bundled into the same task — matching how this release's own work sequenced "does neutro's own number make sense" before "how does it compare."

### Two schema libraries, tested separately

Zod and Yup have different validation-cost profiles (Zod's `safeParse` vs Yup's `validate`/`validateSync`) — report them as two separate surfaces (`schema-validate/zod/small`, `schema-validate/yup/small`, etc.) rather than picking one, since "which schema library" is itself a real decision point for a reader evaluating this data, and conflating them would hide that.

## Expected outcome / hypothesis

This is the spec most likely to surface a real, fixable *overhead* in neutro's own schema adapters (`packages/core/src/index.ts`'s Zod/Yup/class-validator integration, wherever that lives) if one exists — e.g. re-parsing the whole schema on every validate call instead of caching a compiled validator, or an unnecessary deep-clone before/after schema execution. Unlike the scale/mount specs (which mostly validate existing claims), this one has a real chance of finding something to *fix*, not just something to measure and report as-is — worth treating any surprising number here as a "stop and investigate root cause" trigger before writing it into the public scorecard, same discipline as this release's array-ops/bundle-size investigations.

## Verification

`bench:core` surface, standard `vitest bench` pattern. Given the higher chance of finding a real neutro-side inefficiency here, plan for this spec's implementation to include an explicit "if neutro is unexpectedly slow, profile before concluding it's architectural" step — mirroring how the v0.5.0 array-ops investigation required tracing actual code, not just accepting a number.

## Out of Scope

- class-validator (decorator-based, TypeScript-specific) — Zod and Yup cover the two dominant schema-validation conventions in the ecosystem; class-validator has no direct RHF/vee-validate/etc. ecosystem equivalent to compare against fairly even at the browser-comparison follow-on stage. Worth its own future spec if there's a specific reason to prioritize it, not bundled here.
- Async schema validation (e.g. Zod's `.refine()` with an async check hitting a server) — the existing `async-latency`/`async-cancellation` surfaces already cover async validation *timing* generally (deliberate `setTimeout`-based delays); this spec is about schema-*parse* cost specifically, acknowledging (per the async-wrapping confound noted above) that the harness itself always measures through one async-wrapper tick regardless.
- Browser-level competitor comparison (RHF + `@hookform/resolvers`, vee-validate's native integration, etc.) — see "Competitor comparison belongs in the browser suite, not core" above; this is a real, separate follow-on, not part of this spec's deliverable.
- New Node-level competitor bench adapters of any kind — explicitly rejected by prior project decision (commit `3da9090`); do not reintroduce.
