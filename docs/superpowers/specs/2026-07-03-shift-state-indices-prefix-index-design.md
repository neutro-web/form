# Shadow Prefix Index for `shiftStateIndices`

Date: 2026-07-03
Status: Approved (design phase)
Release gate: v0.5.0, item 1 of 6 (see memory `project_v050_release_gate`)

## Problem

`shiftStateIndices` (`packages/core/src/index.ts`, ~line 1618) runs on every `arrayRemove`/`arrayInsert`. It performs six separate `Object.keys(stateMap).forEach(...)` scans — one each over `errors`, `touched`, `dirty`, `wasSet`, plus equivalent full-`Set`/`Map` iterations over `validatedPaths` and `pathSubscribers` — to find keys whose path falls under the mutated array's base path and needs renumbering.

Each scan is `O(total form state)`, not `O(state under this array)` or `O(shift range)`. A form with a large array plus many unrelated fields pays the full cost of all six scans on every single array mutation, regardless of how small the actual index shift is.

This was flagged during 2026-07-02 benchmark work as a real, already-located engine inefficiency (not a benchmark-coverage gap), and an attempt to measure it in isolation (`array-ops-scale` Task 7) was confounded by instantiation cost dominating the signal, so it was deferred rather than fixed.

## Scope correction (post-review)

The first draft of this spec treated `shiftStateIndices` as the only function needing the index-lookup fix, and left `rekeyArrayState` and `arraySwap` (both of which perform the exact same kind of wholesale key-rename over the exact same six tracked structures, under the exact same array `basePath`) as out of scope or unmentioned. Adversarial review (round 1) correctly identified this as a critical gap: `arrayMove` and `arraySwap` write directly to `errors`/`touched`/`dirty`/`wasSet`/`validatedPaths` via their own `Object.keys().forEach()` rebuilds, completely bypassing `indexKey`/`unindexKey`. If left unindexed, any `arrayMove`/`arraySwap` on an array silently desyncs `pathIndex` for that array — the next `arrayRemove`/`arrayInsert` would then consult stale/missing index entries and skip real, live keys. This is not a deferrable follow-on; it's the same bug class the index is meant to prevent, just triggered by a sibling function.

**Revised scope: this spec now covers all three array key-renaming operations — `shiftStateIndices` (`arrayRemove`/`arrayInsert`), `rekeyArrayState` (`arrayMove`), and `arraySwap`'s inline `swapKeys` — applying the same index-lookup-instead-of-full-scan treatment and the same inline index-maintenance to all three.** They share enough structure (prefix-based key rewrite over the same six maps) that the fix is essentially one pattern applied three times, not three designs.

## Non-goals

- This spec does **not** change the underlying representation of `errors`/`touched`/`dirty`/`wasSet`/`validatedPaths`/`pathSubscribers` (they remain flat dotted-string-keyed maps/sets).
- This spec does **not** touch `notify()`, `compileDependencyScopes`, `getPayload()`, or the `connect` DOM registry. A deeper restructuring of core state to mirror array shape natively (enabling real splice semantics) was considered and rejected for this item — it would ripple through all of the above consumers and is a materially larger, riskier rewrite than fixing `shiftStateIndices`. It's out of scope here; if warranted later it should be its own release-gate item with its own design pass, kept separate from item 2 (modular bundle splitting), which already carries similar risk.
- Form-level `reset()` and field-level `resetField()`-style clears (see "Bulk-clear sites" below) are in scope for *index maintenance* (they must not be allowed to desync `pathIndex`), but are explicitly **not** targets of the performance optimization itself — they already do O(n) work by nature (clearing n keys) and this spec does not attempt to make them faster, only correct.

## Design

### New structure — refcounted, not a plain Set (post-round-2-review correction)

The first revision of this spec used `Map<string, Set<string>>` for `pathIndex`, treating "key present under this prefix" as a boolean. Round 2 adversarial review found this incorrect: because `pathIndex` is unified across all six tracked structures, the **same full key** is frequently indexed for more than one independent reason at once — e.g. `"items.3.city"` can simultaneously be a live `errors` entry *and* have an active `pathSubscribers` registration. A plain Set has no way to represent "this key has two independent claims on being indexed" — a single `unindexKey` call (e.g. from `reset()` clearing `errors`) deletes the key outright, even though `pathSubscribers` still needs it indexed. This silently evicts entries that are still live, which is exactly the dangerous failure mode this design exists to prevent.

