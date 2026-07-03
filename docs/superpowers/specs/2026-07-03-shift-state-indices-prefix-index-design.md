# Shadow Prefix Index for `shiftStateIndices`

Date: 2026-07-03
Status: Approved (design phase)
Release gate: v0.5.0, item 1 of 6 (see memory `project_v050_release_gate`)

## Problem

`shiftStateIndices` (`packages/core/src/index.ts`, ~line 1618) runs on every `arrayRemove`/`arrayInsert`. It performs six separate `Object.keys(stateMap).forEach(...)` scans — one each over `errors`, `touched`, `dirty`, `wasSet`, plus equivalent full-`Set`/`Map` iterations over `validatedPaths` and `pathSubscribers` — to find keys whose path falls under the mutated array's base path and needs renumbering.

Each scan is `O(total form state)`, not `O(state under this array)` or `O(shift range)`. A form with a large array plus many unrelated fields pays the full cost of all six scans on every single array mutation, regardless of how small the actual index shift is.

This was flagged during 2026-07-02 benchmark work as a real, already-located engine inefficiency (not a benchmark-coverage gap), and an attempt to measure it in isolation (`array-ops-scale` Task 7) was confounded by instantiation cost dominating the signal, so it was deferred rather than fixed.

## Non-goals

- This spec does **not** change the underlying representation of `errors`/`touched`/`dirty`/`wasSet`/`validatedPaths`/`pathSubscribers` (they remain flat dotted-string-keyed maps/sets).
- This spec does **not** touch `notify()`, `compileDependencyScopes`, `getPayload()`, the `connect` DOM registry, or `reset()` semantics. A deeper restructuring of core state to mirror array shape natively (enabling real splice semantics) was considered and rejected for this item — it would ripple through all of the above consumers and is a materially larger, riskier rewrite than fixing `shiftStateIndices`. It's out of scope here; if warranted later it should be its own release-gate item with its own design pass, kept separate from item 2 (modular bundle splitting), which already carries similar risk.
- `rekeyArrayState` (used by `arrayMove`) is a separate function with its own key-shifting logic. It is out of scope for this spec unless the fix naturally extends to it (see Open Questions).

## Design

### New structure

Add one new closure-scoped structure alongside the existing state maps:

```ts
const pathIndex = new Map<string, Set<string>>();
```

`pathIndex` maps every ancestor prefix of every currently-tracked state key to the set of full keys that live under that prefix, across **all six** state maps combined (a single unified index, not six parallel ones). E.g. if `errors["items.3.address.city"]` is set, `pathIndex` gains/updates entries for prefixes `"items"`, `"items.3"`, and `"items.3.address"`, each including `"items.3.address.city"` in its set.

A unified index is chosen over six parallel indices because most mutation call sites already touch multiple state maps together (e.g. setting an error often also touches `touched`/`dirty` in the same operation), and a single index halves the maintenance surface. The read path (`shiftStateIndices`) already re-checks per-map membership before applying edits, so the index only needs to narrow the *candidate* key set — it does not need per-map precision.

### Write path: `indexKey` / `unindexKey`

Two helpers, added near the state map declarations:

```ts
const indexKey = (key: string) => {
  const segments = key.split('.');
  let prefix = segments[0];
  for (let i = 1; i < segments.length; i++) {
    let set = pathIndex.get(prefix);
    if (!set) { set = new Set(); pathIndex.set(prefix, set); }
    set.add(key);
    prefix = `${prefix}.${segments[i]}`;
  }
};

const unindexKey = (key: string) => {
  const segments = key.split('.');
  let prefix = segments[0];
  for (let i = 1; i < segments.length; i++) {
    const set = pathIndex.get(prefix);
    if (set) {
      set.delete(key);
      if (set.size === 0) pathIndex.delete(prefix);
    }
    prefix = `${prefix}.${segments[i]}`;
  }
};
```

Note: a key with no `.` (a top-level field) has no ancestor prefixes and is never indexed — it can never be a descendant of an array base path, so it's correctly excluded.

These are called at every existing mutation site for the six tracked structures:
- `errors[key] = ...` → `indexKey(key)`; `delete errors[key]` → `unindexKey(key)`
- Same pattern for `touched`, `dirty`, `wasSet`
- `validatedPaths.add(key)` → `indexKey(key)`; `validatedPaths.delete(key)` → `unindexKey(key)`
- `pathSubscribers.set(key, ...)` (on first subscriber for a path) → `indexKey(key)`; when the last subscriber for a path is removed → `unindexKey(key)`

