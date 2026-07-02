# Benchmarks

*Last updated 2026-07-02 — neutro/form v0.4.4*

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
| formik | <span title="rekey not exposed outside hook context">— N/A</span>[^array-state-integrity-formik] | <span title="no async cancellation API in vanilla usage">— N/A</span>[^async-race-formik] | <span title="no declarative dependency graph">— N/A</span>[^dependency-trigger-formik] |
| react-hook-form | <span title="rekey not exposed outside hook context">— N/A</span>[^array-state-integrity-react-hook-form] | <span title="no async cancellation API in vanilla usage">— N/A</span>[^async-race-react-hook-form] | <span title="no declarative dependency graph">— N/A</span>[^dependency-trigger-react-hook-form] |
| tanstack-form | <span title="no public rekey API outside React context">— N/A</span>[^array-state-integrity-tanstack-form] | <span title="no async cancellation API in vanilla usage">— N/A</span>[^async-race-tanstack-form] | <span title="no declarative dependency graph">— N/A</span>[^dependency-trigger-tanstack-form] |
| tanstack-form (React) | — N/A | — N/A | — N/A |
| tanstack-form (Svelte) | — N/A | — N/A | — N/A |
| vee-validate | <span title="rekey not exposed outside hook context">— N/A</span>[^array-state-integrity-vee-validate] | <span title="no async cancellation API in vanilla usage">— N/A</span>[^async-race-vee-validate] | <span title="no declarative dependency graph">— N/A</span>[^dependency-trigger-vee-validate] |

### Performance

| Library | re-renders/10 | re-renders/100 | async-latency | array-ops | async-cancellation |
|---|---|---|---|---|---|
| felte | <span title="900% faster">✅ Win</span>[^re-renders-10-felte] | <span title="9900% faster">✅ Win</span>[^re-renders-100-felte] | <span title="debounced 300ms by default">⚖️ Tradeoff</span>[^async-latency-felte] | <span title="124% faster">✅ Win</span>[^array-ops-felte] | <span title="both pass">➖ Tied</span> |
| formik | <span title="1900% faster">✅ Win</span>[^re-renders-10-formik] | <span title="19900% faster">✅ Win</span>[^re-renders-100-formik] | <span title="debounced 300ms by default">⚖️ Tradeoff</span>[^async-latency-formik] | <span title="200% faster">✅ Win</span>[^array-ops-formik] | <span title="no async cancellation API">⚖️ Tradeoff</span>[^async-cancellation-formik] |
| react-hook-form | <span title="within 10% (0%)">➖ Tied</span>[^re-renders-10-react-hook-form] | <span title="within 10% (0%)">➖ Tied</span>[^re-renders-100-react-hook-form] | <span title="debounced 300ms by default">⚖️ Tradeoff</span>[^async-latency-react-hook-form] | <span title="within 10% (0%)">➖ Tied</span>[^array-ops-react-hook-form] | <span title="both pass">➖ Tied</span> |
| tanstack-form | — N/A | — N/A | — N/A | — N/A | — N/A |
| tanstack-form (React) | <span title="within 10% (0%)">➖ Tied</span>[^re-renders-10-tanstack-form-react] | <span title="within 10% (0%)">➖ Tied</span>[^re-renders-100-tanstack-form-react] | <span title="debounced 300ms by default">⚖️ Tradeoff</span>[^async-latency-tanstack-form-react] | <span title="33% faster">✅ Win</span>[^array-ops-tanstack-form-react] | <span title="both pass">➖ Tied</span> |
| tanstack-form (Svelte) | <span title="within 10% (0%)">➖ Tied</span>[^re-renders-10-tanstack-form-svelte] | <span title="within 10% (0%)">➖ Tied</span>[^re-renders-100-tanstack-form-svelte] | <span title="debounced 300ms by default">⚖️ Tradeoff</span>[^async-latency-tanstack-form-svelte] | <span title="TanStack's own Svelte render counter never gets wired up">⚖️ Tradeoff</span>[^array-ops-tanstack-form-svelte] | <span title="both pass">➖ Tied</span> |
| vee-validate | <span title="within 10% (0%)">➖ Tied</span>[^re-renders-10-vee-validate] | <span title="within 10% (0%)">➖ Tied</span>[^re-renders-100-vee-validate] | <span title="debounced 300ms by default">⚖️ Tradeoff</span>[^async-latency-vee-validate] | <span title="within 10% (0%)">➖ Tied</span>[^array-ops-vee-validate] | <span title="both pass">➖ Tied</span> |

