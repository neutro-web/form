# @neutro/form-testing Design

## Goal

Provide a small, focused set of testing helpers that remove the primary friction points when writing tests against `createForm` instances: bulk value setup, async validation waiting, and field touch simulation.

## Architecture

A new package `@neutro/form-testing` at `packages/testing/`. Single peer dependency on `@neutro/form-core`. Zero runtime dependencies — this package never ships to production. Exposed in the alias package as `@neutro/form/testing`.

Build follows the existing adapter pattern: `tsup`, ESM + CJS + `.d.ts`, `sideEffects: false`.

## API

### Standalone functions

Exported independently for integration tests where the form is created outside a fixture.

```ts
// Batch-sets multiple values in one notify flush via form.batch()
fillForm<T extends object>(form: FormInstance<T>, values: Partial<Record<string, unknown>>): void

// Marks a field as touched at its current value via set(..., { touch: true }).
// Does NOT trigger validation — call triggerValidation() afterwards to assert errors.
blurField<T extends object>(form: FormInstance<T>, path: string): void

// Awaits form.validate() — thin wrapper for discoverability
triggerValidation<T extends object>(form: FormInstance<T>, paths?: string[]): Promise<boolean>
```

### `createFormFixture<T>(config)`

Creates a form with `asyncDebounceMs` defaulting to `0` (overridable), so async validators resolve immediately without fake timers. Returns `FormFixture<T>`.

```ts
interface FormFixture<T extends object> {
  form: FormInstance<T>                                         // raw instance
  fill(values: Partial<Record<string, unknown>>): void          // fillForm pre-bound
  blur(path: string): void                                      // blurField pre-bound
  validate(paths?: string[]): Promise<boolean>                  // triggerValidation pre-bound
  cleanup(): void                                               // calls form.destroy()
}
```

The fixture methods are exactly the standalone functions pre-bound to `fixture.form`. No logic duplication.

### Cleanup

`cleanup()` calls `form.destroy()`. Teams register it explicitly:

```ts
const fixture = createFormFixture({ initialValues: { email: '' } });
afterEach(() => fixture.cleanup());
```

## Intentional exclusions

- **Assertion helpers that call `expect()`** — couples to a specific test runner; teams use their runner's built-in matchers against `form.getState()` directly.
- **State accessor shortcuts** (`getErrors()`, `getValues()`) — `form.getState().errors` is already one property access; no ergonomics gap.
- **Submit helpers** — `await form.submit(handler)` has no friction; no wrapper needed.
- **Framework adapter shims** — framework-specific test utilities (React Testing Library, Vue Test Utils) already handle adapter-layer testing well. This package targets core form logic.

## File structure

```
packages/testing/
├── src/
│   └── index.ts          # all exports, single file
├── package.json
├── tsup.config.ts
└── tsconfig.json
```

`packages/alias/src/testing.ts` re-exports everything from `@neutro/form-testing`, registered in the alias `package.json` exports map under `"./testing"`.

## Usage examples

```ts
// Fixture path — 90% case
import { createFormFixture } from '@neutro/form-testing';

// Create fixture fresh per test via beforeEach — cleanup() calls form.destroy(),
// which makes the form inert; a new fixture is required for each test.
let fixture: ReturnType<typeof createFormFixture<{ email: string; name: string }>>;

beforeEach(() => {
  fixture = createFormFixture({
    initialValues: { email: '', name: '' },
    rules: { email: ['required', 'email'], name: ['required'] },
  });
});
afterEach(() => fixture.cleanup());

it('required rules fire on empty submit', async () => {
  await fixture.validate();
  // Both fields are empty — required rule fires first on each
  expect(fixture.form.getState().errors.email).toBe('Required');
  expect(fixture.form.getState().errors.name).toBe('Required');
});

it('email format rule fires when value is present but malformed', async () => {
  fixture.fill({ email: 'not-an-email', name: 'Alice' });
  await fixture.validate();
  expect(fixture.form.getState().errors.email).toBe('Must be a valid email address');
  expect(fixture.form.getState().errors.name).toBeUndefined();
});

it('clears errors after valid values are filled', async () => {
  await fixture.validate();
  fixture.fill({ email: 'alice@example.com', name: 'Alice' });
  await fixture.validate();
  expect(fixture.form.getState().errors).toEqual({});
});

it('blurField marks field touched; await validate to see resulting errors', async () => {
  // blur fires internal validation (unawaited); the explicit validate() below
  // is what we actually await — epoch tracking ensures it wins.
  fixture.blur('email');
  await fixture.validate(['email']);
  expect(fixture.form.getState().errors.email).toBe('Required');
});

// Standalone path — integration tests where form is created elsewhere
import { fillForm, triggerValidation } from '@neutro/form-testing';

const form = createForm({
  initialValues: { email: '' },
  asyncDebounceMs: 0,  // set explicitly when using standalone functions
  validator: (v) => (v.email.includes('@') ? {} : { email: 'Invalid email' }),
});
fillForm(form, { email: 'bad' });
const valid = await triggerValidation(form);
expect(valid).toBe(false);
expect(form.getState().errors.email).toBe('Invalid email');
```

## Package metadata

| Field | Value |
|---|---|
| npm name | `@neutro/form-testing` |
| Location | `packages/testing/` |
| Peer deps | `@neutro/form-core` |
| Runtime deps | none |
| Alias entry | `@neutro/form/testing` |
| Build output | ESM + CJS + `.d.ts` |
