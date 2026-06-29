# @neutro/form-testing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@neutro/form-testing` — a focused set of helpers (`fillForm`, `blurField`, `triggerValidation`, `createFormFixture`) that make testing NeutroForm instances ergonomic without requiring fake timers or knowledge of internal API details.

**Architecture:** Single file `packages/testing/src/index.ts` exports three standalone functions and one fixture factory. The fixture factory wraps `createForm` with `asyncDebounceMs` defaulting to 0 and pre-binds the standalone functions to the form instance. Standalone functions are also exported directly for integration tests where the form is created outside the test utility. The alias package (`@neutro/form`) gets a new `./testing` export entry.

**Tech Stack:** TypeScript, tsup (ESM + CJS + `.d.ts`), vitest (tests run via root `pnpm test`), `@neutro/form-core` (workspace dependency).

---

## File map

| Action | Path | Purpose |
|---|---|---|
| Create | `packages/testing/package.json` | Package metadata, deps |
| Create | `packages/testing/tsup.config.ts` | Build config |
| Create | `packages/testing/src/index.ts` | All exports — standalone functions + fixture factory |
| Create | `packages/testing/test/index.test.ts` | Full test suite |
| Modify | `vitest.config.ts` | Add `@neutro/form-testing` alias pointing to source |
| Create | `packages/alias/src/testing.ts` | Re-export everything from `@neutro/form-testing` |
| Modify | `packages/alias/package.json` | Add `./testing` to exports + typesVersions + devDependencies |
| Modify | `packages/alias/tsup.config.ts` | Add `testing` entry point |

---

### Task 1: Scaffold the package and wire vitest

**Files:**
- Create: `packages/testing/package.json`
- Create: `packages/testing/tsup.config.ts`
- Create: `packages/testing/src/index.ts` (stub)
- Modify: `vitest.config.ts`

- [ ] **Step 1: Create `packages/testing/package.json`**

```json
{
  "name": "@neutro/form-testing",
  "version": "0.0.1",
  "type": "module",
  "sideEffects": false,
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsup"
  },
  "dependencies": {
    "@neutro/form-core": "workspace:*"
  },
  "devDependencies": {
    "tsup": "^8.0.0"
  },
  "private": true
}
```

- [ ] **Step 2: Create `packages/testing/tsup.config.ts`**

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  external: ['@neutro/form-core'],
});
```

- [ ] **Step 3: Create `packages/testing/src/index.ts` as an empty stub**

```typescript
export {};
```

- [ ] **Step 4: Register the new workspace package**

```bash
pnpm install
```

Expected: pnpm-lock.yaml updates to include `@neutro/form-testing`. No errors.

- [ ] **Step 5: Add `@neutro/form-testing` alias to `vitest.config.ts`**

Replace the entire file with:

```typescript
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@neutro/form-core': resolve(__dirname, 'packages/core/src/index.ts'),
      '@neutro/form-testing': resolve(__dirname, 'packages/testing/src/index.ts'),
    },
  },
});
```

- [ ] **Step 6: Commit**

```bash
git add packages/testing/package.json packages/testing/tsup.config.ts packages/testing/src/index.ts vitest.config.ts pnpm-lock.yaml
git commit -m "feat(testing): scaffold @neutro/form-testing package"
```

---

### Task 2: TDD — standalone functions (`fillForm`, `blurField`, `triggerValidation`)

**Files:**
- Create: `packages/testing/test/index.test.ts`
- Modify: `packages/testing/src/index.ts`

- [ ] **Step 1: Write failing tests for the three standalone functions**

Create `packages/testing/test/index.test.ts`:

```typescript
import { createForm } from '@neutro/form-core';
import { describe, expect, it } from 'vitest';
import { blurField, fillForm, triggerValidation } from '@neutro/form-testing';

// ---------------------------------------------------------------------------
// fillForm
// ---------------------------------------------------------------------------

describe('fillForm', () => {
  it('sets multiple values', () => {
    const form = createForm({ initialValues: { email: '', name: '' } });
    fillForm(form, { email: 'alice@example.com', name: 'Alice' });
    expect(form.get('email')).toBe('alice@example.com');
    expect(form.get('name')).toBe('Alice');
  });

  it('batches all sets into a single notification', () => {
    const form = createForm({ initialValues: { email: '', name: '' } });
    let notifyCount = 0;
    form.subscribe(() => {
      notifyCount++;
    });
    notifyCount = 0; // reset after the initial subscribe fire
    fillForm(form, { email: 'alice@example.com', name: 'Alice' });
    expect(notifyCount).toBe(1);
  });

  it('accepts nested dot-path strings', () => {
    const form = createForm({ initialValues: { user: { email: '' } } });
    fillForm(form, { 'user.email': 'alice@example.com' });
    expect(form.get('user.email')).toBe('alice@example.com');
  });
});

