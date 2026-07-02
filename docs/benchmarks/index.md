# Benchmarks

*Last updated 2026-07-02 — neutro/form v0.4.3*

## Environment

| | |
|---|---|
| Runner | local (darwin) |
| Node | v18.20.8 |
| Browser | Chromium (Playwright) |

## Competitor Versions

| Library | Version |
|---|---|
| react-hook-form | v7.80.0 |
| formik | v2.4.9 |
| vee-validate | v4.15.1 |
| felte | v1.3.0 |
| tanstack-form (React) | v1.33.0 |
| tanstack-form (Svelte) | v1.33.0 |

Results reflect these exact releases — a later competitor update may change outcomes, so check the version above before drawing conclusions.

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
| tanstack-form | — N/A | — N/A | — N/A |
| tanstack-form (React) | — N/A | — N/A | — N/A |
| tanstack-form (Svelte) | — N/A | — N/A | — N/A |
| vee-validate | — N/A | — N/A | — N/A |

### Performance

| Library | re-renders/10 | re-renders/100 | async-latency | array-ops | async-cancellation |
|---|---|---|---|---|---|
| felte | ✅ Win | ✅ Win | ⚖️ Tradeoff | ✅ Win | ➖ Tied |
| formik | ✅ Win | ✅ Win | ⚖️ Tradeoff | ✅ Win | ⚖️ Tradeoff |
| react-hook-form | ➖ Tied | ➖ Tied | ⚖️ Tradeoff | ➖ Tied | ➖ Tied |
| tanstack-form | — N/A | — N/A | — N/A | — N/A | — N/A |
| tanstack-form (React) | ➖ Tied | ➖ Tied | ⚖️ Tradeoff | ✅ Win | ➖ Tied |
| tanstack-form (Svelte) | ➖ Tied | ➖ Tied | ⚖️ Tradeoff | ❌ Behind | ➖ Tied |
| vee-validate | ➖ Tied | ➖ Tied | ⚖️ Tradeoff | ➖ Tied | ➖ Tied |

### Size

| Library | bundle-size |
|---|---|
| felte | ✅ Win |
| formik | ✅ Win |
| react-hook-form | ➖ Tied |
| tanstack-form | ✅ Win |
| tanstack-form (React) | — N/A |
| tanstack-form (Svelte) | — N/A |
| vee-validate | ➖ Tied |

## Correctness

### array-state-integrity

| Library | Result | Why |
|---|---|---|
| neutro/form | ✅ PASS | errors/touched/dirty state is rekeyed by index on every array splice/move/swap |
| tanstack-form | — N/A | no public API to rekey per-field error/touched state on array splice outside React context |
| react-hook-form | — N/A | state-map rekey on splice not exposed outside hook context |
| formik | — N/A | state-map rekey on splice not exposed outside hook context |
| vee-validate | — N/A | state-map rekey on splice not exposed outside hook context |

### async-race

| Library | Result | Why |
|---|---|---|
| neutro/form | ✅ PASS | each async validation run gets its own AbortController; stale results are discarded by epoch |
| tanstack-form | — N/A | no async cancellation API in vanilla usage |
| react-hook-form | — N/A | no async cancellation API in vanilla usage |
| formik | — N/A | no async cancellation API in vanilla usage |
| vee-validate | — N/A | no async cancellation API in vanilla usage |

### dependency-trigger

| Library | Result | Why |
|---|---|---|
| neutro/form | ✅ PASS | a static dependency graph is precompiled at form init, so dependent fields re-validate automatically |
| tanstack-form | — N/A | requires per-field validators; no declarative cross-field dependency graph |
| react-hook-form | — N/A | no declarative dependency graph; cross-field validation is manual |
| formik | — N/A | no declarative dependency graph; cross-field validation is manual |
| vee-validate | — N/A | no declarative dependency graph; cross-field validation is manual |

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
| neutro/form (Svelte) | 21 |
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
| neutro/form (React) | 301ms[^async-latency-neutro/form (React)] | 302ms |
| react-hook-form | 202ms | 202ms |
| formik | 202ms | 202ms |
| tanstack-form (React) | 201ms | 201ms |
| neutro/form (Vue) | 302ms[^async-latency-neutro/form (Vue)] | 303ms |
| vee-validate | 202ms | 203ms |
| neutro/form (Svelte) | 302ms[^async-latency-neutro/form (Svelte)] | 303ms |
| tanstack-form (Svelte) | 201ms | 202ms |
| felte | 202ms | 203ms |

### Async Validation Latency — Debounce Floor (neutro only)

| Library | p50 | p99 |
|---|---|---|
| neutro/form (React) [debounce=0] | 202ms | 203ms |
| neutro/form (Vue) [debounce=0] | 202ms | 203ms |
| neutro/form (Svelte) [debounce=0] | 202ms | 203ms |

## Bundle Size

| Library | Gzip size |
|---|---|
| neutro/form | 10.2 KB |
| react-hook-form | 9.7 KB |
| formik | 13.2 KB |
| tanstack-form | 17.4 KB |
| vee-validate | 10.3 KB |
| felte | 22.9 KB |

## Architecture Notes

**DOM cleanup** (`dom-cleanup` row above, neutro only): neutro/form's `connect`/`disconnect` lifecycle registers a `WeakRef` per connected field in an internal registry, pruned by a `MutationObserver` watching for node removal. The "Connected after cleanup" number confirms this registry returns to 0 after mount/unmount churn — competitor libraries have no equivalent connect/disconnect API to compare against, so this section has no comparison table.

---

[^async-cancellation-formik]: formik — no async cancellation API
[^async-latency-neutro/form (React)]: neutro/form (React) — neutro debounces async validation 300ms by default (asyncDebounceMs) to avoid firing on every keystroke. See the debounce=0 column for the floor cost.
[^async-latency-neutro/form (Vue)]: neutro/form (Vue) — same debounce policy as React — see debounce=0 column.
[^async-latency-neutro/form (Svelte)]: neutro/form (Svelte) — same debounce policy as React — see debounce=0 column.