**Fix: make the index refcounted**, so each structure's independent claim is tracked and a key is only removed from a prefix once nothing still claims it:

```ts
const pathIndex = new Map<string, Map<string, number>>();
```

`pathIndex` maps every ancestor prefix of every currently-tracked state key to a `Map<fullKey, refcount>` — the refcount is the number of the six tracked structures currently holding that exact key. E.g. if `errors["items.3.address.city"]` and `pathSubscribers` both hold `"items.3.address.city"`, the entry for that key under prefix `"items.3.address"` (and `"items"`, `"items.3"`) has refcount `2`; clearing `errors` decrements to `1` and the key correctly remains indexed because `pathSubscribers` still holds it.

This refcounting also fully replaces the need to special-case "which bulk-clear sites are safe to wholesale-clear the index" (see Bulk-clear sites, revised below) — every clear site, including form teardown, uniformly unindexes each key it's about to remove and never needs to reason about what else might still reference that key. The index maintains that invariant on its own.

### Write path: `indexKey` / `unindexKey`

Two helpers, added near the state map declarations:

```ts
const indexKey = (key: string) => {
  const segments = key.split('.');
  let prefix = segments[0];
  for (let i = 1; i < segments.length; i++) {
    let counts = pathIndex.get(prefix);
    if (!counts) { counts = new Map(); pathIndex.set(prefix, counts); }
    counts.set(key, (counts.get(key) ?? 0) + 1);
    prefix = `${prefix}.${segments[i]}`;
  }
};

const unindexKey = (key: string) => {
  const segments = key.split('.');
  let prefix = segments[0];
  for (let i = 1; i < segments.length; i++) {
    const counts = pathIndex.get(prefix);
    if (counts) {
      const next = (counts.get(key) ?? 1) - 1;
      if (next <= 0) counts.delete(key);
      else counts.set(key, next);
      if (counts.size === 0) pathIndex.delete(prefix);
    }
    prefix = `${prefix}.${segments[i]}`;
  }
};
```

Note: a key with no `.` (a top-level field) has no ancestor prefixes and is never indexed — it can never be a descendant of an array base path, so it's correctly excluded.

**Invariant that must hold**: every mutation site that writes a key into one of the six tracked structures calls `indexKey` exactly once for that write, and every mutation site that removes a key from one of the six tracked structures calls `unindexKey` exactly once for that removal — regardless of whether the key happens to also exist in another tracked structure at the time. Callers must never try to "optimize" by skipping the call because "it's probably already indexed" — the refcount depends on every structure independently reporting its own claim.

These are called at every existing mutation site for the six tracked structures:
- `errors[key] = ...` → `indexKey(key)`; `delete errors[key]` → `unindexKey(key)`
- Same pattern for `touched`, `dirty`, `wasSet`
- `validatedPaths.add(key)` → `indexKey(key)`; `validatedPaths.delete(key)` → `unindexKey(key)`
- `pathSubscribers.set(key, ...)` (on first subscriber for a path) → `indexKey(key)`; when the last subscriber for a path is removed → `unindexKey(key)`. Both `subscribeToPath` and `subscribeToPathDynamic` already guard the `Set`-creation branch with `if (!pathSubscribers.has(path))` / equivalent before adding a *new* path entry — `indexKey(key)` must go inside that same guarded branch, not unconditionally on every `subscribe()` call, or a second subscriber on an already-tracked path would double-increment the refcount and require an extra `unindexKey` to fully release it.

Call sites are enumerated in the implementation plan. Grep counts taken at design time (`errors` 15, `touched` 10, `dirty` 7, `wasSet` 7, `validatedPaths` 8, `pathSubscribers` 4) include both reads and writes and, per the scope correction above, **do not include** the `arraySwap` block (4 wholesale writes), the two `reset()` bulk-clear blocks (5 writes each), or the field-level reset filter-delete loops (5 distinct delete-in-a-loop sites). The implementation plan must produce its own precise, exhaustive write/delete site list by direct code audit rather than relying on these design-time grep counts, which are known to undercount.

