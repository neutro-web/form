# Benchmark: Mount / SSR Hydration Cost

**Date:** 2026-07-02
**Status:** Draft — pending user review
**Scope:** `bench/suites/browser/`, `bench/apps/*/src/*` (new routes), `bench/suites/core/` (a Node-only mount-cost surface)

---

## Problem

`docs/community.md`'s SSR FAQ claims neutro/form is SSR-safe ("createForm is a closure with no module-level state... instantiate it in your component's setup code as you normally would"), and the DOM bridge design (`connect()`, lazy `MutationObserver`) is built for exactly this kind of mount/unmount churn — but nothing benchmarks either claim. Every current browser surface measures *interaction* cost (keystrokes, array ops) on an already-mounted form. Nothing measures the cost of getting to that mounted state in the first place, which matters for real-world metrics like Time to Interactive.

## Design

### Two distinct measurements — keep them separate, they test different things

**1. Cold mount cost (all frameworks, browser surface).** Time from navigating to a page to the form being fully interactive (all fields rendered, first input focusable and responsive). New Playwright surface `mount-cost`, added to `bench/suites/browser/`:

```ts
// bench/suites/browser/mount-cost.spec.ts (shape, not full code — this is a spec not a plan)
// For each library/framework combo: navigate, wait for the form's root data-testid,
// measure performance.now() delta from navigation start using the Navigation Timing API
// (page.evaluate(() => performance.timing... or the newer PerformanceNavigationTiming),
// not a manual timer - avoids Playwright-side scheduling noise polluting the number.
```

Reuse the existing `large` (100-field) fixture's bench-app routes if they exist, or add a dedicated `/mount` route per app rendering a 100-field form fresh (matching `set-get/large`'s size, for consistency across specs). Each library's existing bench-app section already exists for other surfaces (`re-renders`, `array-ops`) — this reuses the same mounted components, just measures time-to-first-paint-interactive instead of post-mount interaction.

**2. SSR hydration cost (Node-only, core surface, neutro-specific claim verification).** This isn't really a cross-library race — most of these libraries (RHF, Formik, TanStack, vee-validate) are equally SSR-agnostic (they're all just React/Vue hooks with no module-level state either, generally). The interesting question is narrower: **does neutro/form's specific design (closure factory, DOM bridge with WeakRef registry) have any SSR-specific gotcha or cost** that the community-doc claim glosses over? A Node-based benchmark:

```ts
// bench/suites/core/ssr-mount.bench.ts
// Simulate the SSR pattern: createForm() with no `document`/`window` (Node has neither by
// default - this is the actual SSR environment, not jsdom), confirm zero errors, then
// measure createForm() + initial getPayload()/getState() cost with a 100-field fixture.
```

This measures: does `createForm` do any accidental `window`/`document` access at init time that would throw or silently no-op in a real Node SSR context (Next.js `getServerSideProps`, etc.)? And what's the raw cost of instantiation itself (relevant for high-traffic SSR endpoints creating a fresh form instance per request).

### Schema

No changes — `mount-cost` fits the existing `BrowserResult` shape (add a `mountMs` field, or reuse `p50Ms`/`p99Ms` naming convention from `async-latency` for consistency: `mountMs` as a new optional field, following the pattern of `renderCount`/`cancellationPass` being surface-specific optional fields already established in `bench/types/schema.ts`).

## Expected outcome / hypothesis

Mount cost across libraries is likely to be dominated by framework rendering cost (React/Vue/Svelte's own mount overhead for 100 DOM nodes), not form-library overhead — so this surface likely shows near-parity, similar to `re-renders`. Its value isn't "expect to win," it's **closing a gap in coverage**: today there's zero data backing the SSR-safety and fast-mount claims neutro's docs already make. If the SSR Node-only surface reveals any accidental `window`/`document` access, that's a real, actionable bug find, not just a benchmark number — worth treating this spec's SSR half as correctness-adjacent, not purely performance-adjacent.

## Verification

Mount-cost surface via `bench:browser`; SSR surface via `bench:core`, run in a Node environment with no jsdom/happy-dom global shims active (must confirm the bench harness's Node test runner doesn't already polyfill `window`/`document` globally, which would silently invalidate this exact test — check `vitest.config.ts`'s `environment` setting for the `suites/core` project specifically before implementing).

## Out of Scope

- Full Next.js/Nuxt/SvelteKit integration test (the SSR claim is about the core engine being safe to instantiate server-side, not a full framework-integration test suite — that's a much larger, different kind of testing effort).
- Hydration mismatch detection (React/Vue hydration warnings) — relevant to framework-level SSR correctness, not to neutro/form's own behavior.
