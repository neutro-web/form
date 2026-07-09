# Browser-Level Schema-Validate Competitor Comparison — Design

Date: 2026-07-09
Status: Approved (design phase)
Release gate: v0.5.0, item 3 of 6 remaining (see memory `project_v050_release_gate`)
Builds on: `docs/superpowers/specs/2026-07-02-bench-schema-validator-overhead-design.md`, whose "Competitor comparison belongs in the browser suite, not core" section explicitly deferred this exact follow-on. That spec's Node-level, neutro-only `schema-validate/zod/*`, `schema-validate/yup/*` core surfaces are already implemented and measured (confirmed present in `bench/suites/core/schema-validate.bench.ts`, remeasured as part of the v0.5.0 performance audit with "No change" verdicts against the pre-modular-split baseline).

## Problem

neutro/form ships Zod/Yup/class-validator schema adapters, and schema validation is a well-known strength area for the competitor ecosystem — react-hook-form's `@hookform/resolvers` in particular. The existing Node-level `schema-validate` core surface only measures neutro's own schema-parse overhead relative to its own plain-validator baseline (a deliberate, previously-decided scope — no Node-level competitor shims, per commit `3da9090`). There is currently zero data on how neutro's schema-validated write/validate/render cycle compares to competitors' *real* schema integrations running in their actual render context (React/Vue/Svelte), which is the only fair way to compare libraries whose validation is tightly coupled to their own render/reactivity model.

## Non-goals

- **No new Node-level competitor adapters.** Already explicitly rejected by prior project decision (commit `3da9090`); this spec's whole premise is that a fair comparison requires a real browser render context, which a Node harness cannot provide.
- **No Formik+Zod comparison.** Formik has no official Zod resolver — only an unofficial third-party package (`zod-formik-adapter`). Per explicit decision, Formik is marked N/A for this specific comparison (not silently dropped, not force-fit via an unofficial adapter) — Formik keeps its existing full participation in every other browser surface (`mount-cost`, `re-renders`, etc.), this exclusion is scoped to schema-validate only.
- **No Yup or class-validator browser comparison in this spec.** Zod-everywhere was the explicit decision, since every included competitor (RHF, tanstack-form, vee-validate, felte) has an official first-party Zod integration, making it the one schema library where a like-for-like comparison across all of them is actually possible. A Yup-based or class-validator-based browser follow-on is out of scope here (class-validator was already out of scope for the Node-level spec too, for the same "no fair ecosystem equivalent" reason).
- **No changes to the existing Node-level `schema-validate` core surface.** That work is done; this spec is purely additive (new browser routes + specs).

## Design

### Fixture shape: identical to the existing Node-level fixtures

Reuses the exact 10-field shape and Zod schema already defined in `bench/fixtures/schema-zod.ts`'s `zodSmallSchema` (`z.object({ field0: z.string().min(1), ..., field9: z.string().min(1) })`), so the browser-level numbers this spec produces are directly comparable in shape (not magnitude — different measurement environments) to the Node-level schema-parse-cost numbers already measured. Initial values: all 10 fields empty string (so the form starts invalid — required for the submit-latency spec's "fill invalid, submit, wait for errors" flow to have something to measure).

### New routes: one per library per app, added to the existing bench apps

| App (port) | Route | Library | Zod integration used |
|---|---|---|---|
| React (4173) | `/schema-validate/neutro` | neutro/form (React) | `zodAdapter` (existing, `packages/core/src/index.ts`) |
| React (4173) | `/schema-validate/rhf` | react-hook-form | `@hookform/resolvers/zod`'s `zodResolver` |
| React (4173) | `/schema-validate/tanstack` | tanstack-form (React) | tanstack-form's official Zod validator adapter |
| Vue (4174) | `/schema-validate/neutro` | neutro/form (Vue) | `zodAdapter` |
| Vue (4174) | `/schema-validate/vee` | vee-validate | `@vee-validate/zod` |
| Svelte (4175) | `/schema-validate/neutro` | neutro/form (Svelte) | `zodAdapter` |
| Svelte (4175) | `/schema-validate/tanstack` | tanstack-form (Svelte) | tanstack-form's official Zod validator adapter |
| Svelte (4175) | `/schema-validate/felte` | felte | `@felte/validator-zod` |

Formik is deliberately absent from this table (N/A per the Non-goals section, not omitted by oversight).

Each route renders 10 text inputs (`data-testid="{prefix}-field{i}"`, matching the existing `mount-cost`/`re-renders` testid convention exactly, where `{prefix}` is `neutro`/`rhf`/`tanstack`/`vee`/`felte`), a submit button (`data-testid="{prefix}-submit"`), and an error-display region (`data-testid="{prefix}-error"`) that becomes visible when field0's validation error is present after a submit attempt. Each library's real, idiomatic Zod-resolver wiring is used — no custom validation glue code that could artificially advantage or disadvantage a library.

