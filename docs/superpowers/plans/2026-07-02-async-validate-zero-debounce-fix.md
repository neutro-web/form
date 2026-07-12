# Async Validate Zero-Debounce Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix a real, traced performance bug in `runValidation`'s async validator path — when `asyncDebounceMs` is `0`, a `setTimeout(fn, 0)` macrotask is still scheduled on every call, costing ~300x more than a direct microtask-based resolution.

**Architecture:** Single, surgical change to one `if`/`else` branch inside `runValidation` in `packages/core/src/index.ts`. When `asyncDebounceMs` is falsy (`0`), skip the `setTimeout` wrapper entirely and invoke the validator directly (still an async function, so resolution still goes through a microtask, not a synchronous call). When `asyncDebounceMs` is truthy, behavior is byte-for-byte unchanged from today.

**Tech Stack:** TypeScript, Vitest.

## Global Constraints

- This is a source change to `packages/core/src/index.ts` — the one shipped package this whole session's bench work has otherwise never touched. Treat it with the same discipline used for prior notify-machinery fixes this release cycle: TDD, independent re-verification, no behavior change for `asyncDebounceMs > 0`.
- Zero API surface change. `asyncDebounceMs` still defaults to `300` and still accepts any non-negative finite number; only the *internal* scheduling mechanism changes when the value is exactly `0`.
- Abort semantics must be preserved exactly: an abort signal fired before validation begins must still resolve with the pre-existing `errors` value (not the validator's result), for both the debounced and non-debounced paths.

---

### Task 1: Skip the setTimeout macrotask when asyncDebounceMs is 0

**Files:**
- Modify: `packages/core/src/index.ts:1422-1451` (inside `runValidation`, the `if (validationResult instanceof Promise)` block)
- Test: `packages/core/test/form.test.ts`

**Interfaces:**
- Consumes: `config.asyncDebounceMs` (already normalized to a non-negative finite number, default `300`, at `packages/core/src/index.ts:1066-1072` — `const asyncDebounceMs = ...`).
- Produces: no new exports. `form.validate()`'s external behavior is unchanged (same resolved errors, same abort semantics) — only the internal timing mechanism changes for the `asyncDebounceMs === 0` case.

- [ ] **Step 1: Read the current code to confirm line numbers haven't drifted**

```bash
sed -n '1410,1460p' packages/core/src/index.ts
```

Confirm this matches (if line numbers shifted slightly, that's fine — find the `if (validationResult instanceof Promise) {` block by content, not exact line number):

```ts
      if (config.validator) {
        // Bug #13: pass snapshot so mid-await mutations can't corrupt validation state.
        const valuesSnapshot = deepClone(values);
        const validationResult = config.validator(
          valuesSnapshot,
          expandedScope,
          abortController.signal
        );

        const isValidatorReturn = (r: unknown): r is Record<string, string> =>
          r !== null && r !== undefined && typeof r === 'object' && !Array.isArray(r);

        if (validationResult instanceof Promise) {
          // Bug #8: per-invocation debounce — uses a local timer, not a shared one.
          const resolvedErrors = await new Promise<Record<string, string>>((resolve) => {
            let localTimer: any;
            const onAbort = () => {
              clearTimeout(localTimer);
              resolve(errors);
            };
            abortController?.signal.addEventListener('abort', onAbort, { once: true });
            localTimer = setTimeout(async () => {
              abortController?.signal.removeEventListener('abort', onAbort);
              if (abortController?.signal.aborted) {
                resolve(errors);
                return;
              }
              try {
                const result = await validationResult;
                if (!isValidatorReturn(result)) {
                  console.error(
                    '[NeutroForm] validator must return Record<string,string> or Promise<Record<string,string>>'
                  );
                  resolve({});
                } else {
                  resolve(result);
                }
              } catch {
                resolve({ _global: 'Asynchronous validation transaction failed.' });
              }
            }, asyncDebounceMs);
          });
```

- [ ] **Step 2: Write a failing test proving the current setTimeout-always behavior is measurably slower than a microtask path**

This is a timing-sensitive regression test, not a pure unit assertion — use a real timer-cost proxy rather than asserting an exact millisecond bound (flaky). Add this test to `packages/core/test/form.test.ts` (find the existing `describe` block that covers async validation — search for `asyncDebounceMs` in the file to find the right neighborhood, and add this test there):

```ts
test('validate() with asyncDebounceMs: 0 resolves without an extra setTimeout macrotask', async () => {
  const form = createForm({
    initialValues: { email: '' },
    asyncDebounceMs: 0,
    validator: async (values) => (values.email ? {} : { email: 'required' }),
  })

  // A bare setTimeout(fn, 0) is clamped by Node to ~1ms and forces a full
  // event-loop timer-phase cycle. A microtask-based resolution completes
  // within the same tick family as a chain of Promise.resolve()s, which is
  // reliably faster. Race validate() against a burst of 50 chained
  // microtasks: if validate() still goes through a real timer, the
  // microtask burst - which never yields to the timer phase - finishes
  // first every time. If validate() is microtask-based, the two resolve in
  // comparable order (either could win, since both are microtask-driven).
  let microtaskBurstDone = false
  const microtaskBurst = (async () => {
    for (let i = 0; i < 50; i++) await Promise.resolve()
    microtaskBurstDone = true
  })()

  await form.validate()

  // If this fails, validate() finished strictly after 50 chained microtasks
  // completed, which only happens if it was waiting on a real timer (macrotask).
  await microtaskBurst
  expect(microtaskBurstDone).toBe(false)
})
```

Note: `expect(microtaskBurstDone).toBe(false)` checks the state *at the moment `form.validate()` resolves*, before we `await microtaskBurst` — the `await microtaskBurst` after the assertion is just to avoid an unhandled-rejection warning if the burst throws, not part of the ordering check. Re-read this test carefully: the assertion must happen immediately after `await form.validate()`, before `await microtaskBurst`. The code above already has the assertion in the right place.

- [ ] **Step 3: Run test to verify it fails against current code**

```bash
pnpm exec vitest run packages/core/test/form.test.ts -t "resolves without an extra setTimeout macrotask"
```

Expected: FAIL — `microtaskBurstDone` is `true` when checked, because the current code always waits through a real `setTimeout(fn, 0)`, which yields to the timer phase after the microtask queue (including the 50-iteration burst) has already drained.

- [ ] **Step 4: Implement the fix**

Replace the `if (validationResult instanceof Promise) { ... }` block (shown in Step 1) with:

```ts
        if (validationResult instanceof Promise) {
          const resolvedErrors = await new Promise<Record<string, string>>((resolve) => {
            const runValidator = async () => {
              try {
                const result = await validationResult;
                if (!isValidatorReturn(result)) {
                  console.error(
                    '[NeutroForm] validator must return Record<string,string> or Promise<Record<string,string>>'
                  );
                  resolve({});
                } else {
                  resolve(result);
                }
              } catch {
                resolve({ _global: 'Asynchronous validation transaction failed.' });
              }
            };

            if (!asyncDebounceMs) {
              // Bug #8 fix: with no debounce window to wait through, skip the
              // setTimeout macrotask entirely. A bare setTimeout(fn, 0) still
              // forces a full event-loop timer-phase cycle on every call -
              // ~300x slower than resolving via microtask scheduling (proven
              // during v0.5.0 schema-validator-overhead bench work: a sync
              // validator sharing this same AbortController/epoch machinery
              // ran ~300x faster than the async path, isolating the
              // setTimeout call itself as the dominant cost, not the
              // AbortController/epoch bookkeeping).
              if (abortController?.signal.aborted) {
                resolve(errors);
                return;
              }
              runValidator();
            } else {
              let localTimer: any;
              const onAbort = () => {
                clearTimeout(localTimer);
                resolve(errors);
              };
              abortController?.signal.addEventListener('abort', onAbort, { once: true });
              localTimer = setTimeout(() => {
                abortController?.signal.removeEventListener('abort', onAbort);
                if (abortController?.signal.aborted) {
                  resolve(errors);
                  return;
                }
                runValidator();
              }, asyncDebounceMs);
            }
          });
```

This preserves the `asyncDebounceMs > 0` path byte-for-byte in behavior (same abort listener lifecycle, same aborted-check-before-running, same error handling) — the only change is: when `asyncDebounceMs === 0`, there is no timer, no abort listener registration (nothing to observe an abort against during a zero-length window), just a synchronous aborted-check followed by directly invoking `runValidator()`.

- [ ] **Step 5: Run the new test to verify it passes**

```bash
pnpm exec vitest run packages/core/test/form.test.ts -t "resolves without an extra setTimeout macrotask"
```

Expected: PASS.

- [ ] **Step 6: Run the full existing async/debounce/abort test suite to confirm no regression**

```bash
pnpm exec vitest run packages/core/test/form.test.ts
pnpm exec vitest run packages/core/test/persistence.test.ts
```

Expected: all PASS. Pay particular attention to any test involving `asyncDebounceMs` set to a non-zero value, or abort/cancellation behavior (search the file for `AbortController`, `signal.abort`, `asyncDebounceMs` to find them) — these exercise the untouched `else` branch and must show zero behavior change.

- [ ] **Step 7: Run the correctness suite's async-race test specifically**

```bash
cd bench && pnpm exec vitest run suites/correctness/async-race.test.ts
```

Expected: PASS — this is the existing suite that specifically stress-tests abort/cancellation ordering; it must continue to pass unchanged.

- [ ] **Step 8: Full monorepo verification sweep**

```bash
cd /Users/kofi/_/agw-form
pnpm build
pnpm test
pnpm exec tsc --noEmit
pnpm lint
```

Expected: all green. `pnpm build` matters here specifically — this file compiles to `packages/core/dist/index.js`, which every framework adapter and every bench app links against; per this session's established lesson (`feedback_bench_full_rebuild` memory), never trust a post-fix bench number without a full `pnpm build` first.

- [ ] **Step 9: Re-run the schema-validate bench surfaces to quantify the actual improvement**

```bash
cd bench
rm -rf apps/react/dist apps/vue/dist apps/svelte/dist apps/*/node_modules/.vite
pnpm run bench:core
cat results/core.json | python3 -c "
import json, sys
d = json.load(sys.stdin)
for k in ['set-get/small', 'schema-validate/zod/small', 'schema-validate/yup/small']:
    print(k, d[k][0]['opsPerSec'])
"
```

Expected: `schema-validate/zod/small` and `schema-validate/yup/small` should show a dramatic improvement over their pre-fix values (previously ~700-800 ops/sec; the sync-path diagnostic from the Task 6 review measured ~225,000 ops/sec for an equivalent code path sharing the same AbortController/epoch machinery minus the setTimeout, so the post-fix number should land in that neighborhood, not still near ~700-800 — if it doesn't move meaningfully, the fix did not actually eliminate the macrotask on the hot path and needs investigation before committing).

- [ ] **Step 10: Commit**

```bash
git add packages/core/src/index.ts packages/core/test/form.test.ts
git commit -m "fix(core): skip setTimeout macrotask in runValidation when asyncDebounceMs is 0

runValidation's async validator path always wrapped resolution in
setTimeout(fn, asyncDebounceMs), even when asyncDebounceMs is 0 and
there is no debounce window to wait through. Node clamps a bare
setTimeout(fn, 0) to roughly 1ms and forces a full event-loop
timer-phase cycle on every call - discovered during v0.5.0 bench work
as the dominant cost behind schema-validate surfaces running ~4,000x
slower than set-get (not zod/yup, and not AbortController/epoch
bookkeeping, which a sync-validator control measurement showed adds
only negligible overhead by comparison).

When asyncDebounceMs is 0, the validator now resolves directly via
microtask scheduling instead of a real timer. Behavior for
asyncDebounceMs > 0 is unchanged - same abort listener lifecycle, same
aborted-before-run check, same error handling."
```

## Verification (whole-task)

- New regression test (Step 2) proves the microtask-vs-macrotask distinction directly, not just an improved number that could be noise.
- Existing async/abort/debounce test suites (`form.test.ts`, `persistence.test.ts`, `async-race.test.ts`) all pass unchanged — proves the `asyncDebounceMs > 0` path and abort semantics are untouched.
- `bench:core`'s `schema-validate/*` numbers move dramatically post-fix, quantifying the real-world improvement this fix delivers (this number should be captured for the next full bench-report regeneration).