### Size

| Library | bundle-size |
|---|---|
| felte | <span title="125% faster">✅ Win</span>[^bundle-size-felte] |
| formik | <span title="29% faster">✅ Win</span>[^bundle-size-formik] |
| react-hook-form | <span title="within 10% (4%)">➖ Tied</span>[^bundle-size-react-hook-form] |
| tanstack-form | <span title="71% faster">✅ Win</span>[^bundle-size-tanstack-form] |
| tanstack-form (React) | — N/A |
| tanstack-form (Svelte) | — N/A |
| vee-validate | <span title="within 10% (2%)">➖ Tied</span>[^bundle-size-vee-validate] |

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

### validation-scope-precision

| Library | Result | Why |
|---|---|---|
| neutro/form | ✅ PASS | set() on a field with 3 declared dependents validates exactly itself + those 3 (4 of 504 total fields), not the whole form — the O(1) precomputed dependency-graph claim, quantified |

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
| tanstack-form (Svelte) | 0[^array-ops-tanstack-form-svelte] |
| felte | 47 |

### DOM Cleanup (connect/disconnect, neutro only)

| Library | Connected after cleanup |
|---|---|
| neutro/form (React) | 0 |
| neutro/form (Vue) | 0 |
| neutro/form (Svelte) | 0 |

### Memory Churn (heap delta across mount/unmount cycles, post-GC)

| Library | Heap delta (post-GC) |
|---|---|
| neutro/form (React) | 591.2 KB |
| react-hook-form | 636.1 KB |

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

### Mount Cost (time to interactive, Navigation Timing API)

| Library | Time to interactive |
|---|---|
| neutro/form (React) | 3.3ms |
| react-hook-form | 4.4ms |
| formik | 4.6ms |
| tanstack-form (React) | 4.8ms |
| neutro/form (Vue) | 3.5ms |
| vee-validate | 5.0ms |
| neutro/form (Svelte) | 3.5ms |
| tanstack-form (Svelte) | 3.9ms |
| felte | 4.2ms |

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
| neutro/form (React) | 302ms[^async-latency-neutro-form-react] | 302ms |
| react-hook-form | 201ms | 202ms |
| formik | 202ms | 202ms |
| tanstack-form (React) | 201ms | 201ms |
| neutro/form (Vue) | 301ms[^async-latency-neutro-form-vue] | 302ms |
| vee-validate | 201ms | 202ms |
| neutro/form (Svelte) | 301ms[^async-latency-neutro-form-svelte] | 309ms |
| tanstack-form (Svelte) | 201ms | 201ms |
| felte | 202ms | 202ms |

### Async Validation Latency — Debounce Floor (neutro only)

| Library | p50 | p99 |
|---|---|---|
| neutro/form (React) [debounce=0] | 201ms | 202ms |
| neutro/form (Vue) [debounce=0] | 201ms | 202ms |
| neutro/form (Svelte) [debounce=0] | 201ms | 202ms |

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