Wholesale replacements of a map (e.g. `errors = shiftMap(errors)` inside `shiftStateIndices` itself, or `errors = {}` on reset) must rebuild the index for the affected keys rather than calling `indexKey` per key in a loop where avoidable — see Interaction with `shiftStateIndices` below.

### Read path: `shiftStateIndices`

Replace the six `Object.keys(stateMap).forEach(...)` scans with:

```ts
const candidates = pathIndex.get(basePath)?.keys() ?? [];
```

(`candidates` is now a key iterator over the refcounted `Map<string, number>` for that prefix — the refcounts themselves are irrelevant to the read path, which only needs the key set.)

Then, for each of the six shift operations currently implemented as a full scan, iterate `candidates` instead of `Object.keys(stateMap)`, keeping all existing shift/rename/drop logic identical — only the enumeration source changes. Each candidate key must still be checked for actual presence in the target map/set before acting on it (e.g. `if (key in errors) { ... }`), since `candidates` is a superset drawn from all six structures combined, not a per-map exact set.

`basePath` here is used as the literal index key (not `arrPrefix`) because `indexKey` stores keys under exact ancestor prefixes without trailing dots (e.g. `"items"`, not `"items."`).

### Interaction with `shiftStateIndices`'s own writes

`shiftStateIndices` currently rebuilds `errors`, `touched`, `dirty`, `wasSet` as new objects (`errors = shiftMap(errors)`) and rewrites `validatedPaths` via clear-and-repopulate. Concretely, the six existing nested closures/loops inside `shiftStateIndices` (`shiftMap`, called once per record map; the `validatedPaths.forEach` block; the `pathSubscribers.keys()` loop) are each rewritten to iterate `candidates` instead of that structure's own `Object.keys()`/native iteration, filtering by whether the candidate key is actually present in that specific structure before acting. This is one shared candidate set feeding six adapted loops — not a single unified loop body, since each structure's rename/drop logic differs slightly (e.g. `pathSubscribers` never drops entries, only relocates the "shifted" bookkeeping list).

Under the new design, every key that moves (renamed, dropped, or kept) must have its index membership updated to match:
- A dropped key (removed array item) → `unindexKey(oldKey)`
- A renamed key (shifted index) → `unindexKey(oldKey)` then `indexKey(newKey)`
- A kept key (unchanged) → no index change needed

Because `shiftStateIndices` already knows exactly which keys it's touching (it's iterating `candidates`, not doing a blind rebuild), these calls are naturally inline in the same loop — no extra scan required.

### `rekeyArrayState` (used by `arrayMove`) and `arraySwap`

Both functions perform the identical shape of operation as `shiftStateIndices`: a prefix-based rewrite of `errors`/`touched`/`dirty`/`wasSet`/`validatedPaths` (and, for `arraySwap`, no `pathSubscribers` handling currently exists — see Open Questions) keyed by the same `basePath`. Apply the identical treatment:

- Replace each function's `Object.keys(stateMap).forEach(...)` / `validatedPaths.forEach(...)` enumeration with a `pathIndex.get(basePath)` candidate lookup, exactly as in `shiftStateIndices`.
- Inline `unindexKey(oldKey)` / `indexKey(newKey)` calls for every key that moves (both the "moved to B" and "moved to A" halves of `arraySwap`'s swap, and the sliding-window renumbering in `rekeyArrayState`'s move).

This is not three independent implementations — it's one candidate-lookup-plus-inline-reindex pattern applied at three call sites that already share near-identical structure today (each already has its own hand-rolled version of "rewrite keys under `basePath` by some index transform"). The implementation plan should consider whether to extract a shared helper (e.g. a `remapArrayKeys(basePath, candidates, transformIndex)` primitive parameterized by the per-operation index-transform function) given the duplication, but that refactor is secondary to correctness and can be decided during planning.

### Bulk-clear sites (`reset()`, `hydrate()`, field-level reset, DOM-pruning, form teardown)

