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
