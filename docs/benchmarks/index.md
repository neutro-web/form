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
| vee-validate | <span title="rekey not exposed outside hook context">— N/A</span>[^array-state-integrity-vee-validate] | <span title="no async cancellation API in vanilla usage">— N/A</span>[^async-race-vee-validate] | <span title="no declarative dependency graph">— N/A</span>[^dependency-trigger-vee-validate] |

### Performance

| Library | re-renders/10 | re-renders/100 | async-latency | array-ops | async-cancellation |
|---|---|---|---|---|---|
| felte | — N/A | — N/A | — N/A | — N/A | — N/A |
| formik | — N/A | — N/A | — N/A | — N/A | — N/A |
| react-hook-form | — N/A | — N/A | — N/A | — N/A | — N/A |
| tanstack-form | — N/A | — N/A | — N/A | — N/A | — N/A |
| tanstack-form (React) | — N/A | — N/A | — N/A | — N/A | — N/A |
| vee-validate | — N/A | — N/A | — N/A | — N/A | — N/A |

### Size

| Library | bundle-size |
|---|---|
| felte | <span title="125% faster">✅ Win</span>[^bundle-size-felte] |
| formik | <span title="29% faster">✅ Win</span>[^bundle-size-formik] |
| react-hook-form | <span title="within 10% (4%)">➖ Tied</span>[^bundle-size-react-hook-form] |
| tanstack-form | <span title="71% faster">✅ Win</span>[^bundle-size-tanstack-form] |
| tanstack-form (React) | — N/A |
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

### Mount Cost (time to interactive, Navigation Timing API)

| Library | Time to interactive |
|---|---|
| react-hook-form | 5.6ms |
| formik | 4.1ms |
| tanstack-form (React) | 7.2ms |
| neutro/form (React) | 3.8ms |

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
[^bundle-size-felte]: felte — neutro/form: 10.2 KB vs felte: 22.9 KB (125% fewer/faster)
[^bundle-size-formik]: formik — neutro/form: 10.2 KB vs formik: 13.2 KB (29% fewer/faster)
[^bundle-size-react-hook-form]: react-hook-form — neutro/form: 10.2 KB vs react-hook-form: 9.7 KB
[^bundle-size-tanstack-form]: tanstack-form — neutro/form: 10.2 KB vs tanstack-form: 17.4 KB (71% fewer/faster)
[^bundle-size-vee-validate]: vee-validate — neutro/form: 10.2 KB vs vee-validate: 10.3 KB