Call sites are enumerated in the implementation plan (traced counts at design time: `errors` 15, `touched` 10, `dirty` 7, `wasSet` 7, `validatedPaths` 8, `pathSubscribers` 4 — includes both read and write occurrences; the plan must isolate the actual write/delete sites from reads).

Wholesale replacements of a map (e.g. `errors = shiftMap(errors)` inside `shiftStateIndices` itself, or `errors = {}` on reset) must rebuild the index for the affected keys rather than calling `indexKey` per key in a loop where avoidable — see Interaction with `shiftStateIndices` below.

### Read path: `shiftStateIndices`

Replace the six `Object.keys(stateMap).forEach(...)` scans with:

```ts
const arrPrefix = `${basePath}.`;
const candidates = pathIndex.get(basePath) ?? new Set<string>();
```

Then, for each of the six shift operations currently implemented as a full scan, iterate `candidates` instead of `Object.keys(stateMap)`, keeping all existing shift/rename/drop logic identical — only the enumeration source changes. Each candidate key must still be checked for actual presence in the target map/set before acting on it (e.g. `if (key in errors) { ... }`), since `candidates` is a superset drawn from all six structures combined, not a per-map exact set.

`basePath` here is used as the literal index key (not `arrPrefix`) because `indexKey` stores keys under exact ancestor prefixes without trailing dots (e.g. `"items"`, not `"items."`).

### Interaction with `shiftStateIndices`'s own writes

`shiftStateIndices` currently rebuilds `errors`, `touched`, `dirty`, `wasSet` as new objects (`errors = shiftMap(errors)`) and rewrites `validatedPaths` via clear-and-repopulate. Under the new design, every key that moves (renamed, dropped, or kept) must have its index membership updated to match:
- A dropped key (removed array item) → `unindexKey(oldKey)`
- A renamed key (shifted index) → `unindexKey(oldKey)` then `indexKey(newKey)`
- A kept key (unchanged) → no index change needed

Because `shiftStateIndices` already knows exactly which keys it's touching (it's iterating `candidates`, not doing a blind rebuild), these calls are naturally inline in the same loop — no extra scan required.

### Testing

1. **Unit tests for `indexKey`/`unindexKey`** — ancestor-prefix walking correctness, empty-set cleanup on the last removal, top-level (no-dot) keys are no-ops.
2. **Fuzz/property test** — random interleavings of `setError`, `setTouched`, `setDirty`, `setValue` (wasSet), `subscribeToPath`/unsubscribe, `arrayInsert`, `arrayRemove` across multiple independent arrays and unrelated top-level fields. After every operation, assert `pathIndex.get(basePath)` (filtered to keys actually present in each of the six structures) matches a brute-force `Object.keys()`/`Array.from(set)` scan filtered by `startsWith(prefix)`. This is the primary safety net against silent index drift from a missed call site.
3. **Existing test suite** — the full existing `arrayRemove`/`arrayInsert`/`arrayMove` test suite must pass unmodified; this is a pure internal-performance change with no observable behavior difference.
4. **Benchmark** — revisit the `array-ops-scale` Task 7 attempt (`docs/superpowers/specs/2026-07-02-bench-array-ops-at-scale-design.md`) with instantiation cost isolated from shift cost this time (e.g. pre-warm/pre-instantiate the form once, then measure only the repeated array-op cost), to produce the clean before/after number that was missing previously.

### Risks

- **Missed call site**: the biggest risk is a mutation site that writes one of the six structures without the matching `indexKey`/`unindexKey` call, causing the index to silently drift from ground truth (stale entries are relatively benign — they just mean `shiftStateIndices` does a bit of extra presence-checking; *missing* entries are the dangerous case, since they'd cause `shiftStateIndices` to skip a key it should have shifted). The fuzz test in Testing item 2 is the primary mitigation; the implementation plan should also do a manual audit pass cross-referencing every write site against the call-site count taken at design time.
- **Memory growth**: `pathIndex` entries are cleaned up via the empty-set-deletion check in `unindexKey`, so it should not grow unboundedly relative to current live state.

## Open questions for the implementation plan

- Whether `rekeyArrayState` (used by `arrayMove`) has the same unbounded-scan shape and should be folded into this fix or left for a follow-on — needs tracing during planning.
- Exact enumeration of all ~50 write/delete call sites (the counts above are grep hits including reads; the plan needs the precise write-site list).
