# Benchmarks

> Measured on: GitHub Actions ubuntu-latest, Node v18.20.8, Chromium (Playwright)
> Last updated: 2026-07-01 | neutro/form vunknown

## Methodology

Three dimensions: **correctness** (PASS/FAIL), **browser performance** (Playwright Chromium), and **bundle size** (esbuild + gzip).
Badges are always relative to neutro/form: ✅ Win (neutro beats this library by >10%), ➖ Tied (within 10%), ❌ Behind (neutro trails by >10%, no documented reason), ⚖️ Tradeoff (either neutro trails by >10% due to a documented design choice, or neutro passes a correctness/capability check that this library architecturally cannot — the library's failure has a documented reason, so a harsh "neutro wins" framing is softened to Tradeoff instead — see footnotes), — N/A (surface doesn't apply to this library).

## Scorecard

| Library | array-state-integrity | async-race | dependency-trigger | re-renders/10 | re-renders/100 | async-latency | array-ops | async-cancellation | bundle-size |
|---|---|---|---|---|---|---|---|---|---|
| felte | — N/A | — N/A | — N/A | ✅ Win | ✅ Win | ❌ Behind | ✅ Win | ➖ Tied | ✅ Win |
| formik | — N/A | — N/A | — N/A | ✅ Win | ✅ Win | ❌ Behind | ✅ Win | ⚖️ Tradeoff | ✅ Win |
| react-hook-form | — N/A | — N/A | — N/A | ➖ Tied | ➖ Tied | ❌ Behind | ➖ Tied | ➖ Tied | ➖ Tied |
| tanstack-form | — N/A | — N/A | — N/A | — N/A | — N/A | — N/A | — N/A | — N/A | ❌ Behind |
| tanstack-form (React) | — N/A | — N/A | — N/A | ➖ Tied | ➖ Tied | ❌ Behind | ✅ Win | ➖ Tied | — N/A |
| tanstack-form (Svelte) | — N/A | — N/A | — N/A | ➖ Tied | ➖ Tied | ❌ Behind | ❌ Behind | ➖ Tied | — N/A |
| vee-validate | — N/A | — N/A | — N/A | ➖ Tied | ➖ Tied | ❌ Behind | ➖ Tied | ➖ Tied | ➖ Tied |

## Correctness

### array-state-integrity

| Library | Result |
|---|---|
| neutro/form | ✅ PASS |
| tanstack-form | — N/A[^array-state-integrity-tanstack-form] |
| react-hook-form | — N/A[^array-state-integrity-react-hook-form] |
| formik | — N/A[^array-state-integrity-formik] |
| vee-validate | — N/A[^array-state-integrity-vee-validate] |

### async-race

| Library | Result |
|---|---|
| neutro/form | ✅ PASS |
| tanstack-form | — N/A[^async-race-tanstack-form] |
| react-hook-form | — N/A[^async-race-react-hook-form] |
| formik | — N/A[^async-race-formik] |
| vee-validate | — N/A[^async-race-vee-validate] |

### dependency-trigger

| Library | Result |
|---|---|
| neutro/form | ✅ PASS |
| tanstack-form | — N/A[^dependency-trigger-tanstack-form] |
| react-hook-form | — N/A[^dependency-trigger-react-hook-form] |
| formik | — N/A[^dependency-trigger-formik] |
| vee-validate | — N/A[^dependency-trigger-vee-validate] |

## Browser (Chromium / Playwright, production build, no StrictMode)

### Array Operations (remove + move, render count)

_Note: render counts are not directly comparable across all libraries on this surface — some libraries (e.g. TanStack Form) isolate counters per array index, while others (e.g. neutro/form, Felte) increment counters for every item in the array on any mutation. A low count does not necessarily indicate less DOM work._

| Library | Renders |
|---|---|
| neutro/form (React) | 18 |
| react-hook-form | 18 |
| formik | 54 |
| tanstack-form (React) | 24 |
| neutro/form (Vue) | 18 |
| vee-validate | 18 |
| neutro/form (Svelte) | 28 |
| tanstack-form (Svelte) | 0 |
| felte | 47 |

### DOM Cleanup (connect/disconnect, neutro only)

| Library | Connected after cleanup |
|---|---|
| neutro/form (React) | 0 |
| neutro/form (Vue) | 0 |
| neutro/form (Svelte) | 0 |

### Re-renders per 20-keystroke sequence (10-field form)