[^array-state-integrity-formik]: formik — state-map rekey on splice not exposed outside hook context
[^async-race-formik]: formik — no async cancellation API in vanilla usage
[^dependency-trigger-formik]: formik — no declarative dependency graph; cross-field validation is manual
[^array-state-integrity-react-hook-form]: react-hook-form — state-map rekey on splice not exposed outside hook context
[^async-race-react-hook-form]: react-hook-form — no async cancellation API in vanilla usage
[^dependency-trigger-react-hook-form]: react-hook-form — no declarative dependency graph; cross-field validation is manual
[^array-state-integrity-tanstack-form]: tanstack-form — no public API to rekey per-field error/touched state on array splice outside React context
[^async-race-tanstack-form]: tanstack-form — no async cancellation API in vanilla usage
[^dependency-trigger-tanstack-form]: tanstack-form — requires per-field validators; no declarative cross-field dependency graph
[^array-state-integrity-vee-validate]: vee-validate — state-map rekey on splice not exposed outside hook context
[^async-race-vee-validate]: vee-validate — no async cancellation API in vanilla usage
[^dependency-trigger-vee-validate]: vee-validate — no declarative dependency graph; cross-field validation is manual
[^re-renders-10-felte]: felte — neutro/form: 20 renders vs felte: 200 renders (900% fewer/faster)
[^re-renders-100-felte]: felte — neutro/form: 20 renders vs felte: 2000 renders (9900% fewer/faster)
[^async-latency-felte]: felte — same debounce policy as React — see debounce=0 column.
[^array-ops-felte]: felte — neutro/form: 21 renders vs felte: 47 renders (124% fewer/faster)
[^re-renders-10-formik]: formik — neutro/form: 20 renders vs formik: 400 renders (1900% fewer/faster)
[^re-renders-100-formik]: formik — neutro/form: 20 renders vs formik: 4000 renders (19900% fewer/faster)
[^async-latency-formik]: formik — neutro debounces async validation 300ms by default (asyncDebounceMs) to avoid firing on every keystroke. See the debounce=0 column for the floor cost.
[^array-ops-formik]: formik — neutro/form: 18 renders vs formik: 54 renders (200% fewer/faster)
[^async-cancellation-formik]: formik — no async cancellation API
[^re-renders-10-react-hook-form]: react-hook-form — neutro/form: 20 renders vs react-hook-form: 20 renders
[^re-renders-100-react-hook-form]: react-hook-form — neutro/form: 20 renders vs react-hook-form: 20 renders
[^async-latency-react-hook-form]: react-hook-form — neutro debounces async validation 300ms by default (asyncDebounceMs) to avoid firing on every keystroke. See the debounce=0 column for the floor cost.
[^array-ops-react-hook-form]: react-hook-form — neutro/form: 18 renders vs react-hook-form: 18 renders
[^re-renders-10-tanstack-form-react]: tanstack-form (React) — neutro/form: 20 renders vs tanstack-form (React): 20 renders
[^re-renders-100-tanstack-form-react]: tanstack-form (React) — neutro/form: 20 renders vs tanstack-form (React): 20 renders
[^async-latency-tanstack-form-react]: tanstack-form (React) — neutro debounces async validation 300ms by default (asyncDebounceMs) to avoid firing on every keystroke. See the debounce=0 column for the floor cost.
[^array-ops-tanstack-form-react]: tanstack-form (React) — neutro/form: 18 renders vs tanstack-form (React): 24 renders (33% fewer/faster)
[^re-renders-10-tanstack-form-svelte]: tanstack-form (Svelte) — neutro/form: 20 renders vs tanstack-form (Svelte): 20 renders
[^re-renders-100-tanstack-form-svelte]: tanstack-form (Svelte) — neutro/form: 20 renders vs tanstack-form (Svelte): 20 renders
[^async-latency-tanstack-form-svelte]: tanstack-form (Svelte) — same debounce policy as React — see debounce=0 column.
[^array-ops-tanstack-form-svelte]: tanstack-form (Svelte) — TanStack's own Svelte bench harness never defines window.__resetArrayRenders, so its render counter (window.__tanstackArrayRenders) stays permanently empty and reports an artificial 0 — not a real absence of render work. Confirmed by direct inspection during this project's own v0.5.0 verification; not a neutro/form architectural gap.
[^re-renders-10-vee-validate]: vee-validate — neutro/form: 20 renders vs vee-validate: 20 renders
[^re-renders-100-vee-validate]: vee-validate — neutro/form: 20 renders vs vee-validate: 20 renders
[^async-latency-vee-validate]: vee-validate — same debounce policy as React — see debounce=0 column.
[^array-ops-vee-validate]: vee-validate — neutro/form: 18 renders vs vee-validate: 18 renders
[^bundle-size-felte]: felte — neutro/form: 10.2 KB vs felte: 22.9 KB (125% fewer/faster)
[^bundle-size-formik]: formik — neutro/form: 10.2 KB vs formik: 13.2 KB (29% fewer/faster)
[^bundle-size-react-hook-form]: react-hook-form — neutro/form: 10.2 KB vs react-hook-form: 9.7 KB
[^bundle-size-tanstack-form]: tanstack-form — neutro/form: 10.2 KB vs tanstack-form: 17.4 KB (71% fewer/faster)
[^bundle-size-vee-validate]: vee-validate — neutro/form: 10.2 KB vs vee-validate: 10.3 KB
[^async-latency-neutro-form-react]: neutro/form (React) — neutro debounces async validation 300ms by default (asyncDebounceMs) to avoid firing on every keystroke. See the debounce=0 column for the floor cost.
[^async-latency-neutro-form-vue]: neutro/form (Vue) — same debounce policy as React — see debounce=0 column.
[^async-latency-neutro-form-svelte]: neutro/form (Svelte) — same debounce policy as React — see debounce=0 column.
