# Notification Cascade Correctness Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `notify()` in `packages/core/src/index.ts` so it cascades to descendant path subscribers, not just ancestors — closing a data-integrity bug where per-field subscribers on nested/array values go silently stale after a parent-level `set()`, array op, or `resetField()`.

**Architecture:** Rewrite the shared `notifyPathSubscribers` helper to collect the full notify-set for a flush (ancestors + self + matched descendants, deduped) in one pass, guarded by a `typeof value === 'object'` check so the primitive-leaf hot path (what `set-get`/`subscriptions` benchmarks measure) pays zero added cost. Add a new benchmark fixture/suite that actually exercises the descendant scan, since existing fixtures structurally can't.

**Tech Stack:** TypeScript, Vitest (unit tests + `vitest bench`), existing `bench/` benchmark harness.

## Global Constraints

- No public API signature changes — this is an internal notification-completeness fix (per spec's "What Stays the Same").
- `reset()`'s existing brute-force notify-everyone behavior must not be touched — it's already correct.
- `set-get/small`, `set-get/large`, `subscriptions/small`, `subscriptions/large` core benchmarks must show no meaningful ops/sec regression — these are all primitive-leaf fixtures, protected by the type guard.
- Array op test assertions: `arrayMove`/`arraySwap` may assert exact call counts (already precisely scoped, no future changes planned). `arrayRemove`/`arrayInsert` must only assert "fired at least once with the correct value," not an exact count — v0.5.0's array-ops task will change their call counts by narrowing the whole-array `notify(targetPath)` fallback to exact shifted paths.

---

### Task 1: Descendant-aware `notifyPathSubscribers` with TDD tests

**Files:**
- Modify: `packages/core/src/index.ts:1215-1237` (the `notifyPathSubscribers` function)
- Modify: `packages/core/test/form.test.ts` (add new describe block after the `subscribeToPath — cleanup and nested paths` block, which ends at line 2810, before the `getConnectedCount` section comment at line 2812)

**Interfaces:**
- Consumes: `pathSubscribers: Map<string, Set<PathSubscriber>>` (existing, declared at `packages/core/src/index.ts:1039`), `getNestedValue(obj, path)` and `deepClone(val)` (existing module-level functions), `values`, `errors`, `touched`, `dirty` (existing closure variables).
- Produces: `notifyPathSubscribers(paths: string[]): void` — same signature as before, called by `notify()`, `_flushNotifications()`, and `reset()`. No other task in this plan depends on new exports; this is a self-contained internal fix.

- [ ] **Step 1: Write the failing tests**

Open `packages/core/test/form.test.ts`. Find this block (ends at line 2810):

```ts
  it('wildcard subscriber receives full values snapshot as first argument', () => {
    const cb = vi.fn();
    const form = createForm({ initialValues: { a: 0, b: 0 } });
    form.subscribeToPath('*', cb);
    cb.mockClear();
    form.set('a', 5, { touch: true, validate: false });
    expect(cb).toHaveBeenCalled();
    // wildcard gets deepClone(values) as the first arg, not a single field value
    const firstArg = cb.mock.calls[0][0];
    expect(firstArg).toMatchObject({ a: 5, b: 0 });
  });
});
```

Immediately after that closing `});` (and before the `// getConnectedCount` comment block), insert:

```ts

// ---------------------------------------------------------------------------
// notifyPathSubscribers — downward cascade to descendant paths
// ---------------------------------------------------------------------------

describe('notifyPathSubscribers — downward cascade to descendant paths', () => {
  it('set() on a parent object path fires a subscriber registered at a descendant leaf path', () => {
    const form = createForm({ initialValues: { items: [{ v: 'a' }, { v: 'b' }] } });
    const cb = vi.fn();
    form.subscribeToPath('items.0.v', cb);
    cb.mockClear();
    form.set('items.0', { v: 'ZZZ' }, { validate: false });
    expect(cb).toHaveBeenCalled();
    expect(cb.mock.calls[cb.mock.calls.length - 1][0]).toBe('ZZZ');
  });

  it('does not fire a descendant subscriber under a different parent', () => {
    const form = createForm({
      initialValues: { items: [{ v: 'a' }], other: { v: 'z' } },
    });
    const cb = vi.fn();
    form.subscribeToPath('other.v', cb);
    cb.mockClear();
    form.set('items.0', { v: 'ZZZ' }, { validate: false });
    expect(cb).not.toHaveBeenCalled();
  });

  it('arrayRemove notifies a shifted item\'s descendant value subscriber with its new value', () => {
    const form = createForm({
      initialValues: { items: [{ v: 'a' }, { v: 'b' }, { v: 'c' }, { v: 'd' }] },
    });
    const cb = vi.fn();
    // index 1 will hold 'c' (shifted down from index 2) after removing index 1's original item 'b'
    form.subscribeToPath('items.1.v', cb);
    cb.mockClear();
    form.arrayRemove('items', 1);
    expect(cb).toHaveBeenCalled();
    expect(cb.mock.calls[cb.mock.calls.length - 1][0]).toBe('c');
  });

  it('arrayInsert notifies a shifted item\'s descendant value subscriber with its new value', () => {
    const form = createForm({
      initialValues: { items: [{ v: 'a' }, { v: 'b' }, { v: 'c' }] },
    });
    const cb = vi.fn();
    // index 2 will hold 'b' (shifted down from index 1) after inserting a new item at index 1
    form.subscribeToPath('items.2.v', cb);
    cb.mockClear();
    form.arrayInsert('items', 1, { v: 'X' });
    expect(cb).toHaveBeenCalled();
    expect(cb.mock.calls[cb.mock.calls.length - 1][0]).toBe('b');
  });

  it('arrayMove notifies only the affected range\'s descendant subscribers, not siblings outside it', () => {
    const form = createForm({
      initialValues: {
        items: [{ v: 'a' }, { v: 'b' }, { v: 'c' }, { v: 'd' }, { v: 'e' }],
      },
    });
    const cb1 = vi.fn();
    const cb3 = vi.fn();
    const cb4 = vi.fn(); // index 4 is outside the [1,3] move range — must not fire
    form.subscribeToPath('items.1.v', cb1);
    form.subscribeToPath('items.3.v', cb3);
    form.subscribeToPath('items.4.v', cb4);
    cb1.mockClear();
    cb3.mockClear();
    cb4.mockClear();
    form.arrayMove('items', 1, 3); // [a,b,c,d,e] -> [a,c,d,b,e]
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb1.mock.calls[0][0]).toBe('c');
    expect(cb3).toHaveBeenCalledTimes(1);
    expect(cb3.mock.calls[0][0]).toBe('b');
    expect(cb4).not.toHaveBeenCalled();
  });

  it('arraySwap notifies exactly the two swapped descendant subscribers with correct values', () => {
    const form = createForm({
      initialValues: { items: [{ v: 'a' }, { v: 'b' }, { v: 'c' }, { v: 'd' }] },
    });
    const cb0 = vi.fn();
    const cb3 = vi.fn();
    const cb1 = vi.fn(); // unaffected sibling — must not fire
    form.subscribeToPath('items.0.v', cb0);
    form.subscribeToPath('items.3.v', cb3);
    form.subscribeToPath('items.1.v', cb1);
    cb0.mockClear();
    cb3.mockClear();
    cb1.mockClear();
    form.arraySwap('items', 0, 3);
    expect(cb0).toHaveBeenCalledTimes(1);
    expect(cb0.mock.calls[0][0]).toBe('d');
    expect(cb3).toHaveBeenCalledTimes(1);
    expect(cb3.mock.calls[0][0]).toBe('a');
    expect(cb1).not.toHaveBeenCalled();
  });

  it('does not double-fire a subscriber reachable via two different mutated paths in the same batch', () => {
    const form = createForm({ initialValues: { items: [{ v: 'a' }] } });
    const cb = vi.fn();
    form.subscribeToPath('items.0.v', cb);
    cb.mockClear();
    form.batch(() => {
      form.set('items.0', { v: 'X' }, { validate: false }); // descendant scan reaches items.0.v
      form.set('items.0.v', 'Y', { validate: false }); // direct set also reaches items.0.v
    });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0]).toBe('Y');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm exec vitest run packages/core/test/form.test.ts -t "notifyPathSubscribers — downward cascade"
```

Expected: 7 failures. The cascade/array-op tests fail because `cb` is never called (`toHaveBeenCalled()` fails) or is called 0 times where 1 is expected. The "different parent" test currently passes trivially (nothing fires either way) — that's fine, it's a regression guard, not proof of the fix.

- [ ] **Step 3: Implement the fix**

In `packages/core/src/index.ts`, replace lines 1215-1237:

```ts
  // Shared path fan-out logic used by notify(), _flushNotifications(), and reset().
  const notifyPathSubscribers = (paths: string[]) => {
    paths.forEach((mutatedPath) => {
      const parts = mutatedPath.split('.');
      const candidatePaths: string[] = ['*'];
      let accum = '';
      for (const part of parts) {
        accum = accum ? `${accum}.${part}` : part;
        candidatePaths.push(accum);
      }
      for (const p of candidatePaths) {
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
    });
  };
```

with:

```ts
  // Shared path fan-out logic used by notify(), _flushNotifications(), and reset().
  //
  // Walks both directions from each mutated path: upward to ancestors (so a
  // subscriber on 'items' fires when 'items.0.v' changes) and downward to
  // registered descendants (so a subscriber on 'items.0.v' fires when 'items.0'
  // or 'items' is replaced wholesale). The descendant scan only runs when the
  // mutated value is itself an object/array — primitive leaf sets (the
  // set-get/subscriptions benchmark hot path) skip it entirely, zero added cost.
  //
  // All paths-to-notify across the whole flush are collected into one Set before
  // firing, so a subscriber reachable via two different mutated paths in the same
  // batch (e.g. arrayRemove's shifted-key notify plus its whole-array notify)
  // fires exactly once, not once per path that reaches it.
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

- [ ] **Step 4: Run the new tests to verify they pass**

```bash
pnpm exec vitest run packages/core/test/form.test.ts -t "notifyPathSubscribers — downward cascade"
```

Expected: 7 passed.

- [ ] **Step 5: Run the full core test suite to check for regressions**

```bash
pnpm exec vitest run packages/core/test/form.test.ts
```

Expected: all tests pass (no count regression from before this change — the fix is additive-only per the spec's investigation, no existing test encoded the buggy upward-only behavior as intentional).

- [ ] **Step 6: Run the full monorepo test suite**

```bash
pnpm test
```

Expected: all tests pass across every package (adapters re-export `@neutro/form-core`, so this confirms no adapter-level test relied on the old behavior either).

- [ ] **Step 7: Typecheck and lint**

```bash
pnpm exec tsc --noEmit
pnpm lint
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/index.ts packages/core/test/form.test.ts
git commit -m "fix(core): notify() cascades to descendant path subscribers, not just ancestors

Per-field subscribers on a nested/array value (e.g. items.0.v) never
fired when a parent path (items.0, or an array op) was mutated, unless
that exact leaf happened to have pre-existing error/touched/dirty
state. Any consumer using idiomatic per-field subscriptions on a
dynamic array got silently stale UI. Fixes set(), arrayRemove,
arrayInsert, arrayMove, arraySwap, and resetField (all funnel through
notifyPathSubscribers). Guarded by a typeof-object check so primitive
leaf sets - the set-get/subscriptions benchmark hot path - pay zero
added cost, and deduped across the whole flush to avoid double-firing
a subscriber reachable via two different mutated paths in one batch."
```

---

### Task 2: Benchmark coverage for the descendant-scan cost

**Files:**
- Create: `bench/fixtures/nested.ts`
- Create: `bench/suites/core/nested-set.bench.ts`

**Interfaces:**
- Consumes: `FormFixture` interface (`bench/adapters/interface.ts`), `createAdapter` from `bench/adapters/neutro.ts` (produces a `BenchAdapter` with `set(path, value)`, `subscribeToPath(path, fn)`), Task 1's fix (this task's whole purpose is measuring it).
- Produces: a new `nested-set` key in `results/core.json` (written by the existing `bench:core` script — no reporter changes needed, `bench/reporters/json-bench.ts` already writes every describe block's benchmarks generically by suite name).

- [ ] **Step 1: Create the nested fixture**

Create `bench/fixtures/nested.ts`:

```ts
import type { FormFixture } from '../adapters/interface.js'

export const nestedFixture: FormFixture = {
  initialValues: {
    items: Array.from({ length: 50 }, (_, i) => ({ name: `item${i}`, email: `item${i}@test.com` })),
  },
}
```

- [ ] **Step 2: Create the nested-set benchmark suite**

Create `bench/suites/core/nested-set.bench.ts`:

```ts
import { bench, describe } from 'vitest'
import { createAdapter as neutroAdapter } from '../../adapters/neutro.js'
import { nestedFixture } from '../../fixtures/nested.js'

function wireItemSubscribers(adapter: ReturnType<typeof neutroAdapter>) {
  const unsubscribes: Array<() => void> = []
  for (let i = 0; i < 50; i++) {
    unsubscribes.push(adapter.subscribeToPath(`items.${i}.name`, () => {}))
    unsubscribes.push(adapter.subscribeToPath(`items.${i}.email`, () => {}))
  }
  return () => unsubscribes.forEach(fn => fn())
}

describe('nested-set', () => {
  const a = neutroAdapter(nestedFixture)
  const cleanup = wireItemSubscribers(a)
  bench(a.name, () => {
    a.set('items.0', { name: 'x', email: 'y' })
  })
  // cleanup kept in scope to prevent GC
  void cleanup
})
```

This registers 100 descendant subscribers (2 per item × 50 items) and benchmarks a parent-level `set('items.0', {...})` — an object value, so Task 1's type guard forces the descendant scan on every iteration.

- [ ] **Step 3: Run bench:core and confirm the new surface appears**

```bash
cd bench && pnpm run bench:core
cat results/core.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['nested-set'])"
```

Expected: a JSON array with one entry, `library: "neutro/form"`, `status: "ok"`, and a positive `opsPerSec`. No fixed numeric target — this is a brand-new surface with no prior baseline or competitor to compare against.

- [ ] **Step 4: Run bench:core 3 times and compare the pre-existing hot-path surfaces against their pre-fix numbers**

`bench/results/core.json` is gitignored local output (only `bench/results/baseline.json` is tracked in git), regenerated by every `bench:core` run — so there's no committed history to diff against. The table below is a snapshot captured locally during this plan's authoring, for the implementer's reference; if your local `results/core.json` predates this plan, run `pnpm --dir bench run bench:core` once first and use those numbers as your own "before" reference instead:

| Surface | Pre-fix ops/sec |
|---|---|
| `set-get/small` | 2,930,610 |
| `set-get/large` | 2,878,828 |
| `subscriptions/small` | 4,985,881 |
| `subscriptions/large` | 4,679,699 |

Run:

```bash
cd bench
pnpm run bench:core && cat results/core.json | python3 -c "
import json, sys
d = json.load(sys.stdin)
for k in ['set-get/small', 'set-get/large', 'subscriptions/small', 'subscriptions/large']:
    print(k, d[k][0]['opsPerSec'])
