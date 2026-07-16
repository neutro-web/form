# React Adapter Re-render Overhead Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the gap between neutro/form's React adapter demo showing 2x the re-renders of the Vue/Svelte demos for an identical keystroke sequence, by fixing the actual cause (confirmed during plan-writing, see Technical Note below), and leave permanent component-level test coverage behind for both the React and Vue adapter packages, which currently have none.

**Architecture:** Add real DOM-mounted component testing to `packages/adapters/react` and `packages/adapters/vue` (both currently lack it). Use that infrastructure to build a permanent regression test proving the confirmed root cause (the bench demo hand-rolls `useSyncExternalStore` with unstable callback identities instead of using the adapter's own `useFormPath` hook). Fix the demo, re-verify in the real browser bench, and regenerate the published comparison page with the corrected number and an accurate explanation.

**Tech Stack:** TypeScript, Vitest + `jsdom` (already root-level), `@testing-library/react`, `@vue/test-utils`, Playwright (existing bench infra).

## Global Constraints

- `packages/adapters/react/` is the fix target if root-cause finds a real adapter-level inefficiency — but the Technical Note below already establishes the real fix lands in `bench/apps/react/`, not the adapter itself (the adapter was never broken). No `packages/adapters/react/src/index.ts` code change is expected by this plan.
- `packages/adapters/vue/` and `packages/adapters/svelte/` get no code fix — Vue's new test infrastructure exists only as a reference-baseline contrast tool and to close its own pre-existing test-coverage gap.
- No changes to `packages/core/` — the root cause is confirmed adapter/demo-level, not core-engine-level (see Technical Note).
- `bench/apps/react/src/SchemaValidateNeutro.tsx` is in scope for exactly one change: switching `Field`'s hand-rolled `useSyncExternalStore` to the adapter's `useFormPath` hook. No other `bench/apps/*` file changes.
- No changes to Solid or Angular adapters — no signal exists for either.
- Before any Playwright re-run against the bench apps, kill any process bound to ports 4173-4175 from a prior local run (`bench/playwright.config.ts` sets `reuseExistingServer: !process.env.CI`, which silently serves a stale build otherwise).
- Regenerate `docs/benchmarks/index.md` only for this item's actual scope: the `neutro/form (React)` number in the "Schema Validation — Re-renders per 20-keystroke sequence (Zod, 10-field form)" table. **Round-1-review correction:** the "reflecting each adapter's own subscription granularity" framing this constraint originally referenced as needing correction does not actually appear anywhere in the published `docs/benchmarks/index.md` (that table has no explanatory prose at all, only a Formik footnote) or in `bench/annotations.ts`/`bench/scripts/generate-page.ts` — it was a paraphrase in the `project_v050_release_gate` memory's summary of item 3, not repo-published text. Task 4 Step 1's search is still worth doing (in case a future regeneration adds such text, or it exists somewhere this correction missed), but do not treat finding nothing there as a failure — there is likely nothing to correct beyond the number itself.
- Per `CLAUDE.md`'s pre-push checklist, the full local pipeline (`pnpm lint && pnpm exec tsc --noEmit && pnpm build && pnpm test`) must pass before this work is considered done.
- Do not manually edit `CHANGELOG.md`.
- Work in place on local `main` (no worktree), matching this session's established pattern. Do not push to origin.

## Technical Note for the Implementer (read before Task 1)

The spec (`docs/superpowers/specs/2026-07-16-react-vue-rerender-granularity-design.md`) lists four hypotheses (0-3) for Phase 2 to test, in priority order, with hypothesis 0 (non-memoized `useSyncExternalStore` callback identity) flagged as the best-evidenced going in. **During plan-writing, hypothesis 0 was tested empirically against the real adapter and confirmed conclusively — the other three hypotheses are ruled out by the same evidence, and this plan does not re-litigate them as separate tasks.**

The test built two variants of a 10-field form, mirroring the real bench demo's actual parent/child structure (a parent with a `subscribeToPath('field0', ...)` subscription for an error banner, rendering 10 child field components):
- **Variant A** — the `field0` child hand-rolls `useSyncExternalStore` exactly like the real demo does: `useSyncExternalStore((cb) => form.subscribeToPath('field0', cb), () => form.get('field0'))`, with fresh inline `subscribe`/`getSnapshot` functions created on every render.
- **Variant B** — the `field0` child uses the adapter's real `useFormPath` hook instead (`packages/adapters/react/src/index.ts:51-60`, which wraps both `subscribe` and `getSnapshot` in `useCallback` for stable identity).

Both variants were mounted with `@testing-library/react`, then `field0`'s value was changed 20 times via `form.set('field0', ...)` inside `act()`, mirroring the real 20-keystroke bench scenario. Observed results (reproduced twice, once with raw `react-dom/client` + `act`, once with `@testing-library/react`'s `render`/`act` — identical both times):