| Library | Renders |
|---|---|
| neutro/form (React) | 20 |
| react-hook-form | 20 |
| formik | 400 |
| tanstack-form (React) | 20 |
| neutro/form (Vue) | 20 |
| vee-validate | 20 |
| neutro/form (Svelte) | 20 |
| tanstack-form (Svelte) | 20 |
| felte | 200 |

### Async Cancellation (stale-result race)

| Library | Cancellation |
|---|---|
| neutro/form (React) | ✅ |
| react-hook-form | ✅ |
| formik | ❌[^async-cancellation-formik] |
| tanstack-form (React) | ✅ |
| neutro/form (Vue) | ✅ |
| vee-validate | ✅ |
| neutro/form (Svelte) | ✅ |
| tanstack-form (Svelte) | ✅ |
| felte | ✅ |

### Re-renders per 20-keystroke sequence (100-field form)

| Library | Renders |
|---|---|
| neutro/form (React) | 20 |
| react-hook-form | 20 |
| formik | 4000 |
| tanstack-form (React) | 20 |
| neutro/form (Vue) | 20 |
| vee-validate | 20 |
| neutro/form (Svelte) | 20 |
| tanstack-form (Svelte) | 20 |
| felte | 2000 |

### Async Validation Latency

| Library | p50 | p99 |
|---|---|---|
| neutro/form (React) | 302ms[^async-latency-neutro/form (React)] | 303ms |
| react-hook-form | 203ms | 203ms |
| formik | 202ms | 203ms |
| tanstack-form (React) | 203ms | 203ms |
| neutro/form (Vue) | 302ms[^async-latency-neutro/form (Vue)] | 303ms |
| vee-validate | 202ms | 203ms |
| neutro/form (Svelte) | 303ms[^async-latency-neutro/form (Svelte)] | 303ms |
| tanstack-form (Svelte) | 201ms | 202ms |
| felte | 202ms | 203ms |

### Async Validation Latency — Debounce Floor (neutro only)

| Library | p50 | p99 |
|---|---|---|
| neutro/form (React) [debounce=0] | 203ms | 203ms |
| neutro/form (Vue) [debounce=0] | 203ms | 203ms |
| neutro/form (Svelte) [debounce=0] | 202ms | 203ms |

## Bundle Size

| Library | Gzip size |
|---|---|
| neutro/form | 10.0 KB |
| react-hook-form | 9.7 KB |
| formik | 13.2 KB |
| tanstack-form | 6.3 KB |
| vee-validate | 10.3 KB |
| felte | 22.9 KB |

## Architecture Notes

**DOM cleanup** (`dom-cleanup` row above, neutro only): neutro/form's `connect`/`disconnect` lifecycle registers a `WeakRef` per connected field in an internal registry, pruned by a `MutationObserver` watching for node removal. The "Connected after cleanup" number confirms this registry returns to 0 after mount/unmount churn — competitor libraries have no equivalent connect/disconnect API to compare against, so this section has no comparison table.

---

[^array-state-integrity-tanstack-form]: tanstack-form — no public API to rekey per-field error/touched state on array splice outside React context
[^array-state-integrity-react-hook-form]: react-hook-form — state-map rekey on splice not exposed outside hook context
[^array-state-integrity-formik]: formik — state-map rekey on splice not exposed outside hook context
[^array-state-integrity-vee-validate]: vee-validate — state-map rekey on splice not exposed outside hook context
[^async-race-tanstack-form]: tanstack-form — no async cancellation API in vanilla usage
[^async-race-react-hook-form]: react-hook-form — no async cancellation API in vanilla usage
[^async-race-formik]: formik — no async cancellation API in vanilla usage
[^async-race-vee-validate]: vee-validate — no async cancellation API in vanilla usage
[^dependency-trigger-tanstack-form]: tanstack-form — requires per-field validators; no declarative cross-field dependency graph
[^dependency-trigger-react-hook-form]: react-hook-form — no declarative dependency graph; cross-field validation is manual
[^dependency-trigger-formik]: formik — no declarative dependency graph; cross-field validation is manual
[^dependency-trigger-vee-validate]: vee-validate — no declarative dependency graph; cross-field validation is manual
[^async-cancellation-formik]: formik — no async cancellation API
[^async-latency-neutro/form (React)]: neutro/form (React) — neutro debounces async validation 300ms by default (asyncDebounceMs) to avoid firing on every keystroke. See the debounce=0 column for the floor cost.
[^async-latency-neutro/form (Vue)]: neutro/form (Vue) — same debounce policy as React — see debounce=0 column.
[^async-latency-neutro/form (Svelte)]: neutro/form (Svelte) — same debounce policy as React — see debounce=0 column.
