# Benchmark: Memory Retention & DOM Cleanup Comparison

**Date:** 2026-07-02
**Status:** Draft — pending user review
**Scope:** `bench/suites/browser/`, `bench/apps/*/src/*`, `bench/types/schema.ts`

---

## Problem

`dom-cleanup` is currently a **neutro-only** surface (per `docs/benchmarks/index.md`'s Architecture Notes: "competitor libraries have no equivalent connect/disconnect API to compare against, so this section has no comparison table"). That's true for the *specific* `connect()`/`disconnect()` API — but it sidesteps the actual question a reader cares about: does mounting and unmounting form fields repeatedly leak memory, in *any* of these libraries, not just whether neutro's specific WeakRef-based registry returns to zero? Every library has *some* subscription/registration mechanism (RHF's `register()`, Vue's reactive refs, Svelte's stores) that could, in principle, retain references to unmounted DOM nodes or stale closures. Nothing currently tests any of them for this.

## Design

### Reframe the surface: not "does neutro clean up" but "does memory grow across mount/unmount churn," measured identically for every library

Use the Chrome DevTools Protocol's heap-size sampling (Playwright exposes this via `page.metrics()` for `JSHeapUsedSize`, or a manual `performance.memory` read where available) rather than each library's own internal bookkeeping — this is the one way to compare libraries that don't share a comparable internal API, and it's a fairer test anyway (a library could report "0 leaked" by its own internal counter while still retaining memory elsewhere).

```ts
// bench/suites/browser/memory-churn.spec.ts (shape)
// For each library: navigate to a mount/unmount-churn page (reuse the existing
// dom-cleanup route's churn pattern - mount 50 fields, unmount, repeat 10x - already
// built for neutro's own dom-cleanup surface), then:
// 1. Force GC if the browser exposes it (Chromium with --js-flags=--expose-gc, already
//    controllable via Playwright's launch args)
// 2. Read page.metrics().JSHeapUsedSize before churn and after churn+GC
// 3. Report the delta
```

The existing `dom-cleanup` bench-app churn pattern (mount 50 fields → unmount → repeat 10× — see `bench/apps/react/src/App.tsx`'s `CleanupPage`) is already the right shape for this; this spec reuses that page structure but adds equivalent churn pages for RHF/Formik/vee-validate/etc. (currently `dom-cleanup` has no competitor routes at all — this spec is what builds them) and switches the measurement from "neutro's own connected-count" to "browser-reported heap size," so the same churn page serves double duty: neutro's existing exact-count assertion stays as a correctness check, and heap-size becomes the new comparative metric layered on top.

### Schema

`BrowserResult` needs a new optional field: `heapDeltaBytes?: number`. Additive, follows the existing pattern (`renderCount`, `cancellationPass`, `connectedCountAfterCleanup` are all surface-specific optional fields on the same shared type).

## Expected outcome / hypothesis

This is the spec most likely to require honest annotation rather than a clean win. Heap measurements via Playwright/CDP are inherently noisier than render counts or ops/sec (GC timing is non-deterministic even when forced, and different frameworks have different baseline retained memory for reasons unrelated to the form library — React's Fiber tree bookkeeping alone dwarfs what any form library retains). Treat this surface's numbers as **directional, not headline** — report a "grows / stable / shrinks after GC" categorical result per library rather than a precise byte count competing head-to-head, and use the `Why` column pattern (like correctness surfaces) to explain each library's actual behavior rather than forcing a numeric Win/Behind badge onto inherently noisy data. If neutro's WeakRef-based registry genuinely keeps heap flat while a competitor's doesn't, that's a real, meaningful, honestly-earned differentiator worth a Win badge; if the noise floor makes it indistinguishable, say so plainly rather than manufacturing a false precision.

## Verification

Requires Playwright launched with `--js-flags=--expose-gc` (or equivalent) for forced-GC support — confirm this is compatible with the existing `playwright.config.ts` setup and CI environment before committing to this measurement approach; if forced GC isn't reliably available in CI, fall back to "heap size after N churns without GC, repeated 5× for variance" as a noisier but always-available substitute, and say so explicitly in the methodology.

## Out of Scope

- Node-level memory profiling (heap snapshots, retained-size analysis via `--inspect`) — that's a deep, one-off investigation tool for finding a *specific* leak once one is suspected, not a repeatable CI benchmark surface. If this spec's browser-level measurement finds something suspicious, a Node-level deep-dive becomes its own follow-up task, not part of this benchmark suite.
- Non-DOM memory (e.g. validator closures, computed-field caches) — this spec is specifically about the mount/unmount DOM-churn scenario the existing `dom-cleanup` surface already targets; a broader "does neutro leak memory anywhere" audit is out of scope for a competitive benchmark spec.