| | `field0` renders | Total renders (all 10 fields) |
|---|---|---|
| Variant A (hand-rolled, matches real demo) | **41** (1 mount + 40 from the 20 `set()` calls — the adapter's own path notification plus the parent's error-banner notification each trigger the unstable-callback re-subscribe) | 50 |
| Variant B (adapter's `useFormPath`) | **21** (1 mount + 20, exactly 1 per `set()` call — the clean baseline) | 30 |

**This single result closes out hypotheses 1, 2, and 3 as unnecessary, not merely lower-priority:**
- **Hypothesis 1 (memoization boundary) and 2 (partial cascade)** are ruled out because the 9 sibling fields rendered **exactly once each** (mount only) in *both* variants — there is no cascade to unmemoized siblings at all, in either the broken or fixed case. The entire effect is confined to `field0` itself.
- **Hypothesis 3 (core-engine double-notification)** is ruled out because both variants use the *identical* `notify()`/`pathSubscribers` mechanism in `packages/core/src/engine.ts` — if `notify()` were double-firing, both variants would show the same inflated count. Only the variant with the unstable callback identity is affected, which pins the cause specifically to how React's `useSyncExternalStore` responds to a `subscribe` function that changes identity every render (a well-known real footgun, independent of anything neutro-specific), not to neutro's own notification logic.

**Practical consequence for this plan's task structure:** there is no multi-hypothesis investigation task. Task 1 builds the permanent regression test encoding this now-confirmed result directly (both variants, asserting the exact counts above). Task 3 is the actual fix — `bench/apps/react/src/SchemaValidateNeutro.tsx`'s `Field` component switches from the hand-rolled pattern to `useFormPath` — which is now known, not merely hypothesized, to close the gap.

---

### Task 1: React adapter test infrastructure + confirmed repro test

**Files:**
- Modify: `packages/adapters/react/package.json` (add devDependencies)
- Create: `packages/adapters/react/test/rerender-repro.test.ts`

**Interfaces:**
- Consumes: `createForm` from `../../core/src/index.js`, `useFormPath` from `../src/index.js` (both pre-existing, unchanged).
- Produces: nothing consumed by a later task in this plan — this is a standalone permanent test file.

- [ ] **Step 1: Add the new devDependencies**

Edit `packages/adapters/react/package.json`'s `devDependencies` block to:

```json
  "devDependencies": {
    "tsup": "^8.0.0",
    "@types/react": "^18.0.0",
    "react": "^19.2.7",
    "react-dom": "^19.2.7",
    "@testing-library/react": "^16.0.0"
  },
```

`react` itself is added explicitly here too (not just `react-dom`) for the same reason Task 2 pins `vue` explicitly rather than relying on implicit workspace hoisting — `react` is currently only a `peerDependency` of this package, resolved today via hoisting from elsewhere in the workspace, which is fragile to depend on for a package's own test suite.

**Round-1-review note on version mismatch:** this pins React 19, while `bench/apps/react/package.json` (the actual demo this item investigates) uses React 18 (`^18.3.1`). The `useSyncExternalStore`-with-unstable-callback-identity mechanism this plan's Technical Note documents is identical across React 18 and 19 (confirmed empirically — the repro under React 19 reproduces the exact same 41/21 split the real React-18 browser demo shows as 40/~20), so this version difference does not affect the plan's conclusions. Using `^18.3.1` here instead (matching the demo exactly) would also work if the implementer prefers stricter version alignment — either is fine, this is not a hard requirement.

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: exits 0, `pnpm-lock.yaml` updates to include `react-dom` and `@testing-library/react` under `packages/adapters/react`.

- [ ] **Step 3: Create the repro test file**

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { render, act } from '@testing-library/react';
import { createForm } from '@neutro/form-core';
import { useFormPath } from '../src/index.js';

const FIELDS = Array.from({ length: 10 }, (_, i) => `field${i}`);

function buildApp(childUsesAdapterHook: boolean) {
  const renders: Record<string, number> = {};
  const form = createForm({ initialValues: Object.fromEntries(FIELDS.map((n) => [n, ''])) });

  function FieldHandRolled({ name }: { name: string }) {
    renders[name] = (renders[name] ?? 0) + 1;
    const value = React.useSyncExternalStore(
      (cb) => (form as any).subscribeToPath(name, cb),
      () => (form as any).get(name)
    );
    return React.createElement('input', {
      'data-testid': name,
      value: value as string,
      onChange: (e: any) => (form as any).set(name, e.target.value),
    });
  }

  function FieldAdapterHook({ name }: { name: string }) {
    renders[name] = (renders[name] ?? 0) + 1;
    const value = useFormPath(form as any, name as any);
    return React.createElement('input', {
      'data-testid': name,
      value: value as string,
      onChange: (e: any) => (form as any).set(name, e.target.value),
    });
  }

  const Field = childUsesAdapterHook ? FieldAdapterHook : FieldHandRolled;

  function Page() {
    // Mirrors the real demo's parent: subscribes to field0 alone, for an error banner.
    const field0Error = React.useSyncExternalStore(
      (cb) => (form as any).subscribeToPath('field0', cb),
      () => (form as any).getState().errors.field0 ?? ''
    );
    return React.createElement(
      'section',
      null,
      FIELDS.map((name) => React.createElement(Field, { key: name, name })),
      React.createElement('div', null, field0Error)
    );
  }

  return { Page, renders, form };
}

describe('React adapter re-render overhead: hand-rolled useSyncExternalStore vs useFormPath', () => {
  it('hand-rolled useSyncExternalStore (unstable subscribe/getSnapshot identity) renders field0 twice per value change', () => {
    const { Page, renders, form } = buildApp(false);
    render(React.createElement(Page));

    for (let i = 0; i < 20; i++) {
      act(() => {
        (form as any).set('field0', `x${i}`);
      });
    }

    // 1 mount render + 40 (2x the 20 set() calls) -- matches the real bench demo's
    // observed 40 total re-renders for this exact scenario.
    expect(renders.field0).toBe(41);
    // Siblings never re-render -- the effect is confined to field0 itself, not a cascade.
    for (let i = 1; i < 10; i++) {
      expect(renders[`field${i}`]).toBe(1);
    }
  });

  it("adapter's useFormPath (stable, useCallback-wrapped subscribe/getSnapshot) renders field0 once per value change", () => {
    const { Page, renders, form } = buildApp(true);
    render(React.createElement(Page));

    for (let i = 0; i < 20; i++) {
      act(() => {
        (form as any).set('field0', `x${i}`);
      });
    }

    // 1 mount render + 20 (exactly 1 per set() call) -- the clean baseline.
    expect(renders.field0).toBe(21);
    for (let i = 1; i < 10; i++) {
      expect(renders[`field${i}`]).toBe(1);
    }
  });
});
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm exec vitest run packages/adapters/react/test/rerender-repro.test.ts`
Expected: 2 passed. This test encodes the already-confirmed result from this plan's Technical Note — it should pass on the first run. If it doesn't (e.g. a different React/`@testing-library/react` version than what was used to derive these numbers produces different counts), STOP and report the actual observed numbers rather than adjusting the assertions to match — that would be a real, worth-investigating discrepancy from what plan-writing found, not a flaky test to patch around.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/react/package.json pnpm-lock.yaml packages/adapters/react/test/rerender-repro.test.ts
git commit -m "test(react-adapter): add component-level test infra + confirmed re-render repro

Adds react-dom and @testing-library/react as devDependencies (the
React adapter package previously had zero tests of any kind) and a
permanent regression test proving the root cause of the browser bench's
observed 2x re-render count for neutro/form (React): the bench demo's
Field component hand-rolls useSyncExternalStore with fresh, unstable
subscribe/getSnapshot functions every render, while the adapter's own
useFormPath hook (already correct) wraps both in useCallback for a
stable identity and does not exhibit the extra renders."
```

---

### Task 2: Vue adapter test infrastructure + baseline confirmation test

**Files:**
- Modify: `packages/adapters/vue/package.json` (add devDependency)
- Create: `packages/adapters/vue/test/rerender-baseline.test.ts`

**Interfaces:**
- Consumes: `createForm` from `@neutro/form-core` (aliased to source via root `vitest.config.ts`, matching the existing `set-errors.test.ts`'s import style), `useVueFormPath` from `../src/index.js`.
- Produces: nothing consumed by a later task in this plan.

This task exists per the spec's Phase 1 (Vue is a reference baseline for contrast, and closes the same pre-existing test-coverage gap this item is already closing for React) — it does not chase a bug, since Vue is already confirmed at the clean baseline (`docs/benchmarks/index.md`'s published `neutro/form (Vue)` number is 20, matching Svelte). This test documents and locks in that already-correct behavior as permanent regression coverage, using a structure matching Vue's real demo (`bench/apps/vue/src/SchemaValidateNeutro.vue` + `NeutroField.vue`): a parent with a **whole-form** `form.subscribe(...)` subscription (not per-field, unlike React's demo), and children using the adapter's real `useVueFormPath` hook.

