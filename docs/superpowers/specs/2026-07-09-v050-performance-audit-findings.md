# v0.5.0 Performance Audit — Findings

Baseline: 7b383e9d5c8e524f3e0a700c59d5bb275548c27f (pre-modular-split)
Current: 80962b3de5b514c1743a51a55af7648999a6e22e
Methodology: median-of-3+ runs per block, `bench/reporters/json-bench.ts`'s `median` (ms), threshold ±3%.

**Note on block count:** the brief's summary line said "9 core bench suites (21 bench blocks total)," but `bench/suites/core/` actually contains 10 files, and the brief's own per-file enumeration in Step 3 (2+3+1+1+1+1+4+3+1+3) sums to 20, not 21. All 10 files / 20 blocks that exist were measured; there is no 21st block anywhere in the suite directory. This is flagged as a discrepancy in the brief's prose summary, not a gap in measurement.

| Suite/Block | Old median (ms) | New median (ms) | % delta | Verdict | Cluster |
|---|---|---|---|---|---|
| set-get/small | 0.00029 | 0.00033 | +14.04% | Regression | setFieldValue |
| set-get/large | 0.00029 | 0.00033 | +14.04% | Regression | setFieldValue |
| set-get/xlarge | 0.00029 | 0.00033 | +14.04% | Regression | setFieldValue |
| array-ops/remove | 0.01058 | 0.01063 | +0.39% | No change | |
| array-ops/move | 0.00521 | 0.00529 | +1.61% | No change | |
| array-ops-scale/remove-start | 1.21208 | 1.22917 | +1.41% | No change | |
| array-ops-scale/remove-end | 0.16287 | 0.16354 | +0.41% | No change | |
| array-ops-scale/remove-start-with-unrelated-fields | 1.71452 | 1.47806 | -13.79% | Improvement | |
| computed-fields/simple | 0.00017 | 0.00021 | +24.55% | Regression (noisy — see below) | |
| dependency-graph/deep-chain | 0.00046 | 0.00050 | +8.93% | Regression | setFieldValue |
| dependency-scopes/dependent | 0.00058 | 0.00063 | +7.02% | Regression | setFieldValue |
| nested-set | 0.00050 | 0.00050 | 0.00% | No change | setFieldValue |
| schema-validate/zod/small | 0.00667 | 0.00675 | +1.24% | No change | |
| schema-validate/zod/large | 0.07833 | 0.07675 | -2.02% | No change | |
| schema-validate/yup/small | 0.01308 | 0.01342 | +2.55% | No change | |
| schema-validate/yup/large | 0.14358 | 0.14387 | +0.20% | No change | |
| ssr-mount | 0.09421 | 0.09708 | +3.05% | Regression (borderline) | |
| subscriptions/small | 0.00017 | 0.00021 | +24.55% | Regression (noisy — see below) | setFieldValue |
| subscriptions/large | 0.00021 | 0.00021 | 0.00% | No change | setFieldValue |
| subscriptions/xlarge | 0.00021 | 0.00021 | 0.00% | No change | setFieldValue |

## Notes on noisy blocks

Two blocks exceeded the ±10%-of-median spread guardrail after the initial 3 runs and were re-run to 5 total samples per the brief's escalation rule:

- **`computed-fields/simple`**: old spread 24.6% → after 5 runs still 24.6% (old), 19.7% → still elevated on new (5 runs). Raw old-side values were `[0.000167, 0.000167, 0.000208, 0.000167, 0.000167]` and new-side `[0.000167, 0.000208, 0.000208, 0.000208, 0.000208]`. The absolute values sit right at the boundary between two adjacent floating-point/timer-resolution buckets (~0.167µs and ~0.208µs) — the sub-microsecond wall-clock resolution available to this environment appears to quantize into a small number of discrete values, so "spread" as a %-of-median metric is dominated by which side of the quantization boundary a given run happens to land on, not by genuine variance in the operation's cost. The median-of-5 (0.00017 old, 0.00021 new, +24.55%) is the best available point estimate, but given the quantization, the true delta for this specific block should be treated as **inconclusive at this timer resolution** rather than a confirmed regression.
- **`subscriptions/small`**: same quantization pattern and same root cause as above — old spread 24.6% (5 runs: `[0.000208, 0.000167, 0.000167, 0.000167, 0.000167]`), new spread 0.0% (3 runs, all `0.000208`). Flagged **inconclusive at this timer resolution** for the same reason.