Several sites replace or partially clear a tracked structure at once rather than mutating one key at a time. Thanks to the refcounted index (see above), **every one of these follows the same uniform rule**: before removing a key from any tracked structure, call `unindexKey` for that key — regardless of whether other structures might still reference it, since the refcount handles that automatically. No site needs to reason about "is it safe to clear the index here" any more; that special-casing from the prior revision is no longer needed.

1. **Form-level `reset()`** (`errors = {}; touched = {}; dirty = {}; wasSet = {}; validatedPaths.clear();`): before each assignment, iterate the keys actually present and call `unindexKey` per key (e.g. `for (const k of Object.keys(errors)) unindexKey(k);` immediately before `errors = {}`, and similarly for `touched`/`dirty`/`wasSet`/`validatedPaths`). O(n) in the size of the structure being cleared, which `reset()` already pays elsewhere.
2. **`hydrate()`** has a *different* bulk-clear shape from `reset()` — it clears only `errors = {}; touched = {}; dirty = {};` (no `wasSet`, no `validatedPaths` reset). This must be treated as its own distinct call site in the implementation audit, not assumed identical to `reset()`'s five-structure clear. Apply the same per-key `unindexKey`-before-clear rule to exactly the three structures `hydrate()` actually clears.
3. **Field-level reset / `resetField`-style clears** (the `for (const k of Object.keys(errors)) { if (k === targetPath || k.startsWith(...)) delete errors[k]; }` pattern, repeated for `touched`/`dirty`/`wasSet`, plus the equivalent `validatedPaths` filter-and-delete): each `delete <map>[k]` inside these filter loops must be paired with `unindexKey(k)` at the point of deletion. Distinct call-site shape from a simple single-key `delete errors[key]`; enumerate separately.
4. **MutationObserver DOM-pruning** (`initMutationObserver`, `index.ts` ~1585–1608): when a connected element is removed from the DOM and its path isn't in `persistedPaths`, the observer does `delete errors[path]; delete touched[path]; delete dirty[path];`. Each of these three deletes needs a paired `unindexKey(path)` call, identical in shape to the field-level reset case (item 3). This site was missed in the prior revision entirely and must be included in the call-site audit.
5. **Form teardown / `destroy()`**: clears `pathSubscribers`, `connectionRegistry`, `connectedPaths`, `persistedPaths`, and other registries, but does **not** clear `errors`/`touched`/`dirty`/`wasSet`/`validatedPaths` — those five maps are left populated (the form instance is simply being discarded, not its value/error state reset). Consequently `pathIndex.clear()` here would be **incorrect**, not merely unnecessary: it would desync the index from the still-populated errors/touched/dirty/wasSet/validatedPaths, which remain live if the instance is inspected afterward. The correct action is to iterate `pathSubscribers.keys()` and call `unindexKey` for each *before* `pathSubscribers.clear()` — the same uniform per-key rule as every other site — and leave the rest of `pathIndex` untouched.
6. **`setErrors`/`clearErrors` public API** (`index.ts` ~2178–2202): a public bulk API doing `errors[p] = val`, `touched[p] = true`, and `delete errors[p]` across a caller-supplied set of paths. Structurally the same risk as `reset()`'s bulk clear (a multi-key write/delete in one call) and must call `indexKey`/`unindexKey` per path exactly like any other single-key site — named explicitly here because round-3 review found it absent from every prior draft's site list.
7. **`connect()`'s DOM event handlers** (`handleBlur`/`syncValueFromDOM`, ~2007–2016): `touched[stringPath] = true` on blur is a high-frequency single-key write (fires on every blur event) that must call `indexKey(stringPath)` like any other `touched` write. Also found missing from every prior draft's site list.

Items 6 and 7 do not change the design — they're ordinary single/multi-key writes already covered by the general "every write/delete calls indexKey/unindexKey" invariant — but are named explicitly so the implementation plan's call-site audit doesn't have to rediscover them.

### Testing