- [ ] **Step 1: Add the new devDependency**

Edit `packages/adapters/vue/package.json`'s `devDependencies` block to:

```json
  "devDependencies": {
    "tsup": "^8.0.0",
    "@vue/test-utils": "^2.4.0"
  },
```

`vue` itself is not listed as an explicit devDependency here or anywhere in `packages/adapters/vue/package.json` — the pre-existing `set-errors.test.ts` already imports from `vue` successfully without one, via workspace hoisting from another package's `vue` dependency (most likely VitePress's, per the root `docs:dev`/`docs:build` setup). Before writing Step 3's test, run `pnpm why vue` from the repo root to confirm the actual hoisting source, and if the resolution looks fragile (e.g. only satisfied by a devDependency of an unrelated package that could be removed later), add an explicit `"vue": "^3.0.0"` devDependency here too rather than leave it implicit — document which case applies in the commit message.

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: exits 0, `pnpm-lock.yaml` updates to include `@vue/test-utils` (and `vue`, if Step 1 added it) under `packages/adapters/vue`.

- [ ] **Step 3: Create the baseline test file**

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { createForm } from '@neutro/form-core';
import { useVueFormPath } from '../src/index.js';

const FIELDS = Array.from({ length: 10 }, (_, i) => `field${i}`);