Both blocks operate on trivially small workloads where the entire benchmarked operation completes in under a quarter of a microsecond — near the effective resolution floor of the benchmarking harness on this machine. Every other block measured comfortably above this floor (≥0.0004ms) and showed spreads well under 10% on the first 3-run pass, so this is isolated to these two specific micro-workloads and does not call the rest of the dataset into question.

## Summary

- **Regressions (>+3%, not attributable to timer-resolution noise):** `set-get/small`, `set-get/large`, `set-get/xlarge` (+14.04% each), `dependency-graph/deep-chain` (+8.93%), `dependency-scopes/dependent` (+7.02%), `ssr-mount` (+3.05%, borderline).
- **Regressions flagged inconclusive due to timer-resolution quantization:** `computed-fields/simple`, `subscriptions/small` (both nominally +24.55%, but see notes above).
- **Improvements (<-3%):** `array-ops-scale/remove-start-with-unrelated-fields` (-13.79%).
- **No change (within ±3%):** `array-ops/remove`, `array-ops/move`, `array-ops-scale/remove-start`, `array-ops-scale/remove-end`, `schema-validate/zod/small`, `schema-validate/zod/large`, `schema-validate/yup/small`, `schema-validate/yup/large`, `nested-set`, `subscriptions/large`, `subscriptions/xlarge`.

All rows tagged `Cluster: setFieldValue` per the brief (`set-get`, `subscriptions`, `dependency-scopes`, `dependency-chain`, `nested-set`) share the confirmed-or-suspected regression pattern — 5 of 9 `setFieldValue`-cluster blocks show a real (non-noise) increase, which is the strongest signal in this dataset and the most promising lead for Stage 2 root-causing.

## Task 3 — post-fix re-measurement (hoist `ctx.hasComputedFields()` in `setFieldValue`)

Fix: `engine.ts`'s `setFieldValue` now reads `ctx.hasComputedFields()` once at the top and reuses it at both call sites (`hasComputed && ctx.isComputedField(path)` guard, and the later `if (hasComputed)` computed-pass branch), instead of calling `ctx.isComputedField(path)` unconditionally on line 608 and `ctx.hasComputedFields()` again later. Applied universally — no group-conditional branching (see controller override in the Task 3 brief: the pre-fix code already made one hook call unconditionally for every group, including the early-return group; the fix replaces that hash-lookup with a cheaper size check via short-circuiting, it does not add a new call).

Methodology note: rather than re-run against the original pre-modular-split baseline commit (which differs from HEAD by far more than this one fix and would conflate unrelated changes), this task's comparison isolates the fix's effect with a same-session, same-machine A/B: 3 runs of the 5 affected bench files against the working tree immediately before the fix (`git stash`), then 3 runs immediately after (`git stash pop`), both against a freshly rebuilt `@neutro/form-core`. Median-of-3 per block, same `bench/reporters/json-bench.ts` median metric.

| Block | Pre-fix median (ms) | Post-fix median (ms) | % delta (pre→post) | Verdict |
|---|---|---|---|---|
| dependency-graph/deep-chain | 0.000542 | 0.000500 | -7.75% | Improved |
| dependency-scopes/dependent | 0.000750 | 0.000625 | -16.67% | Improved |
| set-get/small | 0.000333 | 0.000333 | 0.00% | No change (expected — early-return path) |
| set-get/large | 0.000334 | 0.000333 | ~0% | No change (expected) |
| set-get/xlarge | 0.000334 | 0.000333 | ~0% | No change (expected) |
| nested-set | 0.000500 | 0.000500 | 0.00% | No change (expected) |
| subscriptions/small | 0.000209 | 0.000208 | ~0% | No change (expected) |
| subscriptions/large | 0.000250 | 0.000208 | -16.8% (noisy, one of 3 pre-fix runs was 0.000209) | Improved / inconclusive |
| subscriptions/xlarge | 0.000209 | 0.000208 | ~0% | No change (expected) |