1. **Unit tests for `indexKey`/`unindexKey`** — ancestor-prefix walking correctness, refcount increment/decrement across repeated `indexKey`/`unindexKey` calls for the *same* key (simulating a key shared by two structures, e.g. an error plus a subscriber), prefix-entry cleanup only once the refcount map for that prefix is fully empty, top-level (no-dot) keys are no-ops.
2. **Fuzz/property test** — random interleavings of `setError`, `setTouched`, `setDirty`, `setValue` (wasSet), `subscribeToPath`/unsubscribe, `arrayInsert`, `arrayRemove`, `arrayMove`, `arraySwap`, field-level reset, full `reset()`, `hydrate()`, simulated DOM-pruning (removing a connected element), and `destroy()`, across multiple independent arrays and unrelated top-level fields. Include cases where the *same* full key is deliberately given multiple simultaneous claims (e.g. set an error and register a subscriber on the same path, then clear only the error) to exercise the refcount path specifically. After every operation, assert `pathIndex.get(basePath)`'s key set (filtered to keys actually present in at least one of the six structures) matches a brute-force `Object.keys()`/`Array.from(set)` scan filtered by `startsWith(prefix)`. This is the primary safety net against silent index drift from a missed call site or an incorrect refcount.
3. **Existing test suite** — the full existing `arrayRemove`/`arrayInsert`/`arrayMove`/`arraySwap`/`reset` test suite must pass unmodified; this is a pure internal-performance change with no observable behavior difference.
4. **Benchmark** — revisit the `array-ops-scale` Task 7 attempt (`docs/superpowers/specs/2026-07-02-bench-array-ops-at-scale-design.md`) with instantiation cost isolated from shift cost this time (e.g. pre-warm/pre-instantiate the form once, then measure only the repeated array-op cost), to produce the clean before/after number that was missing previously.

### Risks

- **Missed call site**: the biggest risk is a mutation site that writes or deletes a key in one of the six structures without the matching `indexKey`/`unindexKey` call, causing the index to silently drift from ground truth (stale entries are relatively benign — they just mean `shiftStateIndices` does a bit of extra presence-checking; *missing* entries are the dangerous case, since they'd cause `shiftStateIndices`/`rekeyArrayState`/`arraySwap` to skip a key they should have shifted). The fuzz test in Testing item 2 is the primary mitigation; the implementation plan must do its own exhaustive manual audit of every write/delete site rather than relying on the design-time grep counts, which are known to be incomplete (see "Scope correction" and "Bulk-clear sites" above).
- **Incorrect refcount** (new risk surfaced in round-2 review): an `indexKey` call not matched by exactly one later `unindexKey` call for the same removal (or vice versa — an extra `unindexKey` with no corresponding `indexKey`) would leave the refcount permanently wrong for that key — either leaking it (never fully removed, so `shiftStateIndices` does slightly more presence-checking forever) or evicting it early (the dangerous case). This is why the invariant stated in "Write path" — every write/delete of a tracked key pairs with exactly one `indexKey`/`unindexKey` call, independent of what other structures hold that key — must hold exactly, and why the fuzz test specifically includes shared-key scenarios.
- **Memory growth**: `pathIndex` entries are cleaned up when a key's refcount reaches zero and, transitively, when a prefix's refcount map becomes empty, so it should not grow unboundedly relative to current live state.

## Open questions for the implementation plan

- Exact, exhaustive enumeration of all write/delete call sites across `errors`/`touched`/`dirty`/`wasSet`/`validatedPaths`/`pathSubscribers`, including the `arraySwap`, `reset()`, and field-level-reset sites identified in the scope correction above. Design-time grep counts are known to be incomplete and must not be relied on directly.
- `arraySwap` currently has no `pathSubscribers` handling at all (unlike `shiftStateIndices`, which explicitly walks `pathSubscribers.keys()` to notify shifted per-item subscribers). Determine during planning whether this is a pre-existing gap in `arraySwap`'s notify behavior (out of scope to fix here) or whether the index-lookup refactor should surface it as a bug worth flagging separately — do not silently expand `arraySwap`'s notify semantics as a side effect of this performance fix.
- Whether to extract a shared `remapArrayKeys`-style helper given the structural duplication between `shiftStateIndices`, `rekeyArrayState`, and `arraySwap`'s `swapKeys` (see "`rekeyArrayState` and `arraySwap`" above), or keep three separate adapted implementations. Decide based on how much the three index-transform functions actually diverge once written out.