describe('Vue adapter re-render baseline: whole-form parent + useVueFormPath children', () => {
  it('field0 re-renders once per value change, siblings never re-render, matching the real demo structure', async () => {
    const renders: Record<string, number> = {};
    const form = createForm({ initialValues: Object.fromEntries(FIELDS.map((n) => [n, ''])) });

    const FieldComponent = defineComponent({
      props: { name: { type: String, required: true } },
      setup(props) {
        const { value } = useVueFormPath(form as any, props.name as any);
        return () => {
          renders[props.name] = (renders[props.name] ?? 0) + 1;
          return h('input', {
            'data-testid': props.name,
            value: value.value as string,
            onInput: (e: Event) => (form as any).set(props.name, (e.target as HTMLInputElement).value),
          });
        };
      },
    });

    const Page = defineComponent({
      setup() {
        // Mirrors the real Vue demo's parent: a whole-form subscription, not per-field.
        const state = ref(form.getState());
        form.subscribe((s: any) => { state.value = s; });
        return () =>
          h('section', [
            ...FIELDS.map((name) => h(FieldComponent, { key: name, name })),
            h('div', state.value.errors.field0 ?? ''),
          ]);
      },
    });

    mount(Page);

    // Vue's scheduler batches synchronous mutations into a single flush -- awaiting
    // nextTick() after each set() is required to observe one render per value change,
    // mirroring the 20 discrete keystrokes the real browser bench measures one at a
    // time (a real DOM keystroke always has a render opportunity between events).
    // Without this, Vue coalesces all 20 into a single post-loop render.
    for (let i = 0; i < 20; i++) {
      (form as any).set('field0', `x${i}`);
      await nextTick();
    }

    expect(renders.field0).toBe(21); // 1 mount + 20, exactly 1 per set() call.
    for (let i = 1; i < 10; i++) {
      expect(renders[`field${i}`]).toBe(1); // Siblings never re-render.
    }
  });
});
```

- [ ] **Step 4: Run the test**

Run: `pnpm exec vitest run packages/adapters/vue/test/rerender-baseline.test.ts`
Expected: 1 passed. Unlike Task 1's test (which encodes an already-confirmed empirical result), this test's exact counts were reasoned from the spec's structural analysis but not independently pre-verified during plan-writing the way Task 1's were. If the actual counts differ, that's a genuinely new, real finding — investigate why (does Vue's `useVueFormPath` or `mount()`/reactivity handling differ from what the demo's real `NeutroField.vue` does in some way this repro doesn't capture?) rather than just adjusting the assertion to whatever number comes out. Report the actual finding either way.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/vue/package.json pnpm-lock.yaml packages/adapters/vue/test/rerender-baseline.test.ts
git commit -m "test(vue-adapter): add component-level test infra + baseline confirmation test

Adds @vue/test-utils as a devDependency (the Vue adapter package
previously only had a bare effectScope() test with no mounted
component tree) and a test confirming Vue's already-correct baseline
behavior (field0 re-renders exactly once per value change, no cascade
to siblings) using the real demo's whole-form-parent + useVueFormPath
structure -- a reference contrast for the React fix in this same item,
and permanent regression coverage Vue's adapter package previously
lacked entirely."
```