// ---------------------------------------------------------------------------
// blurField
// ---------------------------------------------------------------------------

describe('blurField', () => {
  it('marks the field as touched', () => {
    const form = createForm({ initialValues: { email: '' } });
    blurField(form, 'email');
    expect(form.getState().touched.email).toBe(true);
  });

  it('does not change the field value', () => {
    const form = createForm({ initialValues: { email: 'original@example.com' } });
    blurField(form, 'email');
    expect(form.get('email')).toBe('original@example.com');
  });

  it('does not mark other fields as touched', () => {
    const form = createForm({ initialValues: { email: '', name: '' } });
    blurField(form, 'email');
    expect(form.getState().touched.email).toBe(true);
    expect(form.getState().touched.name).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// triggerValidation
// ---------------------------------------------------------------------------

describe('triggerValidation', () => {
  it('returns true when the form is valid', async () => {
    const form = createForm({
      initialValues: { email: 'alice@example.com' },
      asyncDebounceMs: 0,
      rules: { email: ['required', 'email'] },
    });
    const result = await triggerValidation(form);
    expect(result).toBe(true);
  });

  it('returns false and populates errors when the form is invalid', async () => {
    const form = createForm({
      initialValues: { email: '' },
      asyncDebounceMs: 0,
      rules: { email: ['required'] },
    });
    const result = await triggerValidation(form);
    expect(result).toBe(false);
    expect(form.getState().errors.email).toBe('Required');
  });

  it('validates only the scoped paths when provided', async () => {
    const form = createForm({
      initialValues: { email: '', name: '' },
      asyncDebounceMs: 0,
      rules: { email: ['required'], name: ['required'] },
    });
    await triggerValidation(form, ['email']);
    expect(form.getState().errors.email).toBe('Required');
    expect(form.getState().errors.name).toBeUndefined();
  });

  it('resolves immediately with an async validator when asyncDebounceMs is 0', async () => {
    const form = createForm({
      initialValues: { email: '' },
      asyncDebounceMs: 0,
      validator: async (v) => (v.email ? {} : { email: 'Required' }),
    });
    const result = await triggerValidation(form);
    expect(result).toBe(false);
    expect(form.getState().errors.email).toBe('Required');
  });
});
```

- [ ] **Step 2: Run the tests — expect them to fail**

```bash
pnpm exec vitest run packages/testing/test/index.test.ts
```

Expected: FAIL — `fillForm is not a function` (or similar import error since `src/index.ts` is just `export {};`).

- [ ] **Step 3: Implement the standalone functions in `packages/testing/src/index.ts`**

```typescript
import { createForm, type FormConfig, type FormInstance } from '@neutro/form-core';

export function fillForm<T extends object>(
  form: FormInstance<T>,
  values: Partial<Record<string, unknown>>
): void {
  form.batch(() => {
    for (const [path, value] of Object.entries(values)) {
      form.set(path as any, value);
    }
  });
}

export function blurField<T extends object>(form: FormInstance<T>, path: string): void {
  form.set(path as any, form.get(path as any), { touch: true });
}

export function triggerValidation<T extends object>(
  form: FormInstance<T>,
  paths?: string[]
): Promise<boolean> {
  return form.validate(paths);
}

export interface FormFixture<T extends object> {
  form: FormInstance<T>;
  fill(values: Partial<Record<string, unknown>>): void;
  blur(path: string): void;
  validate(paths?: string[]): Promise<boolean>;
  cleanup(): void;
}

export function createFormFixture<T extends object>(config: FormConfig<T>): FormFixture<T> {
  const form = createForm<T>({ ...config, asyncDebounceMs: config.asyncDebounceMs ?? 0 });
  return {
    form,
    fill: (values) => fillForm(form, values),
    blur: (path) => blurField(form, path),
    validate: (paths) => triggerValidation(form, paths),
    cleanup: () => form.destroy(),
  };
}
```

- [ ] **Step 4: Run the standalone tests — expect them to pass**

```bash
pnpm exec vitest run packages/testing/test/index.test.ts
```

Expected: all `fillForm`, `blurField`, and `triggerValidation` tests pass. The `createFormFixture` tests have not been written yet — that's Task 3.

- [ ] **Step 5: Commit**

```bash
git add packages/testing/test/index.test.ts packages/testing/src/index.ts
git commit -m "feat(testing): implement fillForm, blurField, triggerValidation"
```

---

### Task 3: TDD — `createFormFixture`

**Files:**
- Modify: `packages/testing/test/index.test.ts`
- No source changes needed (already implemented in Task 2 Step 3)

- [ ] **Step 1: Append `createFormFixture` tests to `packages/testing/test/index.test.ts`**

Add this block at the end of the file (after the `triggerValidation` describe block):

```typescript
// ---------------------------------------------------------------------------
// createFormFixture
// ---------------------------------------------------------------------------

describe('createFormFixture', () => {
  it('defaults asyncDebounceMs to 0 so async validators resolve without fake timers', async () => {
    // If asyncDebounceMs were 300 (the core default), this test would time out.
    const fixture = createFormFixture({
      initialValues: { email: '' },
      validator: async (v) => (v.email ? {} : { email: 'Required' }),
    });
    const result = await fixture.validate();
    expect(result).toBe(false);
    fixture.cleanup();
  });

  it('respects an explicit asyncDebounceMs override', async () => {
    const fixture = createFormFixture({
      initialValues: { email: '' },
      asyncDebounceMs: 0,
      rules: { email: ['required'] },
    });
    const result = await fixture.validate();
    expect(result).toBe(false);
    fixture.cleanup();
  });

  it('fill sets multiple values on the form', () => {
    const fixture = createFormFixture({ initialValues: { email: '', name: '' } });
    fixture.fill({ email: 'alice@example.com', name: 'Alice' });
    expect(fixture.form.get('email')).toBe('alice@example.com');
    expect(fixture.form.get('name')).toBe('Alice');
    fixture.cleanup();
  });

  it('blur marks a field as touched without changing its value', () => {
    const fixture = createFormFixture({ initialValues: { email: 'x@example.com' } });
    fixture.blur('email');
    expect(fixture.form.getState().touched.email).toBe(true);
    expect(fixture.form.get('email')).toBe('x@example.com');
    fixture.cleanup();
  });

  it('validate returns false and sets errors for invalid fields', async () => {
    const fixture = createFormFixture({
      initialValues: { email: '' },
      rules: { email: ['required'] },
    });
    const result = await fixture.validate();
    expect(result).toBe(false);
    expect(fixture.form.getState().errors.email).toBe('Required');
    fixture.cleanup();
  });

  it('validate returns true after valid values are filled', async () => {
    const fixture = createFormFixture({
      initialValues: { email: '' },
      rules: { email: ['required', 'email'] },
    });
    fixture.fill({ email: 'alice@example.com' });
    const result = await fixture.validate();
    expect(result).toBe(true);
    expect(fixture.form.getState().errors).toEqual({});
    fixture.cleanup();
  });

  it('validate accepts scoped paths', async () => {
    const fixture = createFormFixture({
      initialValues: { email: '', name: '' },
      rules: { email: ['required'], name: ['required'] },
    });
    await fixture.validate(['email']);
    expect(fixture.form.getState().errors.email).toBe('Required');
    expect(fixture.form.getState().errors.name).toBeUndefined();
    fixture.cleanup();
  });

  it('cleanup destroys the form — subscribers stop receiving updates', () => {
    const fixture = createFormFixture({ initialValues: { email: '' } });
    let callCount = 0;
    fixture.form.subscribe(() => {
      callCount++;
    });
    callCount = 0; // reset after initial subscribe fire
    fixture.cleanup();
    fixture.form.set('email', 'x'); // no-op after destroy
    expect(callCount).toBe(0);
  });

  it('exposes the raw FormInstance on fixture.form', () => {
    const fixture = createFormFixture({ initialValues: { email: '' } });
    expect(typeof fixture.form.getState).toBe('function');
    expect(typeof fixture.form.validate).toBe('function');
    fixture.cleanup();
  });
});
```

Also add `createFormFixture` to the import line at the top of the file. Change:

```typescript
import { blurField, fillForm, triggerValidation } from '@neutro/form-testing';
```

to:

```typescript
import { blurField, createFormFixture, fillForm, triggerValidation } from '@neutro/form-testing';
```

- [ ] **Step 2: Run the tests — expect all to pass (implementation already exists)**

```bash
pnpm exec vitest run packages/testing/test/index.test.ts
```

Expected: all tests pass (standalone + fixture). The implementation was written in Task 2 Step 3.

- [ ] **Step 3: Run the full suite to verify no regressions**

```bash
pnpm test
```

Expected: all tests pass (existing 397 + new testing package tests).

- [ ] **Step 4: Run lint**

```bash
pnpm lint
```

Expected: no errors. If Biome flags anything in `packages/testing/`, fix it before committing (common: `noExplicitAny` is already off in biome.json, so `as any` casts in the implementation are fine).

- [ ] **Step 5: Commit**

```bash
git add packages/testing/test/index.test.ts packages/testing/src/index.ts
git commit -m "feat(testing): implement createFormFixture with full test coverage"
```

---

### Task 4: Wire up the alias package (`@neutro/form/testing`)

**Files:**
- Create: `packages/alias/src/testing.ts`
- Modify: `packages/alias/package.json`
- Modify: `packages/alias/tsup.config.ts`

- [ ] **Step 1: Create `packages/alias/src/testing.ts`**

```typescript
export * from '@neutro/form-testing';
```

- [ ] **Step 2: Add `@neutro/form-testing` devDependency to `packages/alias/package.json`**

In the `"devDependencies"` object, add:

```json
"@neutro/form-testing": "workspace:*"
```

The full `devDependencies` object becomes:

```json
"devDependencies": {
  "@neutro/form-core": "workspace:*",
  "@neutro/form-react": "workspace:*",
  "@neutro/form-svelte": "workspace:*",
  "@neutro/form-vue": "workspace:*",
  "@neutro/form-solid": "workspace:*",
  "@neutro/form-angular": "workspace:*",
  "@neutro/form-testing": "workspace:*",
  "tsup": "^8.0.0"
}
```

- [ ] **Step 3: Add `./testing` to `exports` and `typesVersions` in `packages/alias/package.json`**

In `"exports"`, add after `"./adapters/angular"`:

```json
"./testing": {
  "types": "./dist/testing.d.ts",
  "import": "./dist/testing.js",
  "require": "./dist/testing.cjs"
}
```

In `"typesVersions"` → `"*"`, add after `"adapters/angular"`:

```json
"testing": [
  "./dist/testing.d.ts"
]
```

- [ ] **Step 4: Add the `testing` entry to `packages/alias/tsup.config.ts`**

Replace the file with:

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    core: 'src/core.ts',
    devtools: 'src/devtools.ts',
    'adapters/react': 'src/adapters/react.ts',
    'adapters/svelte': 'src/adapters/svelte.ts',
    'adapters/vue': 'src/adapters/vue.ts',
    'adapters/solid': 'src/adapters/solid.ts',
    'adapters/angular': 'src/adapters/angular.ts',
    testing: 'src/testing.ts',
  },
  format: ['esm', 'cjs'],
  dts: { resolve: true },
  clean: true,
  external: [
    'react',
    'react-dom',
    'svelte',
    'svelte/store',
    'svelte/internal',
    'vue',
    'solid-js',
    'solid-js/store',
    '@angular/core',
  ],
});
```

- [ ] **Step 5: Run pnpm install to link the new workspace dep**

```bash
pnpm install
```

Expected: pnpm-lock.yaml updates. No errors.

- [ ] **Step 6: Build the testing package and the alias package**

```bash
pnpm --filter @neutro/form-testing run build
pnpm --filter @neutro/form run build
```

Expected: `packages/testing/dist/` is created with `index.js`, `index.cjs`, `index.d.ts`. `packages/alias/dist/testing.js` and `testing.cjs` and `testing.d.ts` are created.

- [ ] **Step 7: Commit**

```bash
git add packages/alias/src/testing.ts packages/alias/package.json packages/alias/tsup.config.ts pnpm-lock.yaml
git commit -m "feat(testing): expose @neutro/form/testing via alias package"
```

---

### Task 5: Final verification

**Files:** None new — verification only.

- [ ] **Step 1: Run the full test suite**

```bash
pnpm test
```

Expected: all tests pass. The new testing package tests are included automatically (vitest discovers `packages/testing/test/index.test.ts`).

- [ ] **Step 2: Run lint**

```bash
pnpm lint
```

Expected: no errors.

- [ ] **Step 3: Build all packages**

```bash
pnpm build
```

Expected: all packages build cleanly including `@neutro/form-testing` and the updated alias.

- [ ] **Step 4: Final commit if anything changed**

If any files changed during verification (unlikely), commit them:

```bash
git add -A
git commit -m "chore(testing): post-verification cleanup"
```