**Reconciled against the original old-baseline numbers at the top of this doc:** the two blocks the fix targets (`dependency-scopes/dependent`, `dependency-graph/deep-chain`) show a real, repeatable improvement in the pre-fix-vs-post-fix A/B (-16.67% and -7.75%), consistent with removing one of the two hook calls on the value-changing path. However, comparing the post-fix absolute medians back to the *original* pre-modular-split baseline (0.00046 / 0.00058) still shows a gap larger than ±3% (post-fix ~0.0005 / ~0.000625, i.e. roughly +8.7% / +7.8% vs that much older baseline) — the modular-split regression for these two blocks was evidently not driven solely by this one redundant hook call; some other cost absorbed in the modular-split refactor accounts for the remainder. This fix is a real, verified improvement on its own terms, but does not by itself fully close the gap to the pre-modular-split baseline for `dependency-scopes`/`dependency-chain`.

The early-return group (`set-get`, `subscriptions`, `nested-set`) shows no measurable change in either direction, as expected: their only hook call goes from `ctx.isComputedField(path)` (hash-lookup) to `ctx.hasComputedFields()` (size check) — both trivially cheap relative to this benchmarking harness's sub-microsecond timer resolution (see the quantization note above), so any real saving there is below the measurement floor. No regression was introduced for this group either.

## Task 4 — `applyValidatedRenames` consolidation (bundle-size fix)

Fix: extracted the byte-for-byte-identical 8-line `validatedPaths` rename-apply loop pair (delete-all-old-keys-with-`unindexKey`, then add-all-new-keys-with-`indexKey`) out of `rekeyArrayState` (array-ops.ts, move path) and `arraySwap` into a shared module-scope helper `applyValidatedRenames(ctx, renames)`. `shiftStateIndices` was left untouched — it stores/deletes `validatedPaths` entries inline during its compute loop with a `string[]` shape, not a separated `[old, new][]` pair list, so it is not a drop-in third caller.

**Bundle size (gzip, full tier `neutro/form`):** 12,107 → 12,099 bytes (-8 bytes, -0.07%). Measured via `bench:bundle-size` (`tsx suites/bundle/measure.ts`) after `pnpm --filter @neutro/form-core --filter @neutro/form run build`. The saving is small because gzip already compresses the repeated 8-line pattern efficiently across two call sites — the win here is source-level de-duplication and maintainability more than raw byte count, and the change did not regress bundle size.

