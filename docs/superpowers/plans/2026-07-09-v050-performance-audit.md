# v0.5.0 Performance Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure every core benchmark suite against the pre-modular-split baseline, then fix every real (>3%) regression found — including the two already-confirmed issues (setFieldValue's hook-indirection slowdown, the full tier's bundle-size growth) — without unwinding the mutation-invariant/hook-composition design from release-gate item 2.

**Architecture:** Two sequential stages. Stage 1 (Task 1) is read-only measurement: a shared scratch git worktree at the pre-split commit, alias-swapped against `bench/vitest.config.ts`, produces a findings doc with 21 bench-block rows (old median ms, new median ms, % delta, verdict). Stage 2 (Tasks 3-5) fixes whatever Stage 1 found real, each fix gated by re-running its own bench block(s) plus the full test suite.

**Tech Stack:** Vitest bench (tinybench), this repo's `bench/reporters/json-bench.ts` JSON reporter, git worktrees.

## Global Constraints

- **No re-litigating the mutation invariant or hook-composition design.** A fix that reintroduces reassignment-based state (`ctx.errors = {}` etc.) or removes/collapses a hook slot (`ctx.isComputedField`, `ctx.hasComputedFields`, `ctx.runComputedPass`, `ctx.onReset`) is out of scope, no matter how much it would help the numbers.
- **No new benchmark suites.** The 9 existing files under `bench/suites/core/` (21 bench blocks total) are the measurement surface for this plan.
- **No speculative fixing.** Every fix must be justified by a real, reproducibly-measured (median-of-3-or-more, not single-run) regression — single-run bench comparisons have shown ~15% run-to-run noise on identical code in this repo.
- **Regression/improvement threshold**: a bench block is a regression iff `(new_median_ms − old_median_ms) / old_median_ms > 0.03`; an improvement iff that ratio is `< -0.03`; otherwise no significant change.
- **Baseline commit**: `7b383e9d5c8e524f3e0a700c59d5bb275548c27f` (immediately before release-gate item 2's first commit).
- Every fix task must end with `pnpm exec vitest run packages/core/test` green (full pipeline sweep with lint/tsc/build happens in the final task).
- Full spec: `docs/superpowers/specs/2026-07-09-v050-performance-audit-design.md`.

---

## File Structure

| File | Responsibility |
|---|---|
| `docs/superpowers/specs/2026-07-09-v050-performance-audit-findings.md` (new) | Stage 1's output: 21-row findings table, updated through Stage 2 with fix status per regression. |
| `packages/core/src/engine.ts` | Modified in Task 3 if the `setFieldValue` value-changing-suite fix is warranted. |
| `packages/core/src/features/array-ops.ts` | Modified in Task 4 (validatedPaths-tail consolidation). |
| `bench/vitest.config.ts` | Temporarily edited (alias swap) during Task 1's measurement runs, restored after — never committed in a modified state. |

---

### Task 1: Stage 1 — measure all 21 bench blocks, old vs new

**Files:**
- Create: `docs/superpowers/specs/2026-07-09-v050-performance-audit-findings.md`
- Temporarily modify (not committed): `bench/vitest.config.ts`

**Interfaces:**
- Produces: the findings doc, one row per bench block, with columns `Suite/Block | Old median (ms) | New median (ms) | % delta | Verdict | Cluster`. This is Task 2's and Tasks 3-5's sole input — nothing downstream reads anything except this file.

- [ ] **Step 1: Create the shared worktree**

```bash
cd /Users/kofi/_/agw-form
git worktree add /tmp/perf-audit-old 7b383e9d5c8e524f3e0a700c59d5bb275548c27f
```

- [ ] **Step 2: Record `bench/vitest.config.ts`'s committed content for later restoration**

```bash
cp bench/vitest.config.ts /tmp/vitest.config.ts.committed
cat bench/vitest.config.ts
```
Expected output (confirm this matches before proceeding — if it doesn't, stop and report, do not guess at a different baseline):
```ts
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@neutro/form-core': resolve(__dirname, '../packages/core/src/index.ts'),
    },
  },
})
```

- [ ] **Step 3: For each of the 9 suite files, measure old-vs-new**

The 9 files and their bench-block counts (21 total): `array-ops.bench.ts` (2: remove, move), `array-ops-scale.bench.ts` (3: remove-start, remove-end, remove-start-with-unrelated-fields), `computed-fields.bench.ts` (1), `dependency-chain.bench.ts` (1), `dependency-scopes.bench.ts` (1), `nested-set.bench.ts` (1), `schema-validate.bench.ts` (4: zod/small, zod/large, yup/small, yup/large), `set-get.bench.ts` (3: small, large, xlarge), `ssr-mount.bench.ts` (1 — the file also contains an unrelated `test()`/`expect` block; `vitest bench` and the JSON reporter both ignore it, it does not produce a 22nd row), `subscriptions.bench.ts` (3).

For each file, in this exact order (repeat Steps 3a-3e for each of the 9 files before moving to Step 4):

**3a. Point the alias at the OLD worktree:**
```bash
cd /Users/kofi/_/agw-form
sed -i.bak "s#resolve(__dirname, '../packages/core/src/index.ts')#resolve('/tmp/perf-audit-old/packages/core/src/index.ts')#" bench/vitest.config.ts
rm -f bench/vitest.config.ts.bak
```

**3b. Run the suite 3 times against OLD, writing 3 separate JSON files:**
```bash
cd /Users/kofi/_/agw-form/bench
for i in 1 2 3; do
  BENCH_OUTPUT_FILE=/tmp/perf-audit-old-<SUITE>-$i.json pnpm exec vitest bench suites/core/<SUITE>.bench.ts --run --reporter=./reporters/json-bench.ts
done
```
Replace `<SUITE>` with the file's base name without `.bench.ts` (e.g. `set-get`, `array-ops-scale`). Each run prints `[json-bench] wrote /tmp/perf-audit-old-<SUITE>-<i>.json` on success.

**3c. Restore the alias to current `main`, run the suite 3 times against NEW:**
```bash
cd /Users/kofi/_/agw-form
cp /tmp/vitest.config.ts.committed bench/vitest.config.ts
cd bench
for i in 1 2 3; do
  BENCH_OUTPUT_FILE=/tmp/perf-audit-new-<SUITE>-$i.json pnpm exec vitest bench suites/core/<SUITE>.bench.ts --run --reporter=./reporters/json-bench.ts
done
```

**3d. Extract each bench block's `median` from all 6 JSON files.** Each JSON file has the shape `{ "<describe-block-name>": [ { "library": "neutro/form", "median": <number>, ... } ] }` — one top-level key per describe block in that suite file (e.g. `set-get.bench.ts` produces the keys `"set-get/small"`, `"set-get/large"`, `"set-get/xlarge"` in every one of its 6 JSON files). For each block, read `output["<block-key>"][0].median` from each of the 3 old files and each of the 3 new files:
```bash
node -e '
const fs = require("fs");
const suite = "<SUITE>";
const blocks = new Set();
for (const tag of ["old","new"]) {
  for (let i = 1; i <= 3; i++) {
    const data = JSON.parse(fs.readFileSync(`/tmp/perf-audit-${tag}-${suite}-${i}.json`, "utf8"));
    for (const key of Object.keys(data)) blocks.add(key);
  }
}
for (const block of blocks) {
  const medians = { old: [], new: [] };
  for (const tag of ["old","new"]) {
    for (let i = 1; i <= 3; i++) {
      const data = JSON.parse(fs.readFileSync(`/tmp/perf-audit-${tag}-${suite}-${i}.json`, "utf8"));
      if (data[block]) medians[tag].push(data[block][0].median);
    }
  }
  const median = (arr) => [...arr].sort((a,b)=>a-b)[Math.floor(arr.length/2)];
  const oldMed = median(medians.old);
  const newMed = median(medians.new);
  const delta = ((newMed - oldMed) / oldMed) * 100;
  console.log(block, "old:", oldMed.toFixed(4), "new:", newMed.toFixed(4), "delta:", delta.toFixed(2) + "%");
}
'
```
If any block's 3 old (or 3 new) `median` values have a spread wider than ~10% of their own median, re-run that tag 2 more times (5 total) and recompute — note this in the findings doc row rather than silently accepting a noisy sample.

**3e. Record each block's row in the findings doc** (create the doc after the first file's numbers are in, append subsequent files' rows) using the table format from this task's Interfaces section. Tag every row belonging to `set-get`, `subscriptions`, `dependency-scopes`, `dependency-chain`, or `nested-set` with `Cluster: setFieldValue`.

- [ ] **Step 4: Remove the shared worktree**

```bash
cd /Users/kofi/_/agw-form
git worktree remove /tmp/perf-audit-old --force
rm -f /tmp/vitest.config.ts.committed
git diff bench/vitest.config.ts
```
Expected: no diff (the alias was restored to its committed content in step 3c on the last iteration; confirm here rather than assuming).

- [ ] **Step 5: Write the findings doc header and commit**

The findings doc must start with:
```markdown
# v0.5.0 Performance Audit — Findings

Baseline: 7b383e9d5c8e524f3e0a700c59d5bb275548c27f (pre-modular-split)
Current: <HEAD sha at time of measurement>
Methodology: median-of-3+ runs per block, `bench/reporters/json-bench.ts`'s `median` (ms), threshold ±3%.

| Suite/Block | Old median (ms) | New median (ms) | % delta | Verdict | Cluster |
|---|---|---|---|---|---|
```
followed by the 21 rows from Step 3e.

```bash
cd /Users/kofi/_/agw-form
git add docs/superpowers/specs/2026-07-09-v050-performance-audit-findings.md
git status --short bench/vitest.config.ts
```
Confirm `bench/vitest.config.ts` shows no changes (per Step 4) before committing — do not commit it in a modified state.
```bash
git commit -m "docs(specs): v0.5.0 performance audit Stage 1 findings (21 bench blocks, old vs new)"
```

---

### Task 2: Independent spot-check of Task 1's findings

**Files:** none (verification-only, unless a discrepancy is found).

**Interfaces:**
- Consumes: `docs/superpowers/specs/2026-07-09-v050-performance-audit-findings.md` from Task 1.

- [ ] **Step 1: Pick 3 blocks to independently re-measure**

Choose one block from each of: the `setFieldValue` cluster (e.g. `set-get/large`), the array-ops group (e.g. `array-ops-scale/remove-start`), and one unrelated suite (e.g. `computed-fields`) — this spreads the spot-check across the three areas Stage 2 will act on.

- [ ] **Step 2: Re-run each chosen block's old-vs-new measurement independently**

Repeat Task 1 Step 1 (fresh worktree — do not reuse a leftover one) and Step 3a-3d for just these 3 suite files, using fresh output filenames (e.g. `/tmp/perf-audit-verify-old-<suite>-<i>.json`) so this run cannot accidentally read Task 1's cached files.

- [ ] **Step 3: Compare against the findings doc**

For each of the 3 blocks, confirm the new independent median (old and new) is within ~10% of the findings doc's recorded value for that block, and that the verdict (regression/improvement/no-significant-change) matches. If a verdict disagrees, re-run that block 5 times fresh (both old and new) and use the wider sample to decide which number is right — update the findings doc if Task 1's original row was wrong.

- [ ] **Step 4: Clean up and, if no changes were needed, note the spot-check result**

```bash
cd /Users/kofi/_/agw-form
git worktree remove /tmp/perf-audit-old --force 2>/dev/null || true
git status --short bench/vitest.config.ts
```
If Step 3 required a correction, amend the findings doc and commit:
```bash
git add docs/superpowers/specs/2026-07-09-v050-performance-audit-findings.md
git commit -m "docs(specs): correct Task 1 finding(s) per independent spot-check"
```
If no correction was needed, no commit is required for this task — record the clean spot-check result for the plan executor's tracking.

---

### Task 3: Fix `setFieldValue`'s hook-check cost (conditional on Task 1's findings)

**Files:**
- Modify: `packages/core/src/engine.ts:602-660` (`setFieldValue`)
- Test: `packages/core/test/` (existing suite must stay green, zero test changes — this is a behavior-preserving refactor)

**Interfaces:**
- Consumes: Task 1's findings doc rows tagged `Cluster: setFieldValue` (`set-get`, `subscriptions`, `dependency-scopes`, `dependency-chain`, `nested-set`).

**Decision gate — read this before writing any code:** `setFieldValue` (`engine.ts:602-660`) has two genuinely different call shapes depending on whether the written value differs from the current one:
- `set-get`, `subscriptions`, and `nested-set`'s bench blocks write a value deep-equal to the current one, so execution hits `if (isDeepEqual(currentVal, val)) return;` at line 618 and returns *before* ever reaching line 636 — their only hook call is `ctx.isComputedField(path)` at line 608.
- `dependency-scopes` and `dependency-chain`'s bench blocks write a genuinely new value each time, so execution reaches both `ctx.isComputedField(path)` (line 608) and `ctx.hasComputedFields()` (line 636).

Check the findings doc:
- **If NONE of the 5 cluster rows are regressions**, skip this task entirely — there is nothing to fix. Move to Task 4.
- **If only `dependency-scopes` and/or `dependency-chain` are regressions** (not `set-get`/`subscriptions`/`nested-set`), do Steps 1-5 below (the hoist-and-reuse fix, which only helps the value-changing case).
- **If `set-get`/`subscriptions`/`nested-set` are regressions**, the hoist-and-reuse fix below will NOT help them (it adds a call to a path that currently makes zero calls before the early return) — do not apply it to address those three. Report this back rather than implementing a fix that the root-cause analysis already shows is ineffective; this is a case for the controller to decide the next step (a different, smaller optimization targeting line 608 itself, or accepting the regression as a tradeoff), not something to guess at here.

- [ ] **Step 1: Write the baseline-pinning test proving current behavior is preserved**

```ts
// packages/core/test/setfieldvalue-hook-cost.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createForm } from '../src/index.js';

describe('setFieldValue hook-check cost fix (behavior preservation)', () => {
  it('computed fields still update correctly after a dependency-triggering set()', () => {
    const form = createForm({
      initialValues: { a: 1, b: 0 },
      computed: { b: { fn: (v: { a: number }) => v.a * 2 } },
    });
    form.set('a', 5);
    expect(form.get('b')).toBe(10);
  });

  it('a non-computed field write with no computed config configured is unaffected', () => {
    const form = createForm({ initialValues: { x: 1 } });
    form.set('x', 2);
    expect(form.get('x')).toBe(2);
  });

  it('setting a computed field directly is still a no-op with a warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const form = createForm({
      initialValues: { a: 1, b: 0 },
      computed: { b: { fn: (v: { a: number }) => v.a * 2 } },
    });
    form.set('b', 999);
    expect(form.get('b')).toBe(2); // unchanged — still derived from a
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run the test to confirm it passes against current (pre-fix) code**

Run: `pnpm exec vitest run packages/core/test/setfieldvalue-hook-cost.test.ts`
Expected: PASS (baseline pin — this proves the test itself is correct before the refactor, not that the refactor is needed).

- [ ] **Step 3: Apply the hoist-and-reuse fix**

Read the current exact code at `engine.ts:602-660` first (it may have shifted slightly since this plan was written — locate `const setFieldValue = (` and confirm the two `if (ctx.isComputedField(path))` / `if (ctx.hasComputedFields())` sites before editing). Change:
```ts
  const setFieldValue = (
    path: string,
    val: any,
    options: { touch?: boolean; validate?: boolean } = {}
  ) => {
    if (ctx.isComputedField(path)) {
```
to:
```ts
  const setFieldValue = (
    path: string,
    val: any,
    options: { touch?: boolean; validate?: boolean } = {}
  ) => {
    const hasComputed = ctx.hasComputedFields();
    if (hasComputed && ctx.isComputedField(path)) {
```
and change the later:
```ts
    if (ctx.hasComputedFields()) {
```
to:
```ts
    if (hasComputed) {
```
This is behavior-preserving because `!ctx.hasComputedFields() ⇒ !ctx.isComputedField(path)` for any path (if no computed fields are configured at all, no path can be one) — reduces 2 indirect ctx-hook calls to 1 per write when computed fields are reached at all, with zero behavior change when they are configured (both call sites still evaluate correctly either way).

- [ ] **Step 4: Run the full core test suite**

Run: `pnpm exec vitest run packages/core/test`
Expected: PASS, zero test changes needed elsewhere.

- [ ] **Step 5: Re-run the affected bench blocks and verify against the ±3% band**

Repeat Task 1's Step 3 measurement methodology (fresh worktree at the same baseline commit, alias swap, 3+ runs old vs new) for `dependency-scopes.bench.ts` and `dependency-chain.bench.ts` specifically (the two this fix targets), AND for `set-get.bench.ts`/`subscriptions.bench.ts`/`nested-set.bench.ts` (to confirm the fix didn't regress them, even though the root-cause analysis says it shouldn't touch their code path). Update the findings doc's rows for all 5 with the post-fix numbers and a new verdict.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/engine.ts packages/core/test/setfieldvalue-hook-cost.test.ts docs/superpowers/specs/2026-07-09-v050-performance-audit-findings.md
git commit -m "perf(core): hoist ctx.hasComputedFields() read in setFieldValue to avoid a redundant hook call"
```

---

### Task 4: Array-ops `validatedPaths`-tail consolidation (bundle-size fix)

**Files:**
- Modify: `packages/core/src/features/array-ops.ts:155-225` (`rekeyArrayState`), `:314-412` (`arraySwap`)
- Test: `packages/core/test/` (existing suite must stay green, zero test changes)

**Interfaces:**
- Produces: a module-scope helper `applyValidatedRenames(ctx: FormEngineContext<any>, renames: Array<[string, string]>): void`, called by both `rekeyArrayState` and `arraySwap`. `shiftStateIndices` is explicitly OUT of scope for this task — it stores/deletes its `validatedPaths` entries differently (inline during its compute loop, not as a separated `[old,new][]` pair list) and is not a drop-in third caller; do not attempt to fold it in here.

This fix is authorized regardless of Task 1's findings (the bundle-size regression is already confirmed via `bench/results/bundle-size.json`'s git history: 10,414 → 12,107 gzip bytes) — it does not need a Task-1-flagged row to proceed, unlike Task 3.

- [ ] **Step 1: Write the failing test proving the current behavior (pre-consolidation) as a baseline**

```ts
// packages/core/test/array-ops-validated-renames.test.ts
import { describe, it, expect } from 'vitest';
import { createForm } from '../src/index.js';

describe('validatedPaths renaming (rekeyArrayState/arraySwap consolidation baseline)', () => {
  it('arrayMove correctly re-validates the moved item\'s path', async () => {
    const form = createForm({
      initialValues: { items: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] },
      rules: { 'items.*.name': 'required' },
    });
    await form.validate(['items.0.name', 'items.1.name', 'items.2.name']);
    form.arrayMove('items', 0, 2);
    expect(form.isFieldValid('items.2.name')).not.toBeNull();
  });

  it('arraySwap correctly swaps validated-path membership between the two slots', async () => {
    const form = createForm({
      initialValues: { items: [{ name: 'a' }, { name: 'b' }] },
      rules: { 'items.*.name': 'required' },
    });
    await form.validate(['items.0.name']);
    expect(form.isFieldValid('items.0.name')).not.toBeNull();
    expect(form.isFieldValid('items.1.name')).toBeNull();
    form.arraySwap('items', 0, 1);
    expect(form.isFieldValid('items.1.name')).not.toBeNull();
    expect(form.isFieldValid('items.0.name')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to confirm it passes against current (pre-consolidation) code**

Run: `pnpm exec vitest run packages/core/test/array-ops-validated-renames.test.ts`
Expected: PASS (baseline pin).

- [ ] **Step 3: Add the shared helper**

Read the current exact code first (`grep -n "validatedRenames" packages/core/src/features/array-ops.ts` to confirm line numbers haven't shifted). Both `rekeyArrayState` (currently ending with the block below) and `arraySwap` have this exact apply-loop pair, byte-for-byte identical:
```ts
      for (const [oldKey] of validatedRenames) {
        ctx.validatedPaths.delete(oldKey);
        ctx.unindexKey(oldKey);
      }
      for (const [, newKey] of validatedRenames) {
        ctx.validatedPaths.add(newKey);
        ctx.indexKey(newKey);
      }
```
Add a module-scope helper near the top of `array-ops.ts` (after the imports, before `attachArrayOps`):
```ts
function applyValidatedRenames(
  ctx: FormEngineContext<any>,
  renames: Array<[string, string]>
): void {
  for (const [oldKey] of renames) {
    ctx.validatedPaths.delete(oldKey);
    ctx.unindexKey(oldKey);
  }
  for (const [, newKey] of renames) {
    ctx.validatedPaths.add(newKey);
    ctx.indexKey(newKey);
  }
}
```

- [ ] **Step 4: Replace both call sites**

In `rekeyArrayState`, replace the 8-line apply-loop pair shown in Step 3 with:
```ts
      applyValidatedRenames(ctx, validatedRenames);
```
In `arraySwap`, replace its identical 8-line apply-loop pair (immediately before the `ctx.notify(...)` calls) with the same:
```ts
      applyValidatedRenames(ctx, validatedRenames);
```
Do not touch `shiftStateIndices` — its `validatedRenames: string[]` (not `Array<[string,string]>`) and inline delete-during-compute shape are incompatible with this helper's signature.

- [ ] **Step 5: Run the full core test suite**

Run: `pnpm exec vitest run packages/core/test`
Expected: PASS, zero test changes needed elsewhere.

- [ ] **Step 6: Rebuild and re-measure bundle size**

```bash
cd /Users/kofi/_/agw-form
pnpm --filter @neutro/form-core --filter @neutro/form run build
cd bench
BENCH_OUTPUT_FILE=/tmp/perf-audit-bundle-after-consolidation.json pnpm exec vitest bench suites/bundle/measure.ts --run 2>/dev/null || node -e "require('./suites/bundle/measure.ts')" 2>/dev/null || pnpm exec tsx suites/bundle/measure.ts
cat results/bundle-size.json
```
(The exact invocation for `suites/bundle/measure.ts` may differ from the bench-suite pattern above since it's a standalone script, not a `vitest bench` file — check `bench/package.json`'s scripts for the real command, e.g. `bench:bundle-size`, and use that instead of guessing.) Confirm the full tier's (`"library": "neutro/form"`) `gzipBytes` has decreased from 12,107 — record the new number.

- [ ] **Step 7: Re-run array-ops/array-ops-scale bench blocks as a guardrail (not a target)**

Repeat Task 1's measurement methodology for `array-ops.bench.ts` and `array-ops-scale.bench.ts` specifically. Confirm neither regresses beyond the ±3% band relative to the pre-consolidation numbers already in the findings doc (compare against post-split "new" numbers from Task 1, not the pre-split "old" ones — this fix's job is bundle size, runtime must merely not get worse).

- [ ] **Step 8: Update the findings doc and commit**

Add a note to the findings doc recording the bundle-size before/after (12,107 → new number) and the array-ops/array-ops-scale guardrail result.
```bash
git add packages/core/src/features/array-ops.ts packages/core/test/array-ops-validated-renames.test.ts docs/superpowers/specs/2026-07-09-v050-performance-audit-findings.md
git commit -m "perf(core): consolidate rekeyArrayState/arraySwap's validatedPaths rename-apply into a shared helper"
```

---

### Task 5: Fix any remaining regressions Task 1 found beyond the setFieldValue cluster and array-ops

**Files:** varies per finding — determined by Task 1's findings doc, not known in advance.

**Interfaces:**
- Consumes: every row in `docs/superpowers/specs/2026-07-09-v050-performance-audit-findings.md` marked `Verdict: regression` that is NOT in the `setFieldValue` cluster (handled by Task 3) and is NOT `array-ops`/`array-ops-scale` (guardrail-checked by Task 4, not a fix target unless independently flagged here).

Check the findings doc first. Candidate suites this task might need to act on: `computed-fields`, `ssr-mount`, `schema-validate` (any of its 4 blocks), and `array-ops`/`array-ops-scale` ONLY IF they show a regression independent of Task 4's consolidation (i.e., already regressed in Task 1's original pre-fix measurement, not introduced by Task 4).

**If the findings doc has zero remaining unaddressed regressions**, this task is a no-op — record that explicitly and move to Task 6. Do not invent work.

**For each remaining regression found**, follow this concrete methodology (the specific code changed depends on what's actually broken, which cannot be known until Task 1 completes — the process below is fully specified even though its target is not):

- [ ] **Step 1: Write a test pinning current (regressed) behavior as a baseline**, in a new file named after the suite (e.g. `packages/core/test/<suite>-perf-fix.test.ts`), exercising the same code path the flagged bench block exercises (read the bench file itself — e.g. `bench/suites/core/computed-fields.bench.ts` — to see exactly what operation it measures, and write a correctness-only test for that same operation).

- [ ] **Step 2: Run the test to confirm it passes against current code** — this is a baseline pin, not expected to fail (no behavior is changing yet).

- [ ] **Step 3: Root-cause the regression** — read the actual relocated code (compare against the pre-split worktree's equivalent function via `git show 7b383e9d5c8e524f3e0a700c59d5bb275548c27f:packages/core/src/index.ts` and locate the corresponding function by name) and identify the specific structural change responsible (new indirection, added allocation, a duplicated computation, etc.) — cite exact line numbers in both old and new code, do not guess.

- [ ] **Step 4: Apply the least invasive fix** that addresses the root cause identified in Step 3, constrained by this plan's Global Constraints (no reassignment reintroduced, no hook slot removed/collapsed).

- [ ] **Step 5: Run the full core test suite** (`pnpm exec vitest run packages/core/test`) — PASS, zero unrelated test changes.

- [ ] **Step 6: Re-measure the specific flagged bench block** using Task 1's methodology (fresh worktree, alias swap, 3+ runs old vs new) and confirm it's back within the ±3% band.

- [ ] **Step 7: Update the findings doc** with the post-fix number and verdict, and commit:
```bash
git add <changed files> docs/superpowers/specs/2026-07-09-v050-performance-audit-findings.md
git commit -m "perf(core): fix <suite> regression found in v0.5.0 performance audit"
```

If a regression is found but, after root-causing it, turns out to be unfixable without violating the Global Constraints (i.e., it's an accepted, load-bearing cost of the mutation-invariant/hook-composition design, the same category as most of the bundle-size growth), do not force a fix — instead, add a row to the findings doc explicitly stating "Verdict: regression, accepted as a tradeoff — [one-sentence reason]" and move on. Nothing should silently fall through the cracks between "found" and "shipped," but not everything found needs to be fixed.

---

### Task 6: Final verification and whole-phase review

**Files:** none (verification-only, unless the review surfaces a fix).

- [ ] **Step 1: Confirm every regression in the findings doc has a resolution**

Read `docs/superpowers/specs/2026-07-09-v050-performance-audit-findings.md` in full. Every row marked `regression` at any point during this plan must now show either: a post-fix verdict of `no significant change` or `improvement`, or an explicit `accepted as a tradeoff` note with a stated reason (per Task 5's fallback). No row should be left as a bare, unexplained `regression`.

- [ ] **Step 2: Full pipeline sweep**

```bash
cd /Users/kofi/_/agw-form
pnpm lint
pnpm exec tsc --noEmit
pnpm build
pnpm test
```
Expected: all green.

- [ ] **Step 3: Independent whole-phase review**

A fresh reviewer (who did not implement Tasks 1-5) re-reads the findings doc against the spec's Non-goals and Risks sections: confirm no fix reintroduced a reassignment or removed a hook slot (grep the diff for `ctx\.\w+ = ` reassignment patterns on the six protected structures, same check style used in release-gate item 2's final review); confirm the `setFieldValue` fix (if applied) only touched the value-changing branch and didn't regress the early-returning suites; confirm the array-ops consolidation only touched `rekeyArrayState`/`arraySwap`, not `shiftStateIndices`; confirm the bundle-size number actually decreased and is recorded.

- [ ] **Step 4: Fix any findings, re-run Step 2, and record completion**

If the review surfaces issues, fix them following the same task-sized commit discipline as Tasks 1-5, then re-run the full pipeline sweep until clean.

- [ ] **Step 5: Update release-gate memory**

Once green, update the project memory `project_v050_release_gate` marking item 7 (performance audit) as RESOLVED, following the same format used for items 1 and 2: summary of what was measured, what was fixed, what was accepted as a tradeoff and why, and confirmation of local-main-unpushed status unless the user has since said otherwise.