---

### Task 3: Fix the React bench demo + re-verify in the real browser bench

**Files:**
- Modify: `bench/apps/react/src/SchemaValidateNeutro.tsx`

**Interfaces:**
- Consumes: `useFormPath` from `@neutro/form-react` (already imported elsewhere in the bench app; this file currently does not import it).
- Produces: nothing consumed by a later task in this plan (Task 4 reads the resulting browser numbers, not any code interface).

- [ ] **Step 1: Read the current file**

Read `bench/apps/react/src/SchemaValidateNeutro.tsx` in full before editing — confirm it still matches the structure described in the spec and this plan's Technical Note (it was last touched during item 3's work; if it has changed since, stop and report the discrepancy rather than editing blind).

- [ ] **Step 2: Replace the hand-rolled `Field` component's subscription with `useFormPath`**

Change:

```tsx
import { useCallback, useSyncExternalStore } from 'react'
import { createForm, zodAdapter } from '@neutro/form-core'
import { zodSmallSchema, FIELDS, initialValues } from './schemaValidateSchema.js'
```

to:

```tsx
import { useCallback, useSyncExternalStore } from 'react'
import { createForm, zodAdapter } from '@neutro/form-core'
import { useFormPath } from '@neutro/form-react'
import { zodSmallSchema, FIELDS, initialValues } from './schemaValidateSchema.js'
```

Change:

```tsx
function Field({ name }: { name: string }) {
  neutroSchemaRenders[name] = (neutroSchemaRenders[name] ?? 0) + 1
  const value = useSyncExternalStore(
    (cb) => form.subscribeToPath(name as any, cb),
    () => form.get(name as any),
  )
  return (
    <input
      data-testid={`neutro-${name}`}
      value={value as string}
      onChange={(e) => form.set(name as any, e.target.value)}
    />
  )
}
```

to:

```tsx
function Field({ name }: { name: string }) {
  neutroSchemaRenders[name] = (neutroSchemaRenders[name] ?? 0) + 1
  const value = useFormPath(form, name as any)
  return (
    <input
      data-testid={`neutro-${name}`}
      value={value as string}
      onChange={(e) => form.set(name as any, e.target.value)}
    />
  )
}
```