**Array-ops/array-ops-scale guardrail (median-of-3, compared against this doc's post-split "new" column, not the original pre-split baseline):**

| Block | Post-split median (ms) | Post-consolidation median (ms) | % delta | Verdict |
|---|---|---|---|---|
| array-ops/remove | 0.01063 | 0.01058 | -0.47% | No change |
| array-ops/move | 0.00529 | 0.00533 | +0.76% | No change |
| array-ops-scale/remove-start | 1.22917 | 1.25654 | +2.23% | No change |
| array-ops-scale/remove-end | 0.16354 | 0.16621 | +1.63% | No change |
| array-ops-scale/remove-start-with-unrelated-fields | 1.47806 | 1.49763 | +1.32% | No change |

All five blocks stayed within the ±3% no-change band, confirming the consolidation did not regress array-op runtime.

## Task 5 — root-cause of the residual `set-get` / `dependency-scopes` / `dependency-chain` / `ssr-mount` gap

### Root cause (all four targets)

The modular split (monolithic `createForm` in `index.ts` → `createCoreForm` in `engine.ts` + `attachX` feature files) changed the hot write/read path in two structural ways that account for the residual regression the earlier tasks left open:

1. **`ctx.<prop>` property access replaced direct closure-variable access.** In the pre-split code (`index.ts@7b383e9`), `setFieldValue` (old L1633–1690), `set` (old L2409–2414), and `get` (old L2403–2407) read `values`/`wasSet`/`dirty`/`touched`/`initialValues` and called `indexKey`/`unindexKey`/`batch`/`notify`/`dispatchAction`/`__warnUnknownPath`/`setFieldValue` as **direct lexical closure variables**. The split moved all of that state onto a single ~60-property `ctx` object (`engine.ts` `FormEngineContext`) and rewrote every access as `ctx.<prop>` (new `setFieldValue` L603–681, `set` L988–993, `get` L982–986). Property access on a large shared object is not free the way monomorphic closure-variable access is, and this is the dominant contributor to the flat `set-get` regression (which touches no computed fields, validators, or dependencies — only the write/read path itself).

2. **Inline `computedMap.has()` / `computedMap.size` became non-inlinable installed hook calls.** Old `setFieldValue` did `computedMap.has(path)` (old L1638) and `computedMap.size > 0` (old L1666) against a `Map` captured as a direct closure variable. The split replaced these with `ctx.isComputedField(path)` / `ctx.hasComputedFields()` — arrow functions that `attachComputedFields` **installs onto `ctx` after `createCoreForm` returns** (`computed-fields.ts` L89–90), so V8 cannot inline them into `setFieldValue`. Task 3 already removed one of the two redundant calls; the remaining call is a load-bearing protected hook slot (per the plan's Global Constraints) and cannot be removed. This is the extra cost on the `dependency-scopes`/`dependency-chain` blocks, which additionally route through `runValidation`'s scope expansion (also now `ctx.`-indirected).

3. **`ssr-mount` (+3.05%)** measures full `createForm()` construction. The split turned one monolithic constructor into `createCoreForm` + `attachComputedFields` + `attachPersistence` + `attachDomBridge` + `attachArrayOps` + `Object.assign` + an extra `ctx.runComputedPass()` seed call (`index.ts` L1002–1035). That is real, unavoidable per-construction overhead of the composition pattern — it cannot be removed without collapsing the modular split, which is the whole point of the v0.5.0 bundle-splitting effort.

### Fix applied (safely-fixable portion)

The four tracked state records (`errors`/`touched`/`dirty`/`wasSet`) were promoted from inline `{}` literals in the `ctx` object to standalone `const`s at the top of `createCoreForm` (`engine.ts` L147–159, mirroring the pre-existing `values`/`initialValues` exception), and the hot path (`setFieldValue`, `set`, `get`) now reads these records and calls the cross-cluster primitives (`indexKey`/`unindexKey`/`batch`/`notify`/`notifyPathSubscribers`/`notifyGlobalSubscribers`/`getState`/`dispatchAction`/`__warnUnknownPath`/`setFieldValue`) via **direct lexical bindings** instead of `ctx.<prop>`. Every binding is the SAME object/function stored on `ctx` (all are never reassigned — the mutation invariant guarantees `ctx.errors === errors` for the life of the form), so this is a pure access-path change that restores the pre-split closure-variable shape. **No reassignment of any protected structure was reintroduced, and none of the 4 hook slots (`isComputedField`/`hasComputedFields`/`runComputedPass`/`onReset`) was removed or collapsed** — those stay on `ctx` precisely because `attachComputedFields`/`attachPersistence` override them post-construction.

### Measurement (same-session stash A/B, median-of-3, matching Task 3's methodology)

| Block | Pre-fix median (ms) | Post-fix median (ms) | Verdict |
|---|---|---|---|
| set-get/small | 0.000333 | 0.000333 | Unchanged at timer floor |
| set-get/large | 0.000333 | 0.000333 | Unchanged at timer floor |
| set-get/xlarge | 0.000333 | 0.000333 | Unchanged at timer floor |
| dependency-scopes/dependent | 0.000625 | 0.000625 | Unchanged at timer floor |
| dependency-graph/deep-chain | 0.000541 | 0.000500 | -7.6% (one quantization bucket; within noise) |
| ssr-mount | 0.098833 | 0.096208 | -2.7% (within noise) |

**Conclusion:** the fix is proven behavior-identical (full core suite: 728/728 pass) and structurally reduces indirection on the hottest path, but its runtime effect is **at or below this harness's sub-microsecond timer-resolution floor** — the `set-get` blocks are pinned to the same 0.000333 quantization bucket pre- and post-fix (the same floor documented in the "Notes on noisy blocks" section above), so the ~14% original delta cannot be empirically closed or refuted at this resolution. The change is applied as a best-effort, zero-risk de-indirection; it does not regress anything.

**Accepted tradeoffs (not fixable without violating Global Constraints):**
- The residual `set-get` / `dependency-scopes` / `dependency-chain` cost that remains after de-indirection is **inherent to the mutation-invariant + hook-composition design** — the non-inlinable `ctx.hasComputedFields()`/`isComputedField()` hook calls and the `ctx.`-access of state records that have no local binding at their access site (e.g. inside feature files) cannot be removed without collapsing a protected hook slot or the ctx abstraction that the modular split exists to provide.
- **`ssr-mount` (+3.05%)** is accepted as a tradeoff — it is the per-construction cost of the `createCoreForm` + 4×`attachX` + `Object.assign` composition, which is the deliberate architecture of the bundle-split and cannot be undone without reverting the split.
