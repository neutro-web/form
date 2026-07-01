# Notification Cascade Correctness Fix

**Date:** 2026-07-01
**Status:** Approved
**Scope:** `packages/core/src/index.ts` (`notifyPathSubscribers`, `set`, `arrayRemove`, `arrayInsert`, `arrayMove`, `arraySwap`, `resetField`), `bench/fixtures/nested.ts` (new), `bench/suites/core/nested-set.bench.ts` (new)

---

## Problem

`notify(mutatedPath)` in `packages/core/src/index.ts` only walks **upward** from the mutated path to ancestor subscribers (`mutatedPath` → parent → ... → `'*'`). It never walks **downward** to subscribers registered at a path *deeper* than the one that changed.

Confirmed empirically against the built engine:

```
form.set('items.0', {v: 'ZZZ'})  with a subscriber at 'items.0.v'  → 0 notifications
form.arrayRemove/arrayInsert/arrayMove/arraySwap                   → same gap for shifted per-item values
```

`reset()` (whole-form reset) is **not** affected — it already works around the gap with its own brute-force call: `notifyPathSubscribers([...pathSubscribers.keys()]...)`, unconditionally notifying every registered path. This is a useful precedent: the codebase already has one place that solves "notify everyone under this mutation," just not generalized.

**Impact:** any consumer using idiomatic per-field subscriptions on a nested/array value (the pattern the docs recommend, e.g. `useFormPath(form, `items.${i}.name`)` in a per-item child component) gets silently stale UI after a parent-level mutation — `set()` on the object, or any array op — unless something else outside the engine happens to force a re-render (as the browser bench harnesses' React/Vue whole-array-subscribing parent components accidentally do).

**No existing test encodes the current behavior as intentional.** Every `subscribeToPath` + mutation test in `packages/core/test/form.test.ts` that asserts "does NOT fire" covers *sibling* paths (`a` vs `b`), never parent/child. This is a fixable gap, not a documented contract.

## Root Cause

```ts
const notifyPathSubscribers = (paths: string[]) => {
  paths.forEach((mutatedPath) => {
    const parts = mutatedPath.split('.');
    const candidatePaths: string[] = ['*'];
    let accum = '';
    for (const part of parts) {
      accum = accum ? `${accum}.${part}` : part;
      candidatePaths.push(accum);   // only ancestors + self
    }
    for (const p of candidatePaths) { /* fire */ }
  });
};
```

`candidatePaths` is built purely by walking the mutated path's own segments — it has no way to discover a subscriber registered at, say, `items.4.v` when the mutation happened at `items` or `items.4`.

## Fix Design

### 1. Descendant-aware `notifyPathSubscribers`, with a dedup pass

Rewrite to collect the full notify-set for the whole flush (not per mutated path in isolation), so every affected subscriber path — ancestor, self, or descendant — fires **exactly once**:

```ts
const notifyPathSubscribers = (paths: string[]) => {
  const toNotify = new Set<string>();
  for (const mutatedPath of paths) {
    toNotify.add('*');
    const parts = mutatedPath.split('.');
    let accum = '';
    for (const part of parts) {
      accum = accum ? `${accum}.${part}` : part;
      toNotify.add(accum);
    }
    const currentVal = getNestedValue(values, mutatedPath);
    if (currentVal !== null && typeof currentVal === 'object') {
      const descendantPrefix = `${mutatedPath}.`;
      for (const registered of pathSubscribers.keys()) {
        if (registered !== '*' && registered.startsWith(descendantPrefix)) {
          toNotify.add(registered);
        }
      }
    }
  }
  for (const p of toNotify) {
    const listeners = pathSubscribers.get(p);
    if (!listeners) continue;
    const val = p === '*' ? deepClone(values) : deepClone(getNestedValue(values, p));
    for (const cb of listeners) {
      try {
        cb(val, { error: errors[p], touched: touched[p], dirty: dirty[p] });
      } catch (err) {
        console.error('[NeutroForm] path subscriber threw:', err);
      }
    }
  }
};
```

Two deliberate guards:

- **Type guard (`typeof currentVal === 'object'`)** — the descendant scan (`pathSubscribers.keys()`, O(total registered paths)) only runs when the mutated value is itself an object or array. Every `set-get`/`subscriptions` benchmark fixture (`bench/fixtures/small.ts`, `large.ts`) uses flat string fields, so this guard means those hot-path benchmarks incur **zero** added cost — the scan never runs for them. Array ops and nested-object `set()` calls (comparatively rare, not per-keystroke) pay the scan cost, which is bounded by total registered subscriber count, not per-mutation frequency.
- **Set-based dedup across the whole flush** — fixes a latent pre-existing risk, not just one this change would introduce: without it, a subscriber reachable via two different mutated paths in the same batch (e.g. `arrayRemove` calling both `notify(shiftedKey)` and `notify(targetPath)` in one `batch()`) would fire twice for one logical mutation once descendant-cascading is added. The `Set` guarantees exactly one fire per unique path per flush.

### 2. Call sites (`set`, `arrayRemove`, `arrayInsert`, `arrayMove`, `arraySwap`, `resetField`) — unchanged in this fix

They already call `notify()`/`notifyPathSubscribers()` at some ancestor-or-equal path for every mutation. The shared helper fix alone makes all of them cascade correctly. No call-site changes needed for correctness.

**Known, accepted side effect:** array ops' existing `notify(targetPath)` (the whole array root) will now cascade to *every* item's descendant subscribers, not just the ones that actually shifted — e.g. `arrayRemove` at index 5 of a 10-item array will re-fire subscribers for items 0-4 too, even though their values didn't move. This is correct-but-imprecise, and is explicitly **out of scope for this fix** — tightening array ops to notify only the exact shifted paths (extending `shiftStateIndices`/`rekeyArrayState` to cover `pathSubscribers` keys, not just error/touched/dirty state) is deferred to v0.5.0's array-ops-vs-tanstack-form(Svelte) perf task, which depends on this correctness fix landing first.

## Benchmark Coverage for the Scan Path

Existing core benchmark fixtures (`small.ts`, `large.ts`) are flat primitives — they structurally cannot exercise the new descendant scan (the type guard skips it for them). Add:

**`bench/fixtures/nested.ts`** (new):
```ts
import type { FormFixture } from '../adapters/interface.js'

export const nestedFixture: FormFixture = {
  initialValues: {
    items: Array.from({ length: 50 }, (_, i) => ({ name: `item${i}`, email: `item${i}@test.com` })),
  },
}
```

**`bench/suites/core/nested-set.bench.ts`** (new): registers a per-field descendant subscriber at every `items.N.name` / `items.N.email` (mirroring real per-item field subscription usage), then benchmarks `set('items.0', {name: 'x', email: 'y'})` — a coarse-grained parent-level set on an object path, which forces the descendant scan on every iteration since the value is an object.

This becomes a permanent `bench:core` surface (`nested-set` key in `results/core.json`), covered by Priority 0's median-of-N regression gate (from the v0.5.0 spec) going forward like every other core surface — so future changes to `notifyPathSubscribers` get the same protection this fix is getting now.

## Testing Strategy

Add to `packages/core/test/form.test.ts` (or a new focused describe block):

1. **Cascade correctness:** `set()` on a parent object path fires a subscriber registered at a descendant leaf path, with the correct final value.
2. **Sibling isolation preserved:** a descendant subscriber under a *different* parent does not fire (regression guard for the existing "sibling paths don't fire" behavior).
3. **Array ops cascade:** `arrayRemove`/`arrayInsert`/`arrayMove`/`arraySwap` each fire per-item descendant subscribers with the correct post-mutation value — asserted on **value correctness**, not exact call count (call counts will change once the v0.5.0 array-ops task tightens precision; locking counts down now would make these tests immediately stale).
4. **No double-fire:** a subscriber reachable via two different mutated paths in one `batch()` fires exactly once (regression guard for the dedup fix).
5. **Existing full suite stays green** — all 9132 existing tests, unmodified expectations, since no test encoded the buggy behavior as intentional (confirmed during investigation).

## Verification

The unit tests (see Testing Strategy above) are what validate correctness — a subscriber fires with the right value. The benchmark's job is purely to quantify performance cost, not correctness, so the two are checked separately:

1. Add the `nested-set` fixture and bench suite, and implement the fix, in the same task (the fixture is only useful once there's a fix to measure against — pre-fix, `set('items.0', {...})` is fast purely because it's *not* doing the correctness-required scan at all).
2. Run `pnpm --dir bench bench:core` 3 times locally post-fix (manual median-of-3, mirroring what Priority 0's automated gate will do) and compare `set-get/small`, `set-get/large`, `subscriptions/small`, `subscriptions/large` against their numbers from before this change — expect no meaningful difference, since those fixtures are all primitive-leaf and the type guard skips the scan for them entirely.
3. Sanity-check `nested-set`'s ops/sec is not pathologically slow — no fixed numeric target (there's no competitor or prior baseline to compare against for a brand-new surface), just confirm the cost scales with array size × registered-subscriber count as expected, not with unrelated form size.
4. Full test suite (`pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`) green.

## What Stays the Same

- Public API surface — no signature changes anywhere. This is purely an internal notification-completeness fix.
- `reset()`'s existing brute-force notify-everyone behavior — unchanged, already correct, not touched by this fix.
- Batching semantics (`batch()`, `pendingPaths`, `_flushNotifications`) — unchanged; the fix lives entirely inside `notifyPathSubscribers`, which both the immediate and batched-flush paths already funnel through.
- Wildcard (`'*'`) subscriber behavior — unchanged, still fires on every mutation with the full values snapshot.

## Out of Scope

- Tightening array ops to notify only exact shifted paths instead of the whole array root — deferred to v0.5.0's array-ops-vs-tanstack-form(Svelte) perf task, which builds on top of this fix.
- Any change to `reset()` — already correct.
- A trie/index structure for faster descendant lookup — the type guard already excludes the hot path (primitive leaf sets) from paying any scan cost, and object/array mutations are infrequent enough that a linear `Map.keys()` scan is acceptable; a fancier data structure would add complexity and bug surface without a demonstrated need.