`SchemaValidateNeutroPage`'s own `field0Error` subscription (lines 31-35 of the original file) is unchanged — it is the parent's own subscription for the error banner, not the cause (per this plan's Technical Note, the parent's subscription style is not the mechanism; only the child's unstable callback identity was).

- [ ] **Step 3: Rebuild the React bench app**

Run: `pnpm --dir bench run bench:apps:build:react`
Expected: exits 0, `bench/apps/react/dist/` rebuilt.

- [ ] **Step 4: Kill any stale preview server, then re-run the real browser test**

Run: `lsof -ti:4173,4174,4175 | xargs kill 2>/dev/null; true` (the trailing `; true` avoids a non-zero exit if nothing is listening — confirmed safe: BSD `xargs` on macOS is a no-op on empty input, but this makes the intent explicit regardless of platform).

Run: `pnpm --dir bench exec playwright test suites/browser/schema-validate-rerenders.spec.ts`
Expected: all listed combos pass their `limit` assertions (unchanged — the React row's `limit: 70` in `bench/suites/browser/schema-validate-rerenders.spec.ts` already accommodates both the old 40 and an improved lower number). The reporter used by `bench:browser` writes deterministic per-surface results to `bench/results/browser.json` on every run — read the `neutro/form (React)` entry for the `schema-validate-rerenders` surface there for the exact `renderCount` (do not rely on Playwright's hashed test attachments, which are harder to locate deterministically). Confirm it dropped from 40 toward 20 and record the exact new number for Task 4.

- [ ] **Step 5: Commit**

```bash
git add bench/apps/react/src/SchemaValidateNeutro.tsx
git commit -m "fix(bench): use the React adapter's useFormPath hook instead of hand-rolling useSyncExternalStore

The Field component in the schema-validate-rerenders demo built its
own useSyncExternalStore call with fresh, unstable subscribe/
getSnapshot functions on every render, which is exactly the pattern
confirmed (see docs/superpowers/plans/2026-07-16-react-vue-rerender-
granularity.md's Technical Note) to double field0's re-render count
relative to using the adapter's own useFormPath hook, which memoizes
both callbacks via useCallback. The adapter itself was never broken --
this is a demo-only fix."
```

---

### Task 4: Republish the corrected number + full pipeline verification + release-gate memory update

**Files:**
- Modify: `docs/benchmarks/index.md` (regenerated, not hand-edited — see steps)
- Modify: `bench/results/baseline.json` (regenerated, not hand-edited — the only `bench/results/*.json` file that is actually git-tracked and committed; `latest.json`, `core.json`, `correctness.json`, and `browser.json` are all gitignored, regenerated on disk but never committed — do not `git add` them)
- Possibly modify: `bench/annotations.ts` (see Round-1-review correction above — likely nothing to change here, but Step 1 still checks)
- Modify (out-of-repo): `/Users/kofi/.claude/projects/-Users-kofi---agw-form/memory/project_v050_release_gate.md` (Step 6)

**Interfaces:**
- Consumes: the real browser number from Task 3 Step 4.
- Produces: nothing consumed by a later task — this is the final task in this plan.

- [ ] **Step 1: Locate the inaccurate explanatory text**

Search for the "reflecting each adapter's own subscription granularity" phrasing (or whatever text currently explains the `schema-validate-rerenders` numbers) — check `bench/annotations.ts` (`PASS_REASONS`/`ANNOTATIONS`, per `CLAUDE.md`'s description of that file) and `bench/scripts/generate-page.ts` for any hardcoded prose near this surface. If found, update it to accurately reflect this item's real finding: the React number's prior gap was caused by the demo's own hand-rolled subscription pattern, now fixed to use the adapter's `useFormPath` hook — not a difference in "subscription granularity" between the adapters' underlying capabilities (all three already supported equally fine-grained per-field subscriptions).

- [ ] **Step 2: Regenerate the bench pipeline and the docs page**

Run the bench pipeline sub-steps (per the established local-run convention documented in `CLAUDE.md`'s Benchmark Suite section — copy `results/latest.json` → `results/baseline.json` before `bench:generate`): re-run `bench:browser` (only — `bench:apps:build` for Vue/Svelte is not needed, those apps are unchanged by this item and their `dist/` output is already current), then `bench:merge` (reads the existing `core.json`/`correctness.json`/`bundle-size.json` alongside the freshly re-measured `browser.json` — all already present in `bench/results/`, no other sub-step needs re-running), then copy `latest.json` → `baseline.json`, then `bench:generate`. Do **not** substitute `bench:full` for this sequence — `bench:full` runs its own internal `merge → generate` *before* any `latest.json`→`baseline.json` copy, so it would regenerate the page from a stale baseline (per `CLAUDE.md`'s documented `generate-page.ts` gotcha); running `bench:full` and then still doing this task's own `merge → copy → generate` afterward would work but wastes an unnecessary full run of every other bench surface.

Expected: `docs/benchmarks/index.md`'s `neutro/form (React)` row in the "Schema Validation — Re-renders per 20-keystroke sequence (Zod, 10-field form)" table now shows the corrected number from Task 3 Step 4 (not 40).

- [ ] **Step 3: Inspect the diff before staging**

Run: `git diff docs/benchmarks/index.md | head -200` (and more if needed) — the diff will **not** be limited to the re-renders row alone: re-running `bench:browser` re-measures every timing-sensitive browser surface (settle-latency, mount-cost, memory-churn, etc.), and those numbers naturally drift run-to-run even with no code change. Do not expect or require an otherwise-empty diff. What to actually verify: (a) the `neutro/form (React)` re-renders row specifically moved from 40 to the Task 3 Step 4 number, (b) every other row that changed is a plausible small drift in a timing-sensitive number, not a structural change (a section disappearing, a surface count dropping to zero, an unrelated row changing by an order of magnitude) — per this project's established discipline of inspecting a regenerated docs page's diff before trusting it, documented in the `project_v050_release_gate` memory's account of item 4's caught merge bug (which was a structural loss, not ordinary timing drift — that's the failure mode to watch for, not variance itself).

- [ ] **Step 4: Run the full pipeline**

Run: `pnpm lint && pnpm exec tsc --noEmit && pnpm build && pnpm test`
Expected: all four pass. If lint/biome modifies any file, `git add` it before committing.

- [ ] **Step 5: Commit**

Before writing the commit message, fill in the real number the Task 3 Step 4 Playwright run recorded for `neutro/form (React)` — do not commit the placeholder text below verbatim. Also: only include the second paragraph below (about correcting explanatory text) if Step 1 actually found and changed such text in `bench/annotations.ts` or elsewhere — per the Round-1-review correction on Global Constraints, that text most likely does not exist anywhere in the repo, so the expected case is a commit message with only the first paragraph.

```bash
git add docs/benchmarks/index.md bench/results/baseline.json
git commit -m "docs(bench): regenerate schema-validate-rerenders with the corrected React number

neutro/form (React) drops from 40 to <insert the real number Task 3
Step 4 recorded here> after fixing the demo's useSyncExternalStore
usage (see the preceding fix commit)."
```

If Step 1 did find and change explanatory text, add `bench/annotations.ts` to the `git add` and append a second paragraph describing exactly what was corrected there (not the boilerplate below, which describes a change that most likely never happened):

```
Also corrects the explanatory text that previously attributed the gap
to differing subscription granularity across adapters -- all three
adapters already supported equally fine-grained per-field
subscriptions; the gap was the demo's own hand-rolled pattern, not an
adapter capability difference.
```

(Adjust the file list in `git add` to whatever `bench:merge`/`bench:generate` actually touched — inspect `git status` first.)

- [ ] **Step 6: Update the v0.5.0 release-gate memory**

Update `/Users/kofi/.claude/projects/-Users-kofi---agw-form/memory/project_v050_release_gate.md` to mark item 8 RESOLVED, following the same format used for items 1-7: spec link (`docs/superpowers/specs/2026-07-16-react-vue-rerender-granularity-design.md`), plan link (this file), commit range for Tasks 1-4, and the real findings — specifically the confirmed root cause (hand-rolled `useSyncExternalStore` with unstable callback identity in the bench demo, not an adapter defect), the empirical numbers (41/50 vs 21/30 in the isolated repro; the real before/after browser numbers from Task 3), and the two new permanent test files closing a pre-existing gap (neither React's nor Vue's adapter package had component-level tests before this item).

- [ ] **Step 7: Do not push**

Per this session's standing instruction, commit all work locally but do not run `git push` under any circumstances without new, explicit authorization.

## Verification

- Task 1: `pnpm exec vitest run packages/adapters/react/test/rerender-repro.test.ts` — 2 passed.
- Task 2: `pnpm exec vitest run packages/adapters/vue/test/rerender-baseline.test.ts` — 1 passed.
- Task 3: `pnpm --dir bench exec playwright test suites/browser/schema-validate-rerenders.spec.ts` — all combos pass, React's real `renderCount` recorded and dropped from 40.
- Task 4: `docs/benchmarks/index.md` shows the corrected number; full pipeline (`pnpm lint && pnpm exec tsc --noEmit && pnpm build && pnpm test`) green.