**Package availability must be verified during implementation, not assumed here.** If a listed package (`@hookform/resolvers`, `@vee-validate/zod`, `@felte/validator-zod`, tanstack-form's Zod adapter) turns out to be unavailable/unmaintained/incompatible with the pinned competitor version already in `bench/apps/*/package.json`, that specific route is dropped and the competitor is marked N/A for this surface with a stated reason in `bench/annotations.ts` — the same treatment as Formik, applied to whichever library actually hits this, not assumed to never happen.

### Two new Playwright spec files, reusing established patterns exactly

**`bench/suites/browser/schema-validate-rerenders.spec.ts`** — reuses `re-renders.spec.ts`'s exact `measureReRenders`/`window.__<lib>Renders` counter mechanism (already proven, no new instrumentation needed): type into `field0` 20 times, count total re-renders across all fields, on the new `/schema-validate/*` routes instead of the existing plain-form routes. Same `COMBOS` array structure (name/port/prefix/key/library/limit), one row per included library from the table above.

**`bench/suites/browser/schema-validate-submit.spec.ts`** — new measurement, following `mount-cost.spec.ts`'s `performance` API usage pattern but bracketing a user action instead of navigation timing: fill all 10 fields with an invalid value (empty string — already the initial state, so this spec can skip straight to clicking submit), call `performance.mark('schema-validate-submit-start')` via `page.evaluate` immediately before clicking the submit button, wait for the error region (`data-testid="{prefix}-error"`) to become visible, then `performance.mark('schema-validate-submit-end')` and `performance.measure(...)` to compute the elapsed ms, read back via `page.evaluate`. Same `COMBOS`-array/`attach`-helper structure as the other two specs, reporting `submitLatencyMs` in the `BrowserResult` attachment.

### Reporting: no new mechanism

Both specs feed `bench/results/browser.json` through the existing Playwright-attachment → merge pipeline (same as every other browser spec). Two new surface names are added to `bench/annotations.ts`'s `PASS_REASONS` (why neutro's badge is Win/Tied/Behind) and, if any competitor package proves unavailable per the note above, to `ANNOTATIONS` (N/A reason) — Formik's schema-validate N/A entry is added unconditionally as part of this spec's implementation, regardless of what else is found. `generate-page.ts`'s existing scorecard-table generation picks up both new surfaces automatically, following the same per-surface-row convention as every other benchmark already in `docs/benchmarks/index.md`.

## Testing

1. Both new spec files' assertions are loose sanity bounds, not strict pass/fail thresholds — `expect(renderCount).toBeGreaterThanOrEqual(0)` / a generous library-specific ceiling (mirroring `re-renders.spec.ts`'s existing per-library `limit` field, recalibrated for the schema-validate context rather than reusing the plain-form limits verbatim, since schema validation adds real per-keystroke cost that could legitimately push counts higher for some libraries), and `expect(submitLatencyMs).toBeGreaterThanOrEqual(0)` for the new surface — the scorecard's comparative table is where the real signal lives, not a binary pass/fail per library.
2. Before trusting any number, run the full `bench:browser` pipeline once and manually verify each new route actually renders the 10-field form and its Zod validation genuinely fires (e.g., temporarily log a validation result in the browser console during implementation) — the project's established discipline of not trusting a benchmark number without confirming the harness is measuring what it claims to measure applies here too.
3. `bench:full` (the complete pipeline: apps build → core → correctness → browser → bundle-size → merge → generate) must run clean end-to-end with the two new surfaces present in the regenerated `docs/benchmarks/index.md` before this work is considered complete.

## Risks

- **Different competitors' Zod integrations may have meaningfully different validation-triggering semantics** (e.g., validate-on-submit vs validate-on-blur vs validate-on-change as each library's *default* mode) — if left at each library's own default, the comparison could conflate "schema-validation cost" with "how eagerly does this library validate," which is a different question. The implementation must explicitly configure each library's schema-validate mode to trigger validation the same way (on submit, for the submit-latency spec; on change, for the re-render spec) rather than accepting whatever each library's out-of-the-box default happens to be — otherwise the numbers measure the wrong thing.
- **Formik's N/A treatment must be visible in the generated scorecard, not silently absent.** A reader seeing Formik present in every other row of `docs/benchmarks/index.md` but missing from the schema-validate row (with no annotation) would reasonably assume it was overlooked, not deliberately excluded — the N/A annotation and its reason must render in the actual generated page, verified by inspection after `bench:generate`, not just present in `annotations.ts`'s source.
- **A library whose real Zod package turns out to be unavailable mid-implementation** is a real possibility (this space moves fast, package APIs/exports change) — if this happens, treat it exactly like the Formik case (N/A with a stated reason), not as a blocker for the rest of the spec.

## Open questions for the implementation plan

- Exact configuration needed per library to force "validate on submit" (for `schema-validate-submit.spec.ts`) vs "validate on change" (for `schema-validate-rerenders.spec.ts`) — each library's real API for this differs and needs to be looked up/verified against that library's actual current documentation during planning, not guessed.
- Whether `schema-validate-rerenders.spec.ts`'s per-library render-count limits should be set relative to the existing plain-form `re-renders.spec.ts` limits (e.g. "no more than 2x the plain-form limit") or as fresh absolute numbers determined empirically after the routes exist — decide once real numbers are available during implementation, not before.