"
```

Repeat 3 times. Expected: each run's numbers for these 4 surfaces land within normal run-to-run variance of the pre-fix reference table above (roughly ±15-20% is typical local variance for these benchmarks — this is a manual sanity check, not a hard gate; v0.5.0's Priority 0 task will automate this properly with median-of-N sampling in CI). There should be no *directional, repeated-across-all-3-runs* drop — if all 3 runs show the same surface consistently 20%+ slower, that's a real signal the type guard isn't working as intended, and Task 1 needs re-inspection before proceeding.

- [ ] **Step 5: Full verification sweep**

```bash
cd /Users/kofi/_/agw-form
pnpm test
pnpm exec tsc --noEmit
pnpm lint
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add bench/fixtures/nested.ts bench/suites/core/nested-set.bench.ts
git commit -m "bench: add nested-set core surface to exercise the descendant-scan cost

Existing set-get/subscriptions fixtures are flat primitives, so they
structurally never trigger notifyPathSubscribers' new descendant scan
(guarded by a typeof-object check). This fixture registers per-field
subscribers on 50 nested array items and benchmarks a parent-level
object set, giving the scan path a permanent regression surface -
covered by v0.5.0's Priority 0 median-of-N gate once that lands, same
as every other bench:core surface."
```

---

## Self-Review Notes

- **Spec coverage:** Root Cause + Fix Design §1 (descendant-aware notifyPathSubscribers, type guard, dedup) → Task 1 Step 3. Fix Design §2 (call sites unchanged, arrayRemove/arrayInsert imprecision documented as out of scope) → no code task needed, already true by construction since Task 1 doesn't touch call sites. Testing Strategy items 1-4 → Task 1's 7 tests (items 1-2 map to tests 1-2; item 3 maps to the 4 array-op tests; item 4 maps to the double-fire test). Testing Strategy item 5 (full suite green) → Task 1 Steps 5-6. Benchmark Coverage section → Task 2 Steps 1-2. Verification section → Task 2 Steps 3-5 (unit tests already covered correctness per spec's explicit split between unit-tests-for-correctness and bench-for-performance).
- **Placeholder scan:** no TBD/TODO; every step has literal code or an exact command with expected output.
- **Type consistency:** `notifyPathSubscribers(paths: string[])` signature unchanged from the spec's Fix Design code block, verified against actual current source in the spec review pass. `BenchAdapter`/`FormFixture` types in Task 2 match `bench/adapters/interface.ts` exactly (confirmed against source, not assumed).
