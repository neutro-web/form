# v0.5.0 Performance Audit — Design

Date: 2026-07-09
Status: Approved (design phase)
Release gate: v0.5.0, item 7 of 7 (see memory `project_v050_release_gate`) — runs now, before items 3-6

## Problem

The modular bundle-splitting work (release-gate item 2) hoisted `createForm`'s closure state into a shared `ctx` object and relocated feature clusters into `attachX(ctx, config?)` modules. This achieved its goal (a working `@neutro/form/core/minimal` tier, ~33% smaller gzip) but introduced two measured, previously-undisclosed costs, found only after the fact by directly re-benchmarking against a pre-split worktree:

1. **`set-get.bench.ts` (the hottest write path, `setFieldValue`) is ~2-5% slower** — median-of-3 runs, old vs new, across all three fixture sizes (small/large/xlarge). The likely cause: `setFieldValue` now calls `ctx.isComputedField(path)` and `ctx.hasComputedFields()` through function-pointer indirection on every write, replacing the old direct `computedMap.has(path)` / `computedMap.size > 0` checks. The plan's own Risk section predicted this indirection was "unlikely to be measurably slower" — it was wrong, though the actual cost is modest.
2. **The full `@neutro/form/core` tier's own gzip size grew ~16%** (10,414 → 12,107 bytes), confirmed via git history of `bench/results/bundle-size.json` and independently reproduced by building both the pre-split and current commits in a worktree and comparing `packages/core/dist/index.js` directly (35,335 → 43,086 bytes raw, +414 source lines across the split files). Root cause understood in general terms (the mutation-invariant two-phase conversions replaced concise reassignment with more explicit code; the hook-composition pattern defines each hook twice — a no-op default plus a real override in a separate file) but never quantified or root-caused precisely, and never weighed as a conscious tradeoff.

Since v0.5.0 treats performance as the axiom immediately behind correctness, these costs — and any others hiding in the other 8 core benchmark suites that were never re-checked after the split — need to be found, understood, and fixed (where fixable without compromising correctness) before the release ships, not discovered later by a user.

## Non-goals

- **No re-litigating the mutation invariant or hook-composition design.** Both are load-bearing correctness properties from release-gate item 2, established through 7 spec-review rounds and 3 plan-review rounds. This audit optimizes *within* that design, not around it — a fix that reintroduces reassignment-based state or removes a hook slot to save bytes/cycles is out of scope, no matter how much it would help the numbers.
- **No new benchmark suites.** The 9 existing suites under `bench/suites/core/` are the measurement surface. If a suite doesn't cover something worth checking, that's a finding for a future spec, not scope creep into this one.
- **No speculative fixing.** Nothing gets "optimized" without a real, reproducibly-measured (median-of-3-or-more, not single-run) regression to justify it. Single-run bench comparisons have shown ~15% run-to-run noise on identical code in this repo; a fix without a real measured problem behind it is not in scope.

## Design

### Stage 1 — Measurement

**Method** (established and validated during this spec's own investigation): create a scratch git worktree at `7b383e9d5c8e524f3e0a700c59d5bb275548c27f` (the commit immediately before release-gate item 2's first commit). For each of the 9 suites under `bench/suites/core/`:

1. Temporarily point `bench/vitest.config.ts`'s `@neutro/form-core` alias at the worktree's `packages/core/src/index.ts`.
2. Run `pnpm exec vitest bench suites/core/<suite>.bench.ts --run` three times (minimum — more if the spread between the 3 runs is wide enough to leave the verdict ambiguous, per the noise levels already observed).
3. Restore the alias to point at current `main`'s source, run the same suite 3+ times.
4. Record the median hz (or ms, whichever the suite reports) per `describe`/fixture block, old vs new.
5. Remove the worktree and restore `bench/vitest.config.ts` to its committed state before moving to the next suite (no scratch state left behind between suites — each suite's measurement is independent and reproducible).

**Suites to measure** (all 9 under `bench/suites/core/`): `array-ops.bench.ts`, `array-ops-scale.bench.ts`, `computed-fields.bench.ts`, `dependency-chain.bench.ts`, `dependency-scopes.bench.ts`, `nested-set.bench.ts`, `schema-validate.bench.ts`, `set-get.bench.ts` (already measured once during this spec's investigation — re-measure formally as part of the audit task so it's captured in the findings doc alongside everything else, not left as an ad-hoc side note), `ssr-mount.bench.ts`, `subscriptions.bench.ts`.

**Bundle size**: no re-measurement needed — `bench/results/bundle-size.json`'s git history already gives a clean before/after (10,414 → 12,107 gzip bytes for the full tier; the minimal tier has no "before" since it's new). This stage's job for bundle size is root-cause investigation (see Stage 2), not remeasurement.

**Verdict threshold**: a suite's median delta is classified as a **regression** if new-median is worse than old-median by more than 3%, an **improvement** if better by more than 3%, and **no significant change** if within ±3% (below the smallest consistent delta observed in this spec's own `set-get` investigation, which found a real, consistent ~2-5% effect surviving well below the ~15% single-run noise floor — 3% is a conservative line that won't misclassify noise as a regression but will catch anything at or above the magnitude already confirmed real).

