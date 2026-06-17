# Security & Fault-Tolerance Implementation Plan (v0.3.0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden `@neutro/form-core` against subscriber exceptions, prototype pollution, CSS injection, validator type errors, and several robustness gaps identified in the v0.2.0 audit.

**Architecture:** All changes are in `packages/core/src/index.ts` (17 focused edits) with accompanying test coverage in `packages/core/test/`. No public API surface changes — all fixes are internal.

**Tech Stack:** TypeScript, Vitest (testing), Biome (lint/format)

---

### Task 1: Subscriber Exception Isolation

**Files:**
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/form.test.ts`

Global and path subscribers run in tight `for..of` loops with no error boundary. One throwing subscriber kills all subsequent listeners for that notification cycle.

Affected sites in `index.ts`:
- `notify()` — lines ~977-981 (global loop) and ~981 (path fan-out via `notifyPathSubscribers`)
- `notifyPathSubscribers()` — lines ~953-955 (inner `cb` loop)
- `_flushNotifications()` — lines ~963-964 (global loop)
- `runValidation()` — three global-subscriber loops at lines ~1014-1016, ~1118-1120
- `initMutationObserver()` callback — lines ~1191-1194
- `reset()` — lines ~1758-1760
- `subscribeToPath()` initial call — line ~1306

- [ ] **Step 1: Write failing tests**

```typescript
// In packages/core/test/form.test.ts, add a describe block:
describe('subscriber exception isolation', () => {
  it('a throwing global subscriber does not prevent other subscribers from firing', async () => {
    const form = createForm({ initialValues: { name: '' } });
    const received: string[] = [];
    form.subscribe(() => { throw new Error('boom'); });
    form.subscribe(() => { received.push('second'); });
    form.set('name', 'alice');
    expect(received).toEqual(['second']);
  });

  it('a throwing path subscriber does not prevent other path subscribers from firing', () => {
    const form = createForm({ initialValues: { name: '' } });
    const received: string[] = [];
    // skip first (initial) call for the throwing subscriber
    let calls = 0;
    form.subscribeToPath('name', () => {
      if (calls++ > 0) throw new Error('boom');
    });
    form.subscribeToPath('name', (v) => { received.push(v as string); });
    form.set('name', 'alice');
    expect(received).toContain('alice');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm exec vitest run packages/core/test/form.test.ts -t "subscriber exception isolation"
```

Expected: FAIL — second subscriber never fires because the first throw propagates.

- [ ] **Step 3: Wrap every `for..of globalSubscribers` loop in try-catch**

In `packages/core/src/index.ts`, replace all patterns of the form:
```typescript
for (const fn of globalSubscribers) fn(snapshot);
```
with:
```typescript
for (const fn of globalSubscribers) {
  try { fn(snapshot); } catch (err) { console.error('[NeutroForm] subscriber threw:', err); }
}
```

There are 7 occurrences total. Search for `for (const fn of globalSubscribers)` to find them all.

- [ ] **Step 4: Wrap the inner `cb` loop in `notifyPathSubscribers`**

Replace:
```typescript
for (const cb of listeners)
  cb(val, { error: errors[p], touched: touched[p], dirty: dirty[p] });
```
with:
```typescript
for (const cb of listeners) {
  try {
    cb(val, { error: errors[p], touched: touched[p], dirty: dirty[p] });
  } catch (err) {
    console.error('[NeutroForm] path subscriber threw:', err);
  }
}
```

- [ ] **Step 5: Wrap the initial call in `subscribeToPath`**

Line ~1306:
```typescript
fn(deepClone(currentVal), { error: errors[path], touched: touched[path], dirty: dirty[path] });
```
becomes:
```typescript
try {
  fn(deepClone(currentVal), { error: errors[path], touched: touched[path], dirty: dirty[path] });
} catch (err) {
  console.error('[NeutroForm] path subscriber threw on initial call:', err);
}
```

- [ ] **Step 6: Run tests and verify they pass**

```bash
pnpm exec vitest run packages/core/test/form.test.ts -t "subscriber exception isolation"
```

Expected: PASS

- [ ] **Step 7: Run full test suite to catch regressions**

```bash
pnpm test
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/index.ts packages/core/test/form.test.ts
git commit -m "fix(core): isolate subscriber exceptions so one throw doesn't block others"
```

---

### Task 2: Format Callback Exception Guard

**Files:**
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/form.test.ts`

In `connect()`, the `format` callback (line ~1373) is called without a try-catch. A throwing formatter crashes the input event handler entirely, leaving the input unresponsive.

- [ ] **Step 1: Write failing test**

```typescript
it('a throwing format callback does not crash the connect() event handler', () => {
  const form = createForm({ initialValues: { phone: '' } });
  const el = document.createElement('input');
  document.body.appendChild(el);
  form.connect('phone', el, {
    format: () => { throw new Error('format error'); }
  });
  // Simulate user typing — should NOT throw
  expect(() => {
    el.value = '123';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }).not.toThrow();
  document.body.removeChild(el);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm exec vitest run packages/core/test/form.test.ts -t "throwing format callback"
```

Expected: FAIL (test throws).

- [ ] **Step 3: Wrap format call in try-catch**

Find in `connect()` around line 1373:
```typescript
const formatted = options.format(rawVal);
target.value = formatted;
const diff = formatted.length - rawVal.length;
```
Replace with:
```typescript
let formatted = rawVal;
try {
  formatted = options.format(rawVal);
} catch (err) {
  console.error('[NeutroForm] format() threw:', err);
}
target.value = formatted;
const diff = formatted.length - rawVal.length;
```

- [ ] **Step 4: Run tests**

```bash
pnpm exec vitest run packages/core/test/form.test.ts -t "throwing format callback"
```

Expected: PASS

- [ ] **Step 5: Full suite**

```bash
pnpm test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/index.ts packages/core/test/form.test.ts
git commit -m "fix(core): guard connect() format callback against exceptions"
```

---

### Task 3: Validator Return Type Validation

**Files:**
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/form.test.ts`

`runValidation` spreads `validationResult` into `builtInErrors` without checking it is actually an object. If the validator accidentally returns `null`, `undefined`, a string, or a number, the spread silently produces garbage or throws.

- [ ] **Step 1: Write failing test**

```typescript
describe('validator return type guard', () => {
  it('does not crash when validator returns null', async () => {
    const form = createForm({
      initialValues: { name: '' },
      validator: () => null as any,
    });
    await expect(form.validate()).resolves.toBe(true);
  });

  it('does not crash when validator returns a string', async () => {
    const form = createForm({
      initialValues: { name: '' },
      validator: () => 'oops' as any,
    });
    await expect(form.validate()).resolves.toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify failures**

```bash
pnpm exec vitest run packages/core/test/form.test.ts -t "validator return type guard"
```

Expected: FAIL or unexpected behaviour.

- [ ] **Step 3: Add guard after `config.validator(...)` call**

In `runValidation`, after the line:
```typescript
const validationResult = config.validator(valuesSnapshot, expandedScope, abortController.signal);
```

Add:
```typescript
const isValidReturn = (r: unknown) =>
  r !== null && r !== undefined && typeof r === 'object' && !Array.isArray(r);
```

Then for the sync branch, replace:
```typescript
const combined = { ...builtInErrors, ...validationResult };
```
with:
```typescript
const safeResult = isValidReturn(validationResult)
  ? (validationResult as Record<string, string>)
  : {};
if (!isValidReturn(validationResult))
  console.error('[NeutroForm] validator must return Record<string,string> or Promise<Record<string,string>>');
const combined = { ...builtInErrors, ...safeResult };
```

For the async branch (inside `resolve(await validationResult)`), replace:
```typescript
resolve(await validationResult);
```
with:
```typescript
const result = await validationResult;
resolve(isValidReturn(result) ? result as Record<string, string> : {});
```

And ensure the `isValidReturn` helper is defined before `runValidation` (or inline it).

- [ ] **Step 4: Run tests**

```bash
pnpm exec vitest run packages/core/test/form.test.ts -t "validator return type guard"
```

Expected: PASS

- [ ] **Step 5: Full suite**

```bash
pnpm test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/index.ts packages/core/test/form.test.ts
git commit -m "fix(core): guard against invalid validator return types"
```

---

### Task 4: Prototype Pollution Protection

**Files:**
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/form.test.ts`

`setNestedValue` and `getNestedValue` split the path on `.` and use each segment as an object key. A path like `__proto__.polluted` or `constructor.prototype.evil` can corrupt `Object.prototype`.

- [ ] **Step 1: Write failing test**

```typescript
describe('prototype pollution protection', () => {
  it('setNestedValue blocks __proto__ path segment', () => {
    const form = createForm({ initialValues: { name: '' } as any });
    expect(() => form.set('__proto__.polluted', 'yes' as any)).not.toThrow();
    expect((Object.prototype as any).polluted).toBeUndefined();
  });

  it('setNestedValue blocks constructor.prototype path', () => {
    const form = createForm({ initialValues: { name: '' } as any });
    expect(() => form.set('constructor.prototype.evil', 'yes' as any)).not.toThrow();
    expect((Object.prototype as any).evil).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm exec vitest run packages/core/test/form.test.ts -t "prototype pollution"
```

Expected: FAIL (test passes unexpectedly, or Object.prototype is mutated — clean up after with `delete (Object.prototype as any).polluted`).

- [ ] **Step 3: Add dangerous-key guard to `setNestedValue` and `getNestedValue`**

At the top of the file (after the existing utility declarations), add:
```typescript
const DANGEROUS_PATH_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
```

In `getNestedValue`, add an early return per segment:
```typescript
export function getNestedValue(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (DANGEROUS_PATH_KEYS.has(part)) return undefined;
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}
```

In `setNestedValue`, add a guard at the top:
```typescript
export function setNestedValue(obj: any, path: string, value: any): void {
  const parts = path.split('.');
  if (parts.some((p) => DANGEROUS_PATH_KEYS.has(p))) {
    console.error('[NeutroForm] Blocked dangerous path segment:', path);
    return;
  }
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    // ... (existing code unchanged)
  }
  current[parts[parts.length - 1]] = value;
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm exec vitest run packages/core/test/form.test.ts -t "prototype pollution"
```

Expected: PASS

- [ ] **Step 5: Full suite**

```bash
pnpm test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/index.ts packages/core/test/form.test.ts
git commit -m "fix(core): block prototype pollution via dangerous path segments"
```

---

### Task 5: CSS Selector Safety in `connect()`

**Files:**
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/form.test.ts`

In the `subscribeToPath` callback inside `connect()` (line ~1430):
```typescript
document.querySelector(`[data-error="${stringPath}"]`)
```
If `stringPath` contains `"`, the selector is syntactically broken and `querySelector` throws a `SyntaxError`. Paths can be developer-controlled strings that may originate from dynamic sources.

- [ ] **Step 1: Write failing test**

```typescript
it('connect() does not throw when path contains CSS-unsafe characters', () => {
  const form = createForm({ initialValues: {} as any });
  const el = document.createElement('input');
  document.body.appendChild(el);
  expect(() => {
    const unsafePath = 'field"name'; // quote breaks querySelector
    form.connect(unsafePath, el);
  }).not.toThrow();
  document.body.removeChild(el);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm exec vitest run packages/core/test/form.test.ts -t "CSS-unsafe characters"
```

Expected: FAIL (throws SyntaxError).

- [ ] **Step 3: Escape the attribute value in the selector**

Find the line inside the `subscribeToPath` callback in `connect()`:
```typescript
const errorContainer = document.querySelector(`[data-error="${stringPath}"]`);
```
Replace with:
```typescript
let errorContainer: Element | null = null;
try {
  errorContainer = document.querySelector(`[data-error="${stringPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`);
} catch {
  // path contains characters invalid in a CSS selector; skip aria-describedby wiring
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm exec vitest run packages/core/test/form.test.ts -t "CSS-unsafe characters"
```

Expected: PASS

- [ ] **Step 5: Full suite**

```bash
pnpm test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/index.ts packages/core/test/form.test.ts
git commit -m "fix(core): escape CSS selector in connect() to prevent SyntaxError on special-char paths"
```

---

### Task 6: Cycle Detection in `deepMerge`

**Files:**
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/form.test.ts`

The `deepMerge` function defined inside `createForm` (line ~876) has no circular reference guard. A cyclic `override` or `base` object causes infinite recursion and a stack overflow.

- [ ] **Step 1: Write failing test**

```typescript
it('hydrate() does not stack-overflow on circular persistence data', async () => {
  const circular: any = { name: 'alice' };
  circular.self = circular; // circular reference

  const adapter = {
    read: async () => circular,
    write: async () => {},
    clear: async () => {},
  };

  const form = createForm({
    initialValues: { name: '' },
    persistence: { adapter },
  });

  await expect(form.hydrate()).resolves.not.toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm exec vitest run packages/core/test/form.test.ts -t "circular persistence data"
```

Expected: FAIL with stack overflow / Maximum call stack exceeded.

- [ ] **Step 3: Add `seen` WeakSet parameter to deepMerge**

Replace the `deepMerge` definition (inside `createForm`, around line 876):
```typescript
const deepMerge = (base: any, override: any, seen = new WeakSet()): any => {
  if (override === null || override === undefined) return base;
  if (typeof override !== 'object' || Array.isArray(override)) return override;
  if (typeof base !== 'object' || base === null) return override;
  if (seen.has(override)) return base;
  seen.add(override);
  const result: any = { ...base };
  for (const key of Object.keys(override)) {
    result[key] = deepMerge(base[key], override[key], seen);
  }
  return result;
};
```

- [ ] **Step 4: Run tests**

```bash
pnpm exec vitest run packages/core/test/form.test.ts -t "circular persistence data"
```

Expected: PASS

- [ ] **Step 5: Full suite**

```bash
pnpm test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/index.ts packages/core/test/form.test.ts
git commit -m "fix(core): add cycle detection to deepMerge to prevent stack overflow"
```

---

### Task 7: `asyncDebounceMs` Validation

**Files:**
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/form.test.ts`

`config.asyncDebounceMs ?? 300` is passed directly to `setTimeout`. Passing `NaN`, `Infinity`, or a negative number leads to undefined browser behaviour (`NaN` is treated as 0, `Infinity` as a very large delay, negative numbers trigger immediately). The engine should warn and clamp.

- [ ] **Step 1: Write failing test**

```typescript
describe('asyncDebounceMs validation', () => {
  it('does not crash when asyncDebounceMs is NaN', async () => {
    const form = createForm({
      initialValues: { name: '' },
      validator: async () => ({}),
      asyncDebounceMs: NaN,
    });
    await expect(form.validate()).resolves.toBe(true);
  });

  it('does not crash when asyncDebounceMs is negative', async () => {
    const form = createForm({
      initialValues: { name: '' },
      validator: async () => ({}),
      asyncDebounceMs: -100,
    });
    await expect(form.validate()).resolves.toBe(true);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
pnpm exec vitest run packages/core/test/form.test.ts -t "asyncDebounceMs validation"
```

Expected: tests may pass (NaN / negative both happen to work in jsdom) but the engine should warn. If they currently produce unintended delays, they'll fail.

- [ ] **Step 3: Add validation and clamping at `createForm` init time**

Add right after the `preComputedScopes` assignment (around line 913):
```typescript
const rawDebounce = config.asyncDebounceMs ?? 300;
const asyncDebounceMs = Number.isFinite(rawDebounce) && rawDebounce >= 0
  ? rawDebounce
  : (() => {
      console.warn(
        `[NeutroForm] asyncDebounceMs must be a finite non-negative number (got ${rawDebounce}); using 300ms`
      );
      return 300;
    })();
```

Then in `runValidation`, replace:
```typescript
}, config.asyncDebounceMs ?? 300);
```
with:
```typescript
}, asyncDebounceMs);
```

- [ ] **Step 4: Run tests**

```bash
pnpm exec vitest run packages/core/test/form.test.ts -t "asyncDebounceMs validation"
```

Expected: PASS (and a console.warn fires for invalid values).

- [ ] **Step 5: Full suite**

```bash
pnpm test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/index.ts packages/core/test/form.test.ts
git commit -m "fix(core): validate and clamp asyncDebounceMs to finite non-negative value"
```

---

### Task 8: Concurrent `hydrate()` Guard

**Files:**
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/form.test.ts`

If `hydrate()` is called twice concurrently (e.g., React StrictMode double-effect, or calling it from two lifecycle hooks), both invocations race: the second `read()` can overwrite in-flight state from the first.

- [ ] **Step 1: Write failing test**

```typescript
it('concurrent hydrate() calls do not double-install persistence subscriber', async () => {
  let writeCount = 0;
  const adapter = {
    read: async () => ({ name: 'stored' }),
    write: async () => { writeCount++; },
    clear: async () => {},
  };

  const form = createForm({
    initialValues: { name: '' },
    persistence: { adapter, debounceMs: 0 },
  });

  // Two concurrent hydrate() calls
  await Promise.all([form.hydrate(), form.hydrate()]);

  // Only one persistence subscription should be active; set triggers exactly 1 write
  writeCount = 0;
  form.set('name', 'alice');
  // allow microtasks to flush
  await new Promise((r) => setTimeout(r, 10));
  expect(writeCount).toBe(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm exec vitest run packages/core/test/form.test.ts -t "concurrent hydrate"
```

Expected: FAIL (`writeCount` may be 2 or more because two subscriptions installed).

- [ ] **Step 3: Add `isHydrating` flag**

Add near the top of `createForm` (alongside the other state vars):
```typescript
let isHydrating = false;
```

Then wrap the body of `hydrate()`:
```typescript
hydrate: async (): Promise<void> => {
  const cfg = config.persistence;
  if (!cfg) return;
  if (isHydrating) return;
  isHydrating = true;
  try {
    // ... existing implementation unchanged ...
  } finally {
    isHydrating = false;
  }
},
```

- [ ] **Step 4: Run tests**

```bash
pnpm exec vitest run packages/core/test/form.test.ts -t "concurrent hydrate"
```

Expected: PASS

- [ ] **Step 5: Full suite**

```bash
pnpm test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/index.ts packages/core/test/form.test.ts
git commit -m "fix(core): guard hydrate() against concurrent calls with isHydrating flag"
```

---

### Task 9: `extractAllPaths` Max Recursion Depth

**Files:**
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/form.test.ts`

`extractAllPaths` is recursive with no depth limit. A heavily nested object (e.g., 1000 levels deep) causes a stack overflow.

- [ ] **Step 1: Write failing test**

```typescript
it('extractAllPaths does not stack-overflow on deeply nested objects', () => {
  let deep: any = { value: 'leaf' };
  for (let i = 0; i < 500; i++) deep = { nested: deep };

  const form = createForm({ initialValues: { data: deep } });
  expect(() => form.validate()).not.toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails (or is slow/crashes)**

```bash
pnpm exec vitest run packages/core/test/form.test.ts -t "stack-overflow on deeply nested"
```

Expected: possible timeout or RangeError: Maximum call stack exceeded.

- [ ] **Step 3: Add depth guard to `extractAllPaths`**

Replace the exported function signature and first branch:
```typescript
export function extractAllPaths(obj: any, prefix = '', _depth = 0): string[] {
  if (_depth > 50) return prefix ? [prefix] : [];
  if (
    obj === null ||
    typeof obj !== 'object' ||
    obj instanceof Date ||
    (typeof File !== 'undefined' && obj instanceof File)
  ) {
    return prefix ? [prefix] : [];
  }
  const paths: string[] = [];
  if (prefix) paths.push(prefix);
  for (const key in obj) {
    if (Object.hasOwn(obj, key)) {
      const currentPath = prefix ? `${prefix}.${key}` : key;
      if (Array.isArray(obj[key])) {
        paths.push(currentPath);
        obj[key].forEach((item: any, index: number) => {
          paths.push(...extractAllPaths(item, `${currentPath}.${index}`, _depth + 1));
        });
      } else {
        paths.push(...extractAllPaths(obj[key], currentPath, _depth + 1));
      }
    }
  }
  return paths;
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm exec vitest run packages/core/test/form.test.ts -t "stack-overflow on deeply nested"
```

Expected: PASS

- [ ] **Step 5: Full suite**

```bash
pnpm test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/index.ts packages/core/test/form.test.ts
git commit -m "fix(core): add depth limit to extractAllPaths to prevent stack overflow"
```

---

### Task 10: Lint, Build & Version Bump

**Files:**
- Modify: `packages/alias/package.json` (version bump)
- Modify: `packages/core/package.json` (version bump if needed)

- [ ] **Step 1: Run lint to catch any issues from the new code**

```bash
pnpm lint
```

Fix any Biome complaints before proceeding.

- [ ] **Step 2: Run full build**

```bash
pnpm build
```

Expected: all packages build cleanly.

- [ ] **Step 3: Run full test suite one final time**

```bash
pnpm test
```

Expected: all pass.

- [ ] **Step 4: Bump version to 0.3.0**

In `packages/alias/package.json`:
```json
"version": "0.3.0"
```

- [ ] **Step 5: Commit version bump**

```bash
git add packages/alias/package.json
git commit -m "chore: bump version to 0.3.0"
```
