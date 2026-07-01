# Benchmarks

> Measured on: GitHub Actions ubuntu-latest, Node v18.20.8, Chromium (Playwright)
> Last updated: 2026-07-01 | neutro/form v0.4.2

## Methodology

Three dimensions: **correctness** (PASS/FAIL), **browser performance** (Playwright Chromium), and **bundle size** (esbuild + gzip). Badges are always relative to neutro/form:

- ✅ **Win** — neutro beats this library by more than 10%
- ➖ **Tied** — within 10% either way
- ❌ **Behind** — neutro trails by more than 10%, no documented reason
- ⚖️ **Tradeoff** — neutro trails for a documented design reason, *or* neutro passes a check this library architecturally can't (a harsh "neutro wins" is softened to Tradeoff instead) — see footnotes
- — **N/A** — surface doesn't apply to this library

## Scorecard

### Correctness

| Library | array-state-integrity | async-race | dependency-trigger |
|---|---|---|---|
| felte | — N/A | — N/A | — N/A |
| formik | — N/A | — N/A | — N/A |
| react-hook-form | — N/A | — N/A | — N/A |
| tanstack-form (React) | — N/A | — N/A | — N/A |
| tanstack-form (Svelte) | — N/A | — N/A | — N/A |
| vee-validate | — N/A | — N/A | — N/A |

### Performance

| Library | re-renders/10 | re-renders/100 | async-latency | array-ops | async-cancellation |
|---|---|---|---|---|---|
| felte | — N/A | — N/A | ❌ Behind | — N/A | — N/A |
| formik | — N/A | — N/A | ❌ Behind | — N/A | — N/A |
| react-hook-form | — N/A | — N/A | ❌ Behind | — N/A | — N/A |
| tanstack-form (React) | — N/A | — N/A | ❌ Behind | — N/A | — N/A |
| tanstack-form (Svelte) | — N/A | — N/A | ❌ Behind | — N/A | — N/A |
| vee-validate | — N/A | — N/A | ❌ Behind | — N/A | — N/A |

### Size

| Library | bundle-size |
|---|---|
| felte | — N/A |
| formik | — N/A |
| react-hook-form | ✅ Win |
| tanstack-form (React) | — N/A |
| tanstack-form (Svelte) | — N/A |
| vee-validate | — N/A |

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

### re-renders

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

### Async Validation Latency

| Library | p50 | p99 |
|---|---|---|
| neutro/form (React) | 302ms[^async-latency-neutro/form (React)] | 302ms |
| react-hook-form | 202ms | 202ms |
| formik | 202ms | 202ms |
| tanstack-form (React) | 202ms | 202ms |
| neutro/form (Vue) | 301ms[^async-latency-neutro/form (Vue)] | 302ms |
| vee-validate | 202ms | 202ms |
| neutro/form (Svelte) | 302ms[^async-latency-neutro/form (Svelte)] | 302ms |
| tanstack-form (Svelte) | 201ms | 202ms |
| felte | 202ms | 202ms |

## Bundle Size

| Library | Gzip size |
|---|---|
| neutro/form | 1.2 KB |
| react-hook-form | 5.5 KB |

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
[^async-latency-neutro/form (React)]: neutro/form (React) — neutro debounces async validation 300ms by default (asyncDebounceMs) to avoid firing on every keystroke. See the debounce=0 column for the floor cost.
[^async-latency-neutro/form (Vue)]: neutro/form (Vue) — same debounce policy as React — see debounce=0 column.
[^async-latency-neutro/form (Svelte)]: neutro/form (Svelte) — same debounce policy as React — see debounce=0 column.