**Output**: `docs/superpowers/specs/2026-07-09-v050-performance-audit-findings.md` — one row per suite/fixture-block: old median, new median, % delta, verdict. This becomes the fix stage's input; nothing in Stage 2 starts until this table exists and is complete.

### Stage 2 — Fix

For every suite/fixture-block classified as a **regression** in Stage 1's findings doc, plus the two already-confirmed issues (`set-get`, bundle-size):

1. **Root-cause investigation** — read the actual relocated code, identify what specifically changed between old and new that plausibly explains the delta. Do not guess; trace it to specific lines, the same way this spec's own bundle-size investigation traced the 16% growth to +414 source lines from the two-phase mutation conversions and the duplicated hook-default/override pattern.
2. **Fix, constrained to the Non-goals above** — the fix must preserve the mutation invariant (no reassignment reintroduced) and the hook-composition pattern (no hook slot removed or collapsed back into a direct cross-cluster call). Within that constraint, apply the least invasive change that measurably helps. Two concrete candidates already identified, to investigate first (not a commitment to implement exactly these — the actual fix depends on Stage 1's findings and Stage 2's root-cause step):
   - `shiftStateIndices`/`rekeyArrayState`/`arraySwap`'s `swapKeys` each hand-roll a near-identical "collect renames/deletes, then delete, then write" two-phase loop (flagged as duplicative in release-gate item 2's Task 2 review, out of scope there). Consolidating into one shared helper may reduce both bundle size and, if the duplication itself has any per-call overhead, runtime cost — but only if doing so doesn't reintroduce the read-after-delete hazard that motivated keeping them separate the first time (each site's exact key set/shape differs slightly; verify carefully before merging).
   - `setFieldValue`'s three ctx-hook touch points (`ctx.isComputedField(path)`, `ctx.hasComputedFields()`, the `ctx.runComputedPass()` branch) — investigate whether checking `ctx.hasComputedFields()` once and branching (skipping the other two hook calls entirely in the far more common "no computed fields configured" case) recovers some of the measured cost, without changing behavior when computed fields *are* configured.
3. **Verification**: the specific bench suite that flagged the regression must be re-run (median-of-3+, worktree-vs-current methodology) and show the new numbers within the ±3% no-significant-change band of the pre-split baseline, or better. The full existing test suite must stay green with zero behavior change (this is a performance-only stage — any fix that changes observable output is a correctness bug, not a valid fix, per this spec's own axiom ordering: correctness first, performance second).
4. **Discipline**: same as the rest of this release cycle — fresh implementer per fix, fresh independent reviewer, the specific benchmark as an explicit acceptance gate (not just "tests pass").

### Bundle-size fix, specifically

Unlike the other regressions (which have a bench suite as a direct acceptance test), the bundle-size fix's acceptance test is re-running `bench/scripts` bundle-size measurement (same script Task 14 of release-gate item 2 wired up) and confirming the full tier's gzip number has measurably decreased from 12,107 bytes, ideally back toward (not necessarily all the way to) the pre-split 10,414-byte baseline — full reversion isn't the bar, since some of the growth is the direct, accepted cost of correctness properties (the mutation invariant, the hook slots) that this spec's Non-goals explicitly forbid unwinding. The bar is: recover what's recoverable (e.g., the array-ops duplication above) without touching what's load-bearing.

## Testing

1. Stage 1 produces a findings doc with zero code changes — no tests needed for this stage itself, but the doc's own numbers must be independently spot-checked by a second pass before Stage 2 starts (re-run at least 2 of the 9 suites' measurements independently, confirm they match the findings doc's own numbers within reasonable variance) — this mirrors the "don't trust a single measurement pass" lesson this spec's own investigation already learned the hard way.
2. Stage 2's fixes are verified against: (a) the specific flagged bench suite's median, back within the ±3% band; (b) the full existing `packages/core/test` suite, zero behavior change; (c) `pnpm lint && pnpm exec tsc --noEmit && pnpm build && pnpm test` (full monorepo), green.
3. A final whole-phase review re-confirms: every regression identified in Stage 1's findings doc was either fixed-and-reverified or explicitly and consciously left as an accepted tradeoff (documented in the findings doc with a stated reason) — nothing silently falls through the cracks between "found" and "shipped."

## Risks

- **Bench noise could produce a false-negative or false-positive verdict for a suite near the ±3% threshold.** Mitigated by the median-of-3-or-more methodology and by widening the sample count for any suite whose 3 runs don't cluster tightly.
- **A fix for one suite could regress another** (e.g., consolidating the array-ops two-phase helper could subtly change `array-ops-scale.bench.ts`'s numbers even if it helps `array-ops.bench.ts`). The fix-stage verification step must re-run every suite touched by a given fix, not just the one it targeted.
- **The bundle-size fix has a real floor** — some of the 16% growth is the accepted, load-bearing cost of item 2's design. Stage 2 must not chase full reversion at the expense of the Non-goals; a smaller, honestly-reported recovery is a valid outcome.

## Open questions for the implementation plan

- Exact ordering of the 9 measurement runs — sequential is safest (avoids resource contention skewing numbers) but slower; the plan should decide based on how long a full sequential pass takes once Stage 1 starts.
- Whether the array-ops two-phase-helper consolidation (if pursued) is one task or three (per function) — decide once Stage 1's findings are in and the actual shared-shape is confirmed against all three call sites.
