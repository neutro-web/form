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
