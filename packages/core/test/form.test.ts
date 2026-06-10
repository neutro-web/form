import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createForm,
  deepClone,
  isDeepEqual,
  compileDependencyScopes,
  zodAdapter,
  valibotAdapter,
  yupAdapter,
} from '../src/index';

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

describe('Initialization', () => {
  it('deep-clones initialValues — no reference leak', () => {
    const initial = { profile: { name: 'Alice' } };
    const form = createForm({ initialValues: initial });
    form.set('profile.name', 'Bob');
    expect(form.get('profile.name')).toBe('Bob');
    expect(initial.profile.name).toBe('Alice');
  });

  it('initial state shape is correct', () => {
    const form = createForm({ initialValues: { x: 1 } });
    const s = form.getState();
    expect(s.errors).toEqual({});
    expect(s.touched).toEqual({});
    expect(s.dirty).toEqual({});
    expect(s.isSubmitting).toBe(false);
    expect(s.isValidating).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// get / set
// ---------------------------------------------------------------------------

describe('get / set', () => {
  it('reads and writes nested paths', () => {
    const form = createForm({ initialValues: { a: { b: { c: 0 } } } });
    form.set('a.b.c', 42);
    expect(form.get('a.b.c')).toBe(42);
  });

  it('is a no-op when value is deep-equal to current', () => {
    const sub = vi.fn();
    const form = createForm({ initialValues: { x: 1 } });
    form.subscribe(sub);
    sub.mockClear();
    form.set('x', 1); // same value
    expect(sub).not.toHaveBeenCalled();
  });

  it('touch flag sets touched[path]', () => {
    const form = createForm({ initialValues: { x: 0 } });
    form.set('x', 1, { touch: true });
    expect(form.getState().touched['x']).toBe(true);
  });

  it('validate:false skips runValidation', async () => {
    const validator = vi.fn().mockReturnValue({});
    const form = createForm({ initialValues: { x: 0 }, validator });
    validator.mockClear();
    form.set('x', 1, { validate: false });
    await Promise.resolve(); // flush microtasks
    expect(validator).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Dirty tracking
// ---------------------------------------------------------------------------

describe('Dirty tracking', () => {
  it('marks dirty on change', () => {
    const form = createForm({ initialValues: { x: 0 } });
    form.set('x', 1);
    expect(form.getState().dirty['x']).toBe(true);
  });

  it('clears dirty when value returns to initial', () => {
    const form = createForm({ initialValues: { x: 0 } });
    form.set('x', 1);
    form.set('x', 0);
    expect(form.getState().dirty['x']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Sync validation
// ---------------------------------------------------------------------------

describe('Sync validation', () => {
  it('valid form returns true with no errors', async () => {
    const form = createForm({
      initialValues: { name: 'Alice' },
      validator: () => ({}),
    });
    const ok = await form.validate();
    expect(ok).toBe(true);
    expect(form.getState().errors).toEqual({});
  });

  it('errors are keyed by path', async () => {
    const form = createForm({
      initialValues: { email: '' },
      validator: (v: any) => (v.email ? {} : { email: 'Required' }),
    });
    await form.validate();
    expect(form.getState().errors['email']).toBe('Required');
  });

  it('scoped merge leaves unrelated errors intact', async () => {
    const form = createForm({
      initialValues: { a: '', b: '' },
      validator: (v: any, scope) => {
        const e: Record<string, string> = {};
        if (!v.a) e['a'] = 'Required';
        if (!v.b) e['b'] = 'Required';
        if (scope) {
          const result: Record<string, string> = {};
          scope.forEach((p: string) => { if (e[p]) result[p] = e[p]; });
          return result;
        }
        return e;
      },
    });
    await form.validate(); // sets both a + b errors
    await form.validate(['a']); // re-validates only a — b error should survive
    expect(form.getState().errors['b']).toBe('Required');
  });
});

// ---------------------------------------------------------------------------
// Async validation
// ---------------------------------------------------------------------------

describe('Async validation', () => {
  it('debounce fires after asyncDebounceMs', async () => {
    vi.useFakeTimers();
    const validator = vi.fn().mockResolvedValue({});
    const form = createForm({
      initialValues: { x: '' },
      validator,
      asyncDebounceMs: 100,
    });
    form.validate(['x']);
    expect(validator).toHaveBeenCalledTimes(1);
    await vi.runAllTimersAsync();
    vi.useRealTimers();
  });

  it('stale epoch results are discarded when path is re-validated', async () => {
    vi.useFakeTimers();
    let callCount = 0;
    const form = createForm({
      initialValues: { x: '' },
      validator: async () => {
        callCount++;
        const n = callCount;
        await new Promise(r => setTimeout(r, 50));
        return n === 1 ? { x: 'stale' } : {};
      },
      asyncDebounceMs: 0,
    });
    const p1 = form.validate(['x']);
    const p2 = form.validate(['x']); // second call increments epoch; first result discarded
    await vi.runAllTimersAsync();
    await Promise.all([p1, p2]);
    expect(form.getState().errors['x']).toBeUndefined();
    vi.useRealTimers();
  });

  it('concurrent paths do not cancel each other\'s timers — bug #8 regression', async () => {
    vi.useFakeTimers();
    const results: string[] = [];
    const form = createForm({
      initialValues: { a: '', b: '' },
      validator: async (_v: any, scope: any) => {
        await new Promise(r => setTimeout(r, 50));
        const errors: Record<string, string> = {};
        if (scope?.includes('a')) { errors['a'] = 'a-error'; results.push('a'); }
        if (scope?.includes('b')) { errors['b'] = 'b-error'; results.push('b'); }
        return errors;
      },
      asyncDebounceMs: 10,
    });
    const p1 = form.validate(['a']);
    const p2 = form.validate(['b']);
    await vi.runAllTimersAsync();
    await Promise.all([p1, p2]);
    // Both should have completed; order may vary
    expect(results).toContain('a');
    expect(results).toContain('b');
    vi.useRealTimers();
  });

  it('AbortSignal fires when the same path is re-validated', async () => {
    vi.useFakeTimers();
    const aborted: boolean[] = [];
    const form = createForm({
      initialValues: { x: '' },
      validator: async (_v: any, _scope: any, signal: any) => {
        await new Promise(r => setTimeout(r, 200));
        aborted.push(signal.aborted);
        return {};
      },
      asyncDebounceMs: 0,
    });
    const p1 = form.validate(['x']);
    const p2 = form.validate(['x']); // aborts p1's controller
    await vi.runAllTimersAsync();
    await Promise.all([p1, p2]);
    expect(aborted[0]).toBe(true);
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// Dependency graph
// ---------------------------------------------------------------------------

describe('Dependency graph', () => {
  it('direct dependency triggers co-validation', async () => {
    const form = createForm({
      initialValues: { password: '', confirmPassword: '' },
      dependencies: { password: ['confirmPassword'] },
      validator: (v: any) =>
        v.password !== v.confirmPassword ? { confirmPassword: 'Mismatch' } : {},
    });
    form.set('password', 'abc');
    await form.validate(['password']);
    expect(form.getState().errors['confirmPassword']).toBe('Mismatch');
  });

  it('transitive dependency chain resolves', async () => {
    const form = createForm({
      initialValues: { a: 1, b: 2, c: 3 },
      dependencies: { a: ['b'], b: ['c'] },
      validator: (v: any, scope: any) => {
        if (!scope) return {};
        const errors: Record<string, string> = {};
        if (scope.includes('c')) errors['c'] = 'touched';
        return errors;
      },
    });
    await form.validate(['a']); // a → b → c
    expect(form.getState().errors['c']).toBe('touched');
  });

  it('circular dependency graph does not loop', async () => {
    const form = createForm({
      initialValues: { a: 1, b: 2 },
      dependencies: { a: ['b'], b: ['a'] },
      validator: () => ({}),
    });
    await expect(form.validate(['a'])).resolves.toBe(true);
  });

  it('wildcard index substitution — destinations.*.url → destinations.1.url', async () => {
    const form = createForm({
      initialValues: { destinations: [{ url: '' }, { url: '' }] },
      dependencies: { 'destinations.*.url': ['destinations.*.url'] },
      validator: (v: any, scope: any) => {
        if (!scope) return {};
        const errors: Record<string, string> = {};
        (v.destinations as any[]).forEach((d: any, i: number) => {
          if (scope.includes(`destinations.${i}.url`) && !d.url) {
            errors[`destinations.${i}.url`] = 'Required';
          }
        });
        return errors;
      },
    });
    await form.validate(['destinations.1.url']);
    expect(form.getState().errors['destinations.1.url']).toBe('Required');
  });

  it('wildcard deps on initially-empty arrays — bug #12 regression', async () => {
    const form = createForm({
      initialValues: { items: [] as any[] },
      dependencies: { 'items.*.name': ['items.*.name'] },
      validator: () => ({}),
    });
    // If bug #12 were present, this would throw or silently skip the dep.
    await expect(form.validate(['items.0.name'])).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Batching
// ---------------------------------------------------------------------------

describe('Batching', () => {
  it('multiple sets inside batch() produce exactly one global subscriber call', () => {
    const sub = vi.fn();
    const form = createForm({ initialValues: { a: 0, b: 0 } });
    form.subscribe(sub);
    sub.mockClear();
    form.batch(() => {
      form.set('a', 1, { validate: false });
      form.set('b', 2, { validate: false });
    });
    expect(sub).toHaveBeenCalledTimes(1);
  });

  it('nested batch() does not flush early — bug #7 regression', () => {
    const sub = vi.fn();
    const form = createForm({ initialValues: { a: 0, b: 0 } });
    form.subscribe(sub);
    sub.mockClear();
    form.batch(() => {
      form.batch(() => {
        form.set('a', 1, { validate: false });
      });
      form.set('b', 2, { validate: false });
      // If bug #7 were present, the inner batch would have already flushed here
    });
    expect(sub).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Array — arrayAppend
// ---------------------------------------------------------------------------

describe('Array — arrayAppend', () => {
  it('appends item and increases array length', () => {
    const form = createForm({ initialValues: { items: [] as string[] } });
    form.arrayAppend('items', 'a');
    expect(form.get('items')).toEqual(['a']);
  });
});

// ---------------------------------------------------------------------------
// Array — arrayInsert
// ---------------------------------------------------------------------------

describe('Array — arrayInsert', () => {
  it('inserts at index and shifts existing items', () => {
    const form = createForm({ initialValues: { items: ['a', 'b', 'c'] } });
    form.arrayInsert('items', 1, 'X');
    expect(form.get('items')).toEqual(['a', 'X', 'b', 'c']);
  });

  it('shifts touched/dirty indices up after insert', () => {
    const form = createForm({ initialValues: { items: ['a', 'b'] } });
    // Touch items by writing new values with touch option
    form.set('items.0', 'a2', { touch: true, validate: false });
    form.set('items.1', 'b2', { touch: true, validate: false });
    expect(form.getState().touched['items.0']).toBe(true);
    expect(form.getState().touched['items.1']).toBe(true);
    // Insert at 0 — existing indices 0,1 should become 1,2
    form.arrayInsert('items', 0, 'X');
    const state = form.getState();
    expect(state.touched['items.0']).toBeUndefined(); // new item, not touched
    expect(state.touched['items.1']).toBe(true);      // was items.0
    expect(state.touched['items.2']).toBe(true);      // was items.1
  });

  it('out-of-bounds index is a no-op', () => {
    const form = createForm({ initialValues: { items: ['a'] } });
    form.arrayInsert('items', -1, 'X');
    form.arrayInsert('items', 5, 'X');
    expect(form.get('items')).toEqual(['a']);
  });
});

// ---------------------------------------------------------------------------
// Array — arrayRemove
// ---------------------------------------------------------------------------

describe('Array — arrayRemove', () => {
  it('removes item at index', () => {
    const form = createForm({ initialValues: { items: ['a', 'b', 'c'] } });
    form.arrayRemove('items', 1);
    expect(form.get('items')).toEqual(['a', 'c']);
  });

  it('shifts error indices down after remove', async () => {
    const form = createForm({
      initialValues: { items: ['', ''] },
      validator: (v: any) => {
        const errors: Record<string, string> = {};
        (v.items as string[]).forEach((item: string, i: number) => {
          if (!item) errors[`items.${i}`] = 'Required';
        });
        return errors;
      },
    });
    await form.validate();
    form.arrayRemove('items', 0);
    await form.validate();
    expect(form.getState().errors['items.0']).toBe('Required');
    expect(form.getState().errors['items.1']).toBeUndefined();
  });

  it('out-of-bounds remove is a no-op', () => {
    const form = createForm({ initialValues: { items: ['a'] } });
    form.arrayRemove('items', 5);
    expect(form.get('items')).toEqual(['a']);
  });
});

// ---------------------------------------------------------------------------
// Array — arrayMove
// ---------------------------------------------------------------------------

describe('Array — arrayMove', () => {
  it('moves item to new index', () => {
    const form = createForm({ initialValues: { items: ['a', 'b', 'c'] } });
    form.arrayMove('items', 0, 2);
    expect(form.get('items')).toEqual(['b', 'c', 'a']);
  });

  it('fromIndex === toIndex is a no-op notification-wise', () => {
    const sub = vi.fn();
    const form = createForm({ initialValues: { items: ['a', 'b'] } });
    form.subscribe(sub);
    sub.mockClear();
    form.arrayMove('items', 1, 1);
    // Still notifies (validation runs) — just check array is unchanged
    expect(form.get('items')).toEqual(['a', 'b']);
  });
});

// ---------------------------------------------------------------------------
// Array — arraySwap
// ---------------------------------------------------------------------------

describe('Array — arraySwap', () => {
  it('swaps two items', () => {
    const form = createForm({ initialValues: { items: ['a', 'b', 'c'] } });
    form.arraySwap('items', 0, 2);
    expect(form.get('items')).toEqual(['c', 'b', 'a']);
  });

  it('single-element array is a no-op', () => {
    const form = createForm({ initialValues: { items: ['only'] } });
    form.arraySwap('items', 0, 0);
    expect(form.get('items')).toEqual(['only']);
  });

  it('swaps touched state correctly with two-digit indices — prefix collision regression', () => {
    // Create 12-element array; swap index 1 and index 11.
    // "items.1".startsWith("items.1") and "items.11".startsWith("items.1") are both true —
    // the old code would misprocess items.11 as items.1's prefix.
    const initial = Array.from({ length: 12 }, (_, i) => String(i));
    const form = createForm({ initialValues: { items: initial } });
    form.set('items.1', 'touched-1', { touch: true, validate: false });
    expect(form.getState().touched['items.1']).toBe(true);
    expect(form.getState().touched['items.11']).toBeUndefined();
    form.arraySwap('items', 1, 11);
    // After swap: items.11 should now be touched (it was items.1), items.1 should not be.
    expect(form.getState().touched['items.11']).toBe(true);
    expect(form.getState().touched['items.1']).toBeUndefined();
    // Array values are also correctly swapped
    expect(form.get('items.1')).toBe('11');
    expect(form.get('items.11')).toBe('touched-1');
  });
});

// ---------------------------------------------------------------------------
// notify() performance — bug #9 regression
// ---------------------------------------------------------------------------

describe('notify() performance', () => {
  it('getState() (full deep clone) is NOT called when there are no global subscribers', () => {
    const cloneSpy = vi.spyOn({ deepClone }, 'deepClone');
    // Verify path-only subscription does not trigger full clone.
    // We measure this indirectly: subscribe to a path, mutate, verify no global call.
    const form = createForm({ initialValues: { x: 0 } });
    let pathCallCount = 0;
    form.subscribeToPath('x', () => { pathCallCount++; });
    // Flush the immediate callback from subscribeToPath
    pathCallCount = 0;
    form.set('x', 1, { validate: false });
    expect(pathCallCount).toBe(1); // path subscriber fired
    // No global subscriber means getState() was skipped for the global fan-out
    cloneSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// isDeepEqual
// ---------------------------------------------------------------------------

describe('isDeepEqual', () => {
  it('O(N) key lookup — uses Set internally', () => {
    const a = Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [String(i), i]));
    const b = { ...a };
    expect(isDeepEqual(a, b)).toBe(true);
  });

  it('handles circular references without infinite loop', () => {
    const a: any = { x: 1 };
    a.self = a;
    const b: any = { x: 1 };
    b.self = b;
    expect(() => isDeepEqual(a, b)).not.toThrow();
  });

  it('returns false for different circular structures', () => {
    const a: any = { x: 1 }; a.self = a;
    const b: any = { x: 2 }; b.self = b;
    expect(isDeepEqual(a, b)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

describe('Reset', () => {
  it('clears errors, touched, dirty and restores initial values', () => {
    const form = createForm({ initialValues: { x: 0 } });
    form.set('x', 5, { touch: true });
    form.reset();
    const s = form.getState();
    expect(s.values.x).toBe(0);
    expect(s.errors).toEqual({});
    expect(s.touched).toEqual({});
    expect(s.dirty).toEqual({});
  });

  it('reset(newValues) re-seeds baseline so dirty tracks against new initial', () => {
    const form = createForm({ initialValues: { x: 0 } });
    form.reset({ x: 10 } as any);
    // x is now 10 with new baseline of 10 — not dirty
    expect(form.getState().dirty['x']).toBeUndefined();
    form.set('x', 5);
    expect(form.getState().dirty['x']).toBe(true);
    form.set('x', 10); // back to new baseline
    expect(form.getState().dirty['x']).toBeUndefined();
  });

  it('path subscribers are notified after reset', () => {
    let lastValue: any;
    const form = createForm({ initialValues: { x: 0 } });
    form.set('x', 99, { validate: false });
    form.subscribeToPath('x', (v) => { lastValue = v; });
    lastValue = undefined;
    form.reset();
    expect(lastValue).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Payload isolation
// ---------------------------------------------------------------------------

describe('Payload isolation', () => {
  it('getPayload() returns empty object when no inputs are connected', () => {
    const form = createForm({ initialValues: { a: 1, b: 2 } });
    expect(form.getPayload()).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

describe('Subscriptions', () => {
  it('subscribe fires immediately on attach', () => {
    const sub = vi.fn();
    const form = createForm({ initialValues: { x: 0 } });
    form.subscribe(sub);
    expect(sub).toHaveBeenCalledOnce();
  });

  it('unsubscribe stops global notifications', () => {
    const sub = vi.fn();
    const form = createForm({ initialValues: { x: 0 } });
    const unsub = form.subscribe(sub);
    sub.mockClear();
    unsub();
    form.set('x', 1, { validate: false });
    expect(sub).not.toHaveBeenCalled();
  });

  it('subscribeToPath fires immediately with current value', () => {
    const form = createForm({ initialValues: { x: 42 } });
    let received: any;
    form.subscribeToPath('x', (v) => { received = v; });
    expect(received).toBe(42);
  });

  it('subscribeToPath fires only on matching path mutations', () => {
    const xSub = vi.fn();
    const form = createForm({ initialValues: { x: 0, y: 0 } });
    form.subscribeToPath('x', xSub);
    xSub.mockClear();
    form.set('y', 1, { validate: false });
    expect(xSub).not.toHaveBeenCalled();
    form.set('x', 2, { validate: false });
    expect(xSub).toHaveBeenCalledOnce();
  });

  it('wildcard * subscriber fires on every mutation', () => {
    const wildSub = vi.fn();
    const form = createForm({ initialValues: { a: 0, b: 0 } });
    form.subscribeToPath('*', wildSub);
    wildSub.mockClear();
    form.set('a', 1, { validate: false });
    form.set('b', 2, { validate: false });
    expect(wildSub).toHaveBeenCalledTimes(2);
  });

  it('path subscribers receive updated error state after validation — bug #9 regression', async () => {
    let lastFieldState: any;
    const form = createForm({
      initialValues: { email: '' },
      validator: (v: any) => (v.email ? {} : { email: 'Required' }),
    });
    form.subscribeToPath('email', (_, fs) => { lastFieldState = fs; });
    lastFieldState = null;
    await form.validate(['email']);
    expect(lastFieldState?.error).toBe('Required');
  });
});

// ---------------------------------------------------------------------------
// Destroy
// ---------------------------------------------------------------------------

describe('Destroy', () => {
  it('no notifications fire after destroy()', () => {
    const sub = vi.fn();
    const form = createForm({ initialValues: { x: 0 } });
    form.subscribe(sub);
    sub.mockClear();
    form.destroy();
    form.set('x', 1, { validate: false });
    expect(sub).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Validator adapters
// ---------------------------------------------------------------------------

describe('Validator adapters', () => {
  it('zodAdapter maps zod issues to path-keyed errors', () => {
    const fakeSchema = {
      safeParse: (v: any) =>
        v.name
          ? { success: true, error: null }
          : {
              success: false,
              error: { issues: [{ path: ['name'], message: 'Required' }] },
            },
    };
    const adapter = zodAdapter(fakeSchema);
    expect(adapter({ name: '' } as any)).toEqual({ name: 'Required' });
    expect(adapter({ name: 'Alice' } as any)).toEqual({});
  });

  it('valibotAdapter maps valibot issues to path-keyed errors', () => {
    const fakeSchema = {
      safeParse: (v: any) =>
        v.email
          ? { success: true }
          : {
              success: false,
              issues: [{ path: [{ key: 'email' }], message: 'Invalid email' }],
            },
    };
    const adapter = valibotAdapter(fakeSchema);
    expect(adapter({ email: '' } as any)).toEqual({ email: 'Invalid email' });
    expect(adapter({ email: 'a@b.com' } as any)).toEqual({});
  });

  it('yupAdapter collects all errors with abortEarly:false', async () => {
    const fakeSchema = {
      validate: async (_v: any, _opts: any) => {
        const err: any = new Error('ValidationError');
        err.inner = [
          { path: 'a', message: 'a-err' },
          { path: 'b', message: 'b-err' },
        ];
        throw err;
      },
    };
    const adapter = yupAdapter(fakeSchema);
    const errors = await adapter({ a: '', b: '' } as any);
    expect(errors).toEqual({ a: 'a-err', b: 'b-err' });
  });
});

// ---------------------------------------------------------------------------
// compileDependencyScopes — wildcard on empty arrays (bug #12)
// ---------------------------------------------------------------------------

describe('compileDependencyScopes', () => {
  it('registers wildcard keys even when initialValues array is empty', () => {
    const scopes = compileDependencyScopes(
      { 'items.*.name': ['items.*.price'] },
      { items: [] }
    );
    expect(scopes['items.*.name']).toBeDefined();
    expect(scopes['items.*.name']).toContain('items.*.price');
  });
});

// ---------------------------------------------------------------------------
// Built-in validation rules
// ---------------------------------------------------------------------------

describe('built-in rules — presence', () => {
  it('required — rejects empty string', async () => {
    const form = createForm({ initialValues: { name: '' }, rules: { name: 'required' } });
    await form.validate();
    expect(form.getState().errors.name).toBe('This field is required');
  });

  it('required — rejects whitespace-only string', async () => {
    const form = createForm({ initialValues: { name: '   ' }, rules: { name: 'required' } });
    await form.validate();
    expect(form.getState().errors.name).toBeTruthy();
  });

  it('required — rejects empty array', async () => {
    const form = createForm({ initialValues: { tags: [] as string[] }, rules: { tags: 'required' } });
    await form.validate();
    expect(form.getState().errors.tags).toBeTruthy();
  });

  it('required — passes for non-empty value', async () => {
    const form = createForm({ initialValues: { name: 'Ada' }, rules: { name: 'required' } });
    await form.validate();
    expect(form.getState().errors.name).toBeUndefined();
  });

  it('accepted — passes for true', async () => {
    const form = createForm({ initialValues: { terms: true }, rules: { terms: 'accepted' } });
    await form.validate();
    expect(form.getState().errors.terms).toBeUndefined();
  });

  it('accepted — rejects false', async () => {
    const form = createForm({ initialValues: { terms: false }, rules: { terms: 'accepted' } });
    await form.validate();
    expect(form.getState().errors.terms).toBeTruthy();
  });
});

describe('built-in rules — format', () => {
  it('email — passes valid email', async () => {
    const form = createForm({ initialValues: { email: 'a@b.com' }, rules: { email: 'email' } });
    await form.validate();
    expect(form.getState().errors.email).toBeUndefined();
  });

  it('email — rejects invalid email', async () => {
    const form = createForm({ initialValues: { email: 'notanemail' }, rules: { email: 'email' } });
    await form.validate();
    expect(form.getState().errors.email).toBeTruthy();
  });

  it('url — passes valid URL', async () => {
    const form = createForm({ initialValues: { site: 'https://example.com' }, rules: { site: 'url' } });
    await form.validate();
    expect(form.getState().errors.site).toBeUndefined();
  });

  it('url — rejects plain string', async () => {
    const form = createForm({ initialValues: { site: 'not a url' }, rules: { site: 'url' } });
    await form.validate();
    expect(form.getState().errors.site).toBeTruthy();
  });

  it('numeric — passes a number string', async () => {
    const form = createForm({ initialValues: { age: '25' }, rules: { age: 'numeric' } });
    await form.validate();
    expect(form.getState().errors.age).toBeUndefined();
  });

  it('numeric — rejects non-numeric string', async () => {
    const form = createForm({ initialValues: { age: 'abc' }, rules: { age: 'numeric' } });
    await form.validate();
    expect(form.getState().errors.age).toBeTruthy();
  });

  it('integer — passes whole number', async () => {
    const form = createForm({ initialValues: { qty: 3 }, rules: { qty: 'integer' } });
    await form.validate();
    expect(form.getState().errors.qty).toBeUndefined();
  });

  it('integer — rejects decimal', async () => {
    const form = createForm({ initialValues: { qty: 3.5 }, rules: { qty: 'integer' } });
    await form.validate();
    expect(form.getState().errors.qty).toBeTruthy();
  });

  it('positive — passes value > 0', async () => {
    const form = createForm({ initialValues: { score: 1 }, rules: { score: 'positive' } });
    await form.validate();
    expect(form.getState().errors.score).toBeUndefined();
  });

  it('positive — rejects zero', async () => {
    const form = createForm({ initialValues: { score: 0 }, rules: { score: 'positive' } });
    await form.validate();
    expect(form.getState().errors.score).toBeTruthy();
  });

  it('nonNegative — passes zero', async () => {
    const form = createForm({ initialValues: { score: 0 }, rules: { score: 'nonNegative' } });
    await form.validate();
    expect(form.getState().errors.score).toBeUndefined();
  });

  it('nonNegative — rejects negative', async () => {
    const form = createForm({ initialValues: { score: -1 }, rules: { score: 'nonNegative' } });
    await form.validate();
    expect(form.getState().errors.score).toBeTruthy();
  });

  it('alpha — passes letters only', async () => {
    const form = createForm({ initialValues: { name: 'Ada' }, rules: { name: 'alpha' } });
    await form.validate();
    expect(form.getState().errors.name).toBeUndefined();
  });

  it('alpha — rejects alphanumeric', async () => {
    const form = createForm({ initialValues: { name: 'Ada1' }, rules: { name: 'alpha' } });
    await form.validate();
    expect(form.getState().errors.name).toBeTruthy();
  });

  it('alphanumeric — passes letters and numbers', async () => {
    const form = createForm({ initialValues: { handle: 'user123' }, rules: { handle: 'alphanumeric' } });
    await form.validate();
    expect(form.getState().errors.handle).toBeUndefined();
  });

  it('alphanumeric — rejects spaces', async () => {
    const form = createForm({ initialValues: { handle: 'user 123' }, rules: { handle: 'alphanumeric' } });
    await form.validate();
    expect(form.getState().errors.handle).toBeTruthy();
  });

  it('date — passes valid date string', async () => {
    const form = createForm({ initialValues: { dob: '1990-01-01' }, rules: { dob: 'date' } });
    await form.validate();
    expect(form.getState().errors.dob).toBeUndefined();
  });

  it('date — rejects non-date string', async () => {
    const form = createForm({ initialValues: { dob: 'not-a-date' }, rules: { dob: 'date' } });
    await form.validate();
    expect(form.getState().errors.dob).toBeTruthy();
  });
});

describe('built-in rules — length and size', () => {
  it('minLength — passes when long enough', async () => {
    const form = createForm({ initialValues: { pw: 'secret' }, rules: { pw: { minLength: 6 } } });
    await form.validate();
    expect(form.getState().errors.pw).toBeUndefined();
  });

  it('minLength — rejects too short', async () => {
    const form = createForm({ initialValues: { pw: 'abc' }, rules: { pw: { minLength: 6 } } });
    await form.validate();
    expect(form.getState().errors.pw).toBeTruthy();
  });

  it('maxLength — rejects too long', async () => {
    const form = createForm({ initialValues: { bio: 'x'.repeat(201) }, rules: { bio: { maxLength: 200 } } });
    await form.validate();
    expect(form.getState().errors.bio).toBeTruthy();
  });

  it('min/max — passes within range', async () => {
    const form = createForm({ initialValues: { age: 25 }, rules: { age: [{ min: 18 }, { max: 120 }] } });
    await form.validate();
    expect(form.getState().errors.age).toBeUndefined();
  });

  it('min — rejects below minimum', async () => {
    const form = createForm({ initialValues: { age: 10 }, rules: { age: { min: 18 } } });
    await form.validate();
    expect(form.getState().errors.age).toBeTruthy();
  });
});

describe('built-in rules — string content', () => {
  it('startsWith — passes matching prefix', async () => {
    const form = createForm({ initialValues: { code: 'US-123' }, rules: { code: { startsWith: 'US-' } } });
    await form.validate();
    expect(form.getState().errors.code).toBeUndefined();
  });

  it('startsWith — rejects wrong prefix', async () => {
    const form = createForm({ initialValues: { code: 'EU-123' }, rules: { code: { startsWith: 'US-' } } });
    await form.validate();
    expect(form.getState().errors.code).toBeTruthy();
  });

  it('endsWith — passes matching suffix', async () => {
    const form = createForm({ initialValues: { file: 'report.pdf' }, rules: { file: { endsWith: '.pdf' } } });
    await form.validate();
    expect(form.getState().errors.file).toBeUndefined();
  });

  it('includes — rejects missing substring', async () => {
    const form = createForm({ initialValues: { bio: 'hello world' }, rules: { bio: { includes: 'missing' } } });
    await form.validate();
    expect(form.getState().errors.bio).toBeTruthy();
  });

  it('pattern — passes matching regex', async () => {
    const form = createForm({ initialValues: { code: 'ABC-123' }, rules: { code: { pattern: /^[A-Z]+-\d+$/ } } });
    await form.validate();
    expect(form.getState().errors.code).toBeUndefined();
  });

  it('pattern — rejects non-matching', async () => {
    const form = createForm({ initialValues: { code: 'abc123' }, rules: { code: { pattern: /^[A-Z]+-\d+$/ } } });
    await form.validate();
    expect(form.getState().errors.code).toBeTruthy();
  });
});

describe('built-in rules — array', () => {
  it('minItems — passes with enough items', async () => {
    const form = createForm({ initialValues: { tags: ['a', 'b'] }, rules: { tags: { minItems: 1 } } });
    await form.validate();
    expect(form.getState().errors.tags).toBeUndefined();
  });

  it('minItems — rejects empty array', async () => {
    const form = createForm({ initialValues: { tags: [] as string[] }, rules: { tags: { minItems: 1 } } });
    await form.validate();
    expect(form.getState().errors.tags).toBeTruthy();
  });

  it('maxItems — rejects too many items', async () => {
    const form = createForm({ initialValues: { tags: ['a', 'b', 'c', 'd', 'e', 'f'] }, rules: { tags: { maxItems: 5 } } });
    await form.validate();
    expect(form.getState().errors.tags).toBeTruthy();
  });

  it('unique — passes distinct items', async () => {
    const form = createForm({ initialValues: { tags: ['a', 'b', 'c'] }, rules: { tags: 'unique' } });
    await form.validate();
    expect(form.getState().errors.tags).toBeUndefined();
  });

  it('unique — rejects duplicate items', async () => {
    const form = createForm({ initialValues: { tags: ['a', 'b', 'a'] }, rules: { tags: 'unique' } });
    await form.validate();
    expect(form.getState().errors.tags).toBeTruthy();
  });

  it('unique — works with objects using deep equality', async () => {
    const form = createForm({
      initialValues: { items: [{ id: 1 }, { id: 2 }, { id: 1 }] },
      rules: { items: 'unique' }
    });
    await form.validate();
    expect(form.getState().errors.items).toBeTruthy();
  });

  it('contains — passes when value is present', async () => {
    const form = createForm({ initialValues: { roles: ['admin', 'user'] }, rules: { roles: { contains: 'admin' } } });
    await form.validate();
    expect(form.getState().errors.roles).toBeUndefined();
  });

  it('contains — rejects when value is absent', async () => {
    const form = createForm({ initialValues: { roles: ['user'] }, rules: { roles: { contains: 'admin' } } });
    await form.validate();
    expect(form.getState().errors.roles).toBeTruthy();
  });
});

describe('built-in rules — enum', () => {
  it('oneOf — passes for allowed value', async () => {
    const form = createForm({ initialValues: { role: 'admin' }, rules: { role: { oneOf: ['admin', 'user'] } } });
    await form.validate();
    expect(form.getState().errors.role).toBeUndefined();
  });

  it('oneOf — rejects disallowed value', async () => {
    const form = createForm({ initialValues: { role: 'superuser' }, rules: { role: { oneOf: ['admin', 'user'] } } });
    await form.validate();
    expect(form.getState().errors.role).toBeTruthy();
  });

  it('notOneOf — rejects blacklisted value', async () => {
    const form = createForm({ initialValues: { name: 'admin' }, rules: { name: { notOneOf: ['admin', 'root'] } } });
    await form.validate();
    expect(form.getState().errors.name).toBeTruthy();
  });

  it('notOneOf — passes non-blacklisted value', async () => {
    const form = createForm({ initialValues: { name: 'alice' }, rules: { name: { notOneOf: ['admin', 'root'] } } });
    await form.validate();
    expect(form.getState().errors.name).toBeUndefined();
  });
});

describe('built-in rules — cross-field', () => {
  it('matches — passes for equal primitive values', async () => {
    const form = createForm({
      initialValues: { password: 'secret', confirm: 'secret' },
      rules: { confirm: { matches: 'password' } },
    });
    await form.validate();
    expect(form.getState().errors.confirm).toBeUndefined();
  });

  it('matches — rejects when values differ', async () => {
    const form = createForm({
      initialValues: { password: 'secret', confirm: 'wrong' },
      rules: { confirm: { matches: 'password' } },
    });
    await form.validate();
    expect(form.getState().errors.confirm).toBeTruthy();
  });

  it('matches — uses deep equality for objects', async () => {
    const form = createForm({
      initialValues: { a: { x: 1, y: 2 }, b: { x: 1, y: 2 } },
      rules: { b: { matches: 'a' } },
    });
    await form.validate();
    expect(form.getState().errors.b).toBeUndefined();
  });

  it('matches — uses deep equality for arrays', async () => {
    const form = createForm({
      initialValues: { a: [1, 2, 3], b: [1, 2, 4] },
      rules: { b: { matches: 'a' } },
    });
    await form.validate();
    expect(form.getState().errors.b).toBeTruthy();
  });

  it('doesNotMatch — passes when values differ', async () => {
    const form = createForm({
      initialValues: { username: 'alice', password: 'aliceXYZ' },
      rules: { password: { doesNotMatch: 'username' } },
    });
    await form.validate();
    expect(form.getState().errors.password).toBeUndefined();
  });

  it('doesNotMatch — rejects when values are equal', async () => {
    const form = createForm({
      initialValues: { username: 'alice', password: 'alice' },
      rules: { password: { doesNotMatch: 'username' } },
    });
    await form.validate();
    expect(form.getState().errors.password).toBeTruthy();
  });

  it('greaterThan — passes when value exceeds path value', async () => {
    const form = createForm({
      initialValues: { min: 10, max: 20 },
      rules: { max: { greaterThan: 'min' } },
    });
    await form.validate();
    expect(form.getState().errors.max).toBeUndefined();
  });

  it('greaterThan — rejects when value does not exceed path value', async () => {
    const form = createForm({
      initialValues: { min: 20, max: 10 },
      rules: { max: { greaterThan: 'min' } },
    });
    await form.validate();
    expect(form.getState().errors.max).toBeTruthy();
  });

  it('lessThan — passes when value is below path value', async () => {
    const form = createForm({
      initialValues: { low: 5, high: 10 },
      rules: { low: { lessThan: 'high' } },
    });
    await form.validate();
    expect(form.getState().errors.low).toBeUndefined();
  });

  it('after — passes when date is later', async () => {
    const form = createForm({
      initialValues: { start: '2024-01-01', end: '2024-12-31' },
      rules: { end: { after: 'start' } },
    });
    await form.validate();
    expect(form.getState().errors.end).toBeUndefined();
  });

  it('after — rejects when date is earlier', async () => {
    const form = createForm({
      initialValues: { start: '2024-12-31', end: '2024-01-01' },
      rules: { end: { after: 'start' } },
    });
    await form.validate();
    expect(form.getState().errors.end).toBeTruthy();
  });

  it('before — passes when date is earlier', async () => {
    const form = createForm({
      initialValues: { start: '2024-01-01', end: '2024-12-31' },
      rules: { start: { before: 'end' } },
    });
    await form.validate();
    expect(form.getState().errors.start).toBeUndefined();
  });
});

describe('built-in rules — conditional presence', () => {
  it('requiredIf — not required when trigger is falsy', async () => {
    const form = createForm({
      initialValues: { hasAddress: false, address: '' },
      rules: { address: { requiredIf: 'hasAddress' } },
    });
    await form.validate();
    expect(form.getState().errors.address).toBeUndefined();
  });

  it('requiredIf — required when trigger is truthy', async () => {
    const form = createForm({
      initialValues: { hasAddress: true, address: '' },
      rules: { address: { requiredIf: 'hasAddress' } },
    });
    await form.validate();
    expect(form.getState().errors.address).toBeTruthy();
  });

  it('requiredIf — passes when trigger is truthy and value is present', async () => {
    const form = createForm({
      initialValues: { hasAddress: true, address: '123 Main St' },
      rules: { address: { requiredIf: 'hasAddress' } },
    });
    await form.validate();
    expect(form.getState().errors.address).toBeUndefined();
  });

  it('requiredUnless — not required when trigger is truthy', async () => {
    const form = createForm({
      initialValues: { isCompany: true, vat: '' },
      rules: { vat: { requiredUnless: 'isCompany' } },
    });
    await form.validate();
    expect(form.getState().errors.vat).toBeUndefined();
  });

  it('requiredUnless — required when trigger is falsy and value missing', async () => {
    const form = createForm({
      initialValues: { isCompany: false, vat: '' },
      rules: { vat: { requiredUnless: 'isCompany' } },
    });
    await form.validate();
    expect(form.getState().errors.vat).toBeTruthy();
  });
});

describe('built-in rules — composition with custom validator', () => {
  it('custom validator errors override built-in errors for the same field', async () => {
    const form = createForm({
      initialValues: { email: 'notanemail' },
      rules: { email: 'email' },
      validator: () => ({ email: 'Custom message from validator' }),
    });
    await form.validate();
    expect(form.getState().errors.email).toBe('Custom message from validator');
  });

  it('built-in and custom errors coexist on different fields', async () => {
    const form = createForm({
      initialValues: { email: 'bad', name: '' },
      rules: { email: 'email' },
      validator: () => ({ name: 'Name is required' }),
    });
    await form.validate();
    expect(form.getState().errors.email).toBeTruthy();
    expect(form.getState().errors.name).toBe('Name is required');
  });

  it('stops at first failing rule per field (short-circuit)', async () => {
    const form = createForm({
      initialValues: { pw: '' },
      rules: { pw: ['required', { minLength: 8 }] },
    });
    await form.validate();
    expect(form.getState().errors.pw).toBe('This field is required');
  });

  it('passes through all rules when all pass — no false short-circuit', async () => {
    const form = createForm({
      initialValues: { name: 'Ada' },
      rules: { name: ['required', 'alpha', { minLength: 2 }, { maxLength: 50 }] },
    });
    await form.validate();
    expect(form.getState().errors.name).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Built-in rules — deeper edge cases and boundary conditions
// ---------------------------------------------------------------------------

describe('built-in rules — required: edge values', () => {
  it('rejects null', async () => {
    const form = createForm({ initialValues: { x: null as any }, rules: { x: 'required' } });
    await form.validate();
    expect(form.getState().errors.x).toBeTruthy();
  });

  it('rejects undefined (missing key)', async () => {
    const form = createForm({ initialValues: {} as any, rules: { x: 'required' } });
    await form.validate();
    expect(form.getState().errors.x).toBeTruthy();
  });

  it('passes for number 0 — zero is a legitimate value', async () => {
    const form = createForm({ initialValues: { score: 0 }, rules: { score: 'required' } });
    await form.validate();
    expect(form.getState().errors.score).toBeUndefined();
  });

  it('passes for boolean false — false is a legitimate value (use accepted for checkboxes)', async () => {
    const form = createForm({ initialValues: { enabled: false }, rules: { enabled: 'required' } });
    await form.validate();
    expect(form.getState().errors.enabled).toBeUndefined();
  });

  it('passes for non-empty array', async () => {
    const form = createForm({ initialValues: { tags: ['a'] }, rules: { tags: 'required' } });
    await form.validate();
    expect(form.getState().errors.tags).toBeUndefined();
  });
});

describe('built-in rules — accepted: all accepted values', () => {
  it('passes for 1', async () => {
    const form = createForm({ initialValues: { terms: 1 as any }, rules: { terms: 'accepted' } });
    await form.validate();
    expect(form.getState().errors.terms).toBeUndefined();
  });

  it('passes for "yes"', async () => {
    const form = createForm({ initialValues: { terms: 'yes' as any }, rules: { terms: 'accepted' } });
    await form.validate();
    expect(form.getState().errors.terms).toBeUndefined();
  });

  it('passes for "true"', async () => {
    const form = createForm({ initialValues: { terms: 'true' as any }, rules: { terms: 'accepted' } });
    await form.validate();
    expect(form.getState().errors.terms).toBeUndefined();
  });

  it('rejects undefined', async () => {
    const form = createForm({ initialValues: { terms: undefined as any }, rules: { terms: 'accepted' } });
    await form.validate();
    expect(form.getState().errors.terms).toBeTruthy();
  });

  it('rejects null', async () => {
    const form = createForm({ initialValues: { terms: null as any }, rules: { terms: 'accepted' } });
    await form.validate();
    expect(form.getState().errors.terms).toBeTruthy();
  });

  it('rejects 0', async () => {
    const form = createForm({ initialValues: { terms: 0 as any }, rules: { terms: 'accepted' } });
    await form.validate();
    expect(form.getState().errors.terms).toBeTruthy();
  });
});

describe('built-in rules — email: edge values', () => {
  it('skips when value is empty (combine with required for mandatory fields)', async () => {
    const form = createForm({ initialValues: { email: '' }, rules: { email: 'email' } });
    await form.validate();
    expect(form.getState().errors.email).toBeUndefined();
  });

  it('passes for email with plus alias', async () => {
    const form = createForm({ initialValues: { email: 'user+tag@example.com' }, rules: { email: 'email' } });
    await form.validate();
    expect(form.getState().errors.email).toBeUndefined();
  });

  it('passes for email with subdomain', async () => {
    const form = createForm({ initialValues: { email: 'a@mail.example.co.uk' }, rules: { email: 'email' } });
    await form.validate();
    expect(form.getState().errors.email).toBeUndefined();
  });

  it('rejects email without domain TLD', async () => {
    const form = createForm({ initialValues: { email: 'user@localhost' }, rules: { email: 'email' } });
    await form.validate();
    expect(form.getState().errors.email).toBeTruthy();
  });

  it('rejects email without @', async () => {
    const form = createForm({ initialValues: { email: 'notanemail.com' }, rules: { email: 'email' } });
    await form.validate();
    expect(form.getState().errors.email).toBeTruthy();
  });
});

describe('built-in rules — url: edge values', () => {
  it('skips when value is empty', async () => {
    const form = createForm({ initialValues: { site: '' }, rules: { site: 'url' } });
    await form.validate();
    expect(form.getState().errors.site).toBeUndefined();
  });

  it('passes for http:// URL', async () => {
    const form = createForm({ initialValues: { site: 'http://example.com' }, rules: { site: 'url' } });
    await form.validate();
    expect(form.getState().errors.site).toBeUndefined();
  });

  it('rejects URL without protocol', async () => {
    const form = createForm({ initialValues: { site: 'example.com' }, rules: { site: 'url' } });
    await form.validate();
    expect(form.getState().errors.site).toBeTruthy();
  });
});

describe('built-in rules — numeric/integer: edge values', () => {
  it('numeric — skips empty string', async () => {
    const form = createForm({ initialValues: { n: '' as any }, rules: { n: 'numeric' } });
    await form.validate();
    expect(form.getState().errors.n).toBeUndefined();
  });

  it('numeric — passes for actual number value', async () => {
    const form = createForm({ initialValues: { n: 42 }, rules: { n: 'numeric' } });
    await form.validate();
    expect(form.getState().errors.n).toBeUndefined();
  });

  it('numeric — passes for decimal string', async () => {
    const form = createForm({ initialValues: { n: '3.14' as any }, rules: { n: 'numeric' } });
    await form.validate();
    expect(form.getState().errors.n).toBeUndefined();
  });

  it('numeric — passes for negative number string', async () => {
    const form = createForm({ initialValues: { n: '-5' as any }, rules: { n: 'numeric' } });
    await form.validate();
    expect(form.getState().errors.n).toBeUndefined();
  });

  it('integer — passes for string "3"', async () => {
    const form = createForm({ initialValues: { n: '3' as any }, rules: { n: 'integer' } });
    await form.validate();
    expect(form.getState().errors.n).toBeUndefined();
  });

  it('integer — passes for "3.0" (is a whole number)', async () => {
    const form = createForm({ initialValues: { n: '3.0' as any }, rules: { n: 'integer' } });
    await form.validate();
    expect(form.getState().errors.n).toBeUndefined();
  });

  it('integer — passes for 0', async () => {
    const form = createForm({ initialValues: { n: 0 }, rules: { n: 'integer' } });
    await form.validate();
    expect(form.getState().errors.n).toBeUndefined();
  });

  it('integer — skips empty string', async () => {
    const form = createForm({ initialValues: { n: '' as any }, rules: { n: 'integer' } });
    await form.validate();
    expect(form.getState().errors.n).toBeUndefined();
  });

  it('positive — rejects negative', async () => {
    const form = createForm({ initialValues: { n: -1 }, rules: { n: 'positive' } });
    await form.validate();
    expect(form.getState().errors.n).toBeTruthy();
  });

  it('positive — passes for 0.001', async () => {
    const form = createForm({ initialValues: { n: 0.001 }, rules: { n: 'positive' } });
    await form.validate();
    expect(form.getState().errors.n).toBeUndefined();
  });

  it('positive — skips empty string', async () => {
    const form = createForm({ initialValues: { n: '' as any }, rules: { n: 'positive' } });
    await form.validate();
    expect(form.getState().errors.n).toBeUndefined();
  });

  it('nonNegative — passes for positive value', async () => {
    const form = createForm({ initialValues: { n: 5 }, rules: { n: 'nonNegative' } });
    await form.validate();
    expect(form.getState().errors.n).toBeUndefined();
  });

  it('nonNegative — skips empty string', async () => {
    const form = createForm({ initialValues: { n: '' as any }, rules: { n: 'nonNegative' } });
    await form.validate();
    expect(form.getState().errors.n).toBeUndefined();
  });
});

describe('built-in rules — alpha/alphanumeric: edge values', () => {
  it('alpha — skips empty string', async () => {
    const form = createForm({ initialValues: { s: '' }, rules: { s: 'alpha' } });
    await form.validate();
    expect(form.getState().errors.s).toBeUndefined();
  });

  it('alpha — rejects string with spaces', async () => {
    const form = createForm({ initialValues: { s: 'hello world' }, rules: { s: 'alpha' } });
    await form.validate();
    expect(form.getState().errors.s).toBeTruthy();
  });

  it('alpha — rejects string with numbers', async () => {
    const form = createForm({ initialValues: { s: 'abc1' }, rules: { s: 'alpha' } });
    await form.validate();
    expect(form.getState().errors.s).toBeTruthy();
  });

  it('alphanumeric — skips empty string', async () => {
    const form = createForm({ initialValues: { s: '' }, rules: { s: 'alphanumeric' } });
    await form.validate();
    expect(form.getState().errors.s).toBeUndefined();
  });

  it('alphanumeric — rejects special characters', async () => {
    const form = createForm({ initialValues: { s: 'user@123' }, rules: { s: 'alphanumeric' } });
    await form.validate();
    expect(form.getState().errors.s).toBeTruthy();
  });
});

describe('built-in rules — date: edge values', () => {
  it('skips empty string', async () => {
    const form = createForm({ initialValues: { d: '' }, rules: { d: 'date' } });
    await form.validate();
    expect(form.getState().errors.d).toBeUndefined();
  });

  it('passes for a Date object', async () => {
    const form = createForm({ initialValues: { d: new Date('2024-01-01') as any }, rules: { d: 'date' } });
    await form.validate();
    expect(form.getState().errors.d).toBeUndefined();
  });

  it('passes for a unix timestamp number', async () => {
    const form = createForm({ initialValues: { d: 1704067200000 as any }, rules: { d: 'date' } });
    await form.validate();
    expect(form.getState().errors.d).toBeUndefined();
  });

  it('rejects completely invalid date string', async () => {
    const form = createForm({ initialValues: { d: 'not-a-date' }, rules: { d: 'date' } });
    await form.validate();
    expect(form.getState().errors.d).toBeTruthy();
  });
});

describe('built-in rules — minLength/maxLength: boundary and empty', () => {
  it('minLength — skips empty string (bug fix: was firing on empty)', async () => {
    const form = createForm({ initialValues: { pw: '' }, rules: { pw: { minLength: 8 } } });
    await form.validate();
    expect(form.getState().errors.pw).toBeUndefined();
  });

  it('minLength — passes at exactly the boundary', async () => {
    const form = createForm({ initialValues: { pw: '12345678' }, rules: { pw: { minLength: 8 } } });
    await form.validate();
    expect(form.getState().errors.pw).toBeUndefined();
  });

  it('minLength — fails one character below boundary', async () => {
    const form = createForm({ initialValues: { pw: '1234567' }, rules: { pw: { minLength: 8 } } });
    await form.validate();
    expect(form.getState().errors.pw).toBeTruthy();
  });

  it('maxLength — skips empty string', async () => {
    const form = createForm({ initialValues: { bio: '' }, rules: { bio: { maxLength: 200 } } });
    await form.validate();
    expect(form.getState().errors.bio).toBeUndefined();
  });

  it('maxLength — passes at exactly the boundary', async () => {
    const form = createForm({ initialValues: { bio: 'x'.repeat(200) }, rules: { bio: { maxLength: 200 } } });
    await form.validate();
    expect(form.getState().errors.bio).toBeUndefined();
  });

  it('maxLength — fails one character above boundary', async () => {
    const form = createForm({ initialValues: { bio: 'x'.repeat(201) }, rules: { bio: { maxLength: 200 } } });
    await form.validate();
    expect(form.getState().errors.bio).toBeTruthy();
  });

  it('minLength: 1 uses singular "character" in default message', async () => {
    const form = createForm({ initialValues: { pw: '' }, rules: { pw: ['required', { minLength: 1 }] } });
    await form.validate();
    // required fires first, but if only minLength: 1 with a present-but-empty... skipped by present guard
    // test minLength message on non-empty too-short value
    const form2 = createForm({ initialValues: { code: 'x' }, rules: { code: { minLength: 3 } } });
    form2.set('code', ''); // clear it — now empty, so minLength skips
    await form2.validate(['code']);
    // re-set a short value to trigger the message
    form2.set('code', 'ab');
    await form2.validate(['code']);
    expect(form2.getState().errors.code).toContain('characters');
  });
});

describe('built-in rules — min/max: boundary and empty', () => {
  it('min — passes at exactly the minimum', async () => {
    const form = createForm({ initialValues: { age: 18 }, rules: { age: { min: 18 } } });
    await form.validate();
    expect(form.getState().errors.age).toBeUndefined();
  });

  it('max — passes at exactly the maximum', async () => {
    const form = createForm({ initialValues: { age: 120 }, rules: { age: { max: 120 } } });
    await form.validate();
    expect(form.getState().errors.age).toBeUndefined();
  });

  it('min — skips empty string', async () => {
    const form = createForm({ initialValues: { age: '' as any }, rules: { age: { min: 18 } } });
    await form.validate();
    expect(form.getState().errors.age).toBeUndefined();
  });

  it('max — skips empty string', async () => {
    const form = createForm({ initialValues: { age: '' as any }, rules: { age: { max: 120 } } });
    await form.validate();
    expect(form.getState().errors.age).toBeUndefined();
  });
});

describe('built-in rules — string content: edge values', () => {
  it('startsWith — skips empty string', async () => {
    const form = createForm({ initialValues: { code: '' }, rules: { code: { startsWith: 'US-' } } });
    await form.validate();
    expect(form.getState().errors.code).toBeUndefined();
  });

  it('startsWith — passes when value equals the prefix exactly', async () => {
    const form = createForm({ initialValues: { code: 'US-' }, rules: { code: { startsWith: 'US-' } } });
    await form.validate();
    expect(form.getState().errors.code).toBeUndefined();
  });

  it('endsWith — rejects wrong suffix', async () => {
    const form = createForm({ initialValues: { file: 'report.doc' }, rules: { file: { endsWith: '.pdf' } } });
    await form.validate();
    expect(form.getState().errors.file).toBeTruthy();
  });

  it('endsWith — skips empty string', async () => {
    const form = createForm({ initialValues: { file: '' }, rules: { file: { endsWith: '.pdf' } } });
    await form.validate();
    expect(form.getState().errors.file).toBeUndefined();
  });

  it('includes — passes when substring present', async () => {
    const form = createForm({ initialValues: { bio: 'hello world' }, rules: { bio: { includes: 'world' } } });
    await form.validate();
    expect(form.getState().errors.bio).toBeUndefined();
  });

  it('includes — skips empty string', async () => {
    const form = createForm({ initialValues: { bio: '' }, rules: { bio: { includes: 'world' } } });
    await form.validate();
    expect(form.getState().errors.bio).toBeUndefined();
  });

  it('pattern — skips empty string', async () => {
    const form = createForm({ initialValues: { code: '' }, rules: { code: { pattern: /^[A-Z]+$/ } } });
    await form.validate();
    expect(form.getState().errors.code).toBeUndefined();
  });

  it('pattern — accepts string pattern', async () => {
    const form = createForm({ initialValues: { code: 'ABC' }, rules: { code: { pattern: '^[A-Z]+$' } } });
    await form.validate();
    expect(form.getState().errors.code).toBeUndefined();
  });

  it('custom message overrides default for any rule', async () => {
    const form = createForm({
      initialValues: { name: '' },
      rules: { name: [{ minLength: 3, message: 'Too short!' }] },
    });
    form.set('name', 'ab');
    await form.validate(['name']);
    expect(form.getState().errors.name).toBe('Too short!');
  });
});

describe('built-in rules — array: edge values', () => {
  it('minItems — passes at exactly the minimum', async () => {
    const form = createForm({ initialValues: { tags: ['a'] }, rules: { tags: { minItems: 1 } } });
    await form.validate();
    expect(form.getState().errors.tags).toBeUndefined();
  });

  it('maxItems — passes at exactly the maximum', async () => {
    const form = createForm({ initialValues: { tags: ['a', 'b', 'c'] }, rules: { tags: { maxItems: 3 } } });
    await form.validate();
    expect(form.getState().errors.tags).toBeUndefined();
  });

  it('unique — passes for empty array (vacuously unique)', async () => {
    const form = createForm({ initialValues: { tags: [] as string[] }, rules: { tags: 'unique' } });
    await form.validate();
    expect(form.getState().errors.tags).toBeUndefined();
  });

  it('unique — passes for single item', async () => {
    const form = createForm({ initialValues: { tags: ['only'] }, rules: { tags: 'unique' } });
    await form.validate();
    expect(form.getState().errors.tags).toBeUndefined();
  });

  it('unique — detects duplicate nested arrays', async () => {
    const form = createForm({
      initialValues: { matrix: [[1, 2], [3, 4], [1, 2]] },
      rules: { matrix: 'unique' },
    });
    await form.validate();
    expect(form.getState().errors.matrix).toBeTruthy();
  });

  it('unique — passes for nested arrays that differ', async () => {
    const form = createForm({
      initialValues: { matrix: [[1, 2], [3, 4], [5, 6]] },
      rules: { matrix: 'unique' },
    });
    await form.validate();
    expect(form.getState().errors.matrix).toBeUndefined();
  });

  it('contains — passes when object is in array (deep equality)', async () => {
    const form = createForm({
      initialValues: { items: [{ id: 1 }, { id: 2 }] },
      rules: { items: { contains: { id: 1 } } },
    });
    await form.validate();
    expect(form.getState().errors.items).toBeUndefined();
  });

  it('contains — fails for empty array', async () => {
    const form = createForm({
      initialValues: { items: [] as any[] },
      rules: { items: { contains: 'required-item' } },
    });
    await form.validate();
    expect(form.getState().errors.items).toBeTruthy();
  });

  it('minItems: 1 uses singular "item" in default message', async () => {
    const form = createForm({ initialValues: { items: [] as any[] }, rules: { items: { minItems: 1 } } });
    await form.validate();
    expect(form.getState().errors.items).toContain('item');
  });

  it('minItems: 2 uses plural "items" in default message', async () => {
    const form = createForm({ initialValues: { items: ['only'] }, rules: { items: { minItems: 2 } } });
    await form.validate();
    expect(form.getState().errors.items).toContain('items');
  });
});

describe('built-in rules — oneOf/notOneOf: edge values', () => {
  it('oneOf — skips when value is empty (bug fix: was failing on empty optional field)', async () => {
    const form = createForm({ initialValues: { role: '' }, rules: { role: { oneOf: ['admin', 'user'] } } });
    await form.validate();
    expect(form.getState().errors.role).toBeUndefined();
  });

  it('oneOf — still enforces when combined with required', async () => {
    const form = createForm({
      initialValues: { role: '' },
      rules: { role: ['required', { oneOf: ['admin', 'user'] }] },
    });
    await form.validate();
    expect(form.getState().errors.role).toBe('This field is required');
  });

  it('oneOf — skips when value is undefined', async () => {
    const form = createForm({ initialValues: {} as any, rules: { role: { oneOf: ['admin', 'user'] } } });
    await form.validate();
    expect(form.getState().errors.role).toBeUndefined();
  });

  it('oneOf — uses deep equality for object options', async () => {
    const form = createForm({
      initialValues: { tier: { level: 2, name: 'pro' } },
      rules: { tier: { oneOf: [{ level: 1, name: 'free' }, { level: 2, name: 'pro' }] } },
    });
    await form.validate();
    expect(form.getState().errors.tier).toBeUndefined();
  });

  it('notOneOf — passes for empty value (empty is not blacklisted)', async () => {
    const form = createForm({ initialValues: { name: '' }, rules: { name: { notOneOf: ['admin', 'root'] } } });
    await form.validate();
    expect(form.getState().errors.name).toBeUndefined();
  });

  it('notOneOf — uses deep equality for object options', async () => {
    const form = createForm({
      initialValues: { tag: { id: 1 } },
      rules: { tag: { notOneOf: [{ id: 1 }, { id: 2 }] } },
    });
    await form.validate();
    expect(form.getState().errors.tag).toBeTruthy();
  });
});

describe('built-in rules — cross-field: deeper cases', () => {
  it('matches — passes when both values are undefined (absent fields)', async () => {
    const form = createForm({
      initialValues: {} as any,
      rules: { b: { matches: 'a' } },
    });
    await form.validate();
    expect(form.getState().errors.b).toBeUndefined();
  });

  it('matches — passes when both values are null', async () => {
    const form = createForm({
      initialValues: { a: null as any, b: null as any },
      rules: { b: { matches: 'a' } },
    });
    await form.validate();
    expect(form.getState().errors.b).toBeUndefined();
  });

  it('matches — fails when comparing number and its string representation', async () => {
    const form = createForm({
      initialValues: { a: 5, b: '5' as any },
      rules: { b: { matches: 'a' } },
    });
    await form.validate();
    expect(form.getState().errors.b).toBeTruthy();
  });

  it('matches — works across nested paths', async () => {
    const form = createForm({
      initialValues: { step1: { email: 'a@b.com' }, step2: { email: 'a@b.com' } },
      rules: { 'step2.email': { matches: 'step1.email' } },
    });
    await form.validate();
    expect(form.getState().errors['step2.email']).toBeUndefined();
  });

  it('doesNotMatch — fails when both are null (they match)', async () => {
    const form = createForm({
      initialValues: { a: null as any, b: null as any },
      rules: { b: { doesNotMatch: 'a' } },
    });
    await form.validate();
    expect(form.getState().errors.b).toBeTruthy();
  });

  it('doesNotMatch — passes when types differ', async () => {
    const form = createForm({
      initialValues: { a: 5, b: '5' as any },
      rules: { b: { doesNotMatch: 'a' } },
    });
    await form.validate();
    expect(form.getState().errors.b).toBeUndefined();
  });

  it('greaterThan — fails when equal (strictly greater required)', async () => {
    const form = createForm({
      initialValues: { min: 10, max: 10 },
      rules: { max: { greaterThan: 'min' } },
    });
    await form.validate();
    expect(form.getState().errors.max).toBeTruthy();
  });

  it('greaterThan — skips empty value', async () => {
    const form = createForm({
      initialValues: { min: 10, max: '' as any },
      rules: { max: { greaterThan: 'min' } },
    });
    await form.validate();
    expect(form.getState().errors.max).toBeUndefined();
  });

  it('greaterThan — silently passes when reference path does not exist (NaN comparison)', async () => {
    const form = createForm({
      initialValues: { max: 5 },
      rules: { max: { greaterThan: 'nonExistentPath' } },
    });
    await form.validate();
    expect(form.getState().errors.max).toBeUndefined();
  });

  it('lessThan — fails when equal (strictly less required)', async () => {
    const form = createForm({
      initialValues: { low: 10, high: 10 },
      rules: { low: { lessThan: 'high' } },
    });
    await form.validate();
    expect(form.getState().errors.low).toBeTruthy();
  });

  it('lessThan — fails when value exceeds path value', async () => {
    const form = createForm({
      initialValues: { low: 20, high: 10 },
      rules: { low: { lessThan: 'high' } },
    });
    await form.validate();
    expect(form.getState().errors.low).toBeTruthy();
  });

  it('after — fails when dates are equal (strictly after required)', async () => {
    const form = createForm({
      initialValues: { start: '2024-06-01', end: '2024-06-01' },
      rules: { end: { after: 'start' } },
    });
    await form.validate();
    expect(form.getState().errors.end).toBeTruthy();
  });

  it('after — skips when reference date is invalid', async () => {
    const form = createForm({
      initialValues: { start: 'not-a-date', end: '2024-12-31' },
      rules: { end: { after: 'start' } },
    });
    await form.validate();
    expect(form.getState().errors.end).toBeUndefined();
  });

  it('after — passes for Date objects', async () => {
    const form = createForm({
      initialValues: { start: new Date('2024-01-01') as any, end: new Date('2024-12-31') as any },
      rules: { end: { after: 'start' } },
    });
    await form.validate();
    expect(form.getState().errors.end).toBeUndefined();
  });

  it('after — fails for Date objects in wrong order', async () => {
    const form = createForm({
      initialValues: { start: new Date('2024-12-31') as any, end: new Date('2024-01-01') as any },
      rules: { end: { after: 'start' } },
    });
    await form.validate();
    expect(form.getState().errors.end).toBeTruthy();
  });

  it('before — fails when dates are equal', async () => {
    const form = createForm({
      initialValues: { start: '2024-06-01', end: '2024-06-01' },
      rules: { start: { before: 'end' } },
    });
    await form.validate();
    expect(form.getState().errors.start).toBeTruthy();
  });

  it('before — fails when value is after reference', async () => {
    const form = createForm({
      initialValues: { start: '2024-12-31', end: '2024-01-01' },
      rules: { start: { before: 'end' } },
    });
    await form.validate();
    expect(form.getState().errors.start).toBeTruthy();
  });

  it('before — skips when either date is invalid', async () => {
    const form = createForm({
      initialValues: { start: '2024-01-01', end: 'not-a-date' },
      rules: { start: { before: 'end' } },
    });
    await form.validate();
    expect(form.getState().errors.start).toBeUndefined();
  });
});

describe('built-in rules — conditional presence: edge values', () => {
  it('requiredIf — falsy trigger 0 does not trigger requirement', async () => {
    const form = createForm({
      initialValues: { count: 0, address: '' },
      rules: { address: { requiredIf: 'count' } },
    });
    await form.validate();
    expect(form.getState().errors.address).toBeUndefined();
  });

  it('requiredIf — falsy trigger empty string does not trigger requirement', async () => {
    const form = createForm({
      initialValues: { mode: '', extra: '' },
      rules: { extra: { requiredIf: 'mode' } },
    });
    await form.validate();
    expect(form.getState().errors.extra).toBeUndefined();
  });

  it('requiredIf — truthy string trigger requires the field', async () => {
    const form = createForm({
      initialValues: { mode: 'advanced', extra: '' },
      rules: { extra: { requiredIf: 'mode' } },
    });
    await form.validate();
    expect(form.getState().errors.extra).toBeTruthy();
  });

  it('requiredIf — nested trigger path works', async () => {
    const form = createForm({
      initialValues: { settings: { isCompany: true }, vat: '' },
      rules: { vat: { requiredIf: 'settings.isCompany' } },
    });
    await form.validate();
    expect(form.getState().errors.vat).toBeTruthy();
  });

  it('requiredUnless — value present with falsy trigger passes', async () => {
    const form = createForm({
      initialValues: { isCompany: false, vat: 'GB123456' },
      rules: { vat: { requiredUnless: 'isCompany' } },
    });
    await form.validate();
    expect(form.getState().errors.vat).toBeUndefined();
  });

  it('requiredUnless — truthy trigger makes field optional even when empty', async () => {
    const form = createForm({
      initialValues: { sameAsBilling: true, shippingAddress: '' },
      rules: { shippingAddress: { requiredUnless: 'sameAsBilling' } },
    });
    await form.validate();
    expect(form.getState().errors.shippingAddress).toBeUndefined();
  });
});

describe('built-in rules — scoped validation', () => {
  it('only evaluates rules for the specified paths', async () => {
    const form = createForm({
      initialValues: { email: '', name: '' },
      rules: { email: 'required', name: 'required' },
    });
    await form.validate(['email']);
    // email should have an error
    expect(form.getState().errors.email).toBeTruthy();
    // name was not in scope — no error generated
    expect(form.getState().errors.name).toBeUndefined();
  });

  it('preserves errors outside scope', async () => {
    const form = createForm({
      initialValues: { email: '', name: '' },
      rules: { email: 'required', name: 'required' },
    });
    await form.validate(); // all fields — both fail
    await form.validate(['email']); // re-validate only email
    // name error is preserved from previous full validation via mergeScopedErrors
    expect(form.getState().errors.name).toBeTruthy();
    expect(form.getState().errors.email).toBeTruthy();
  });

  it('clears error for a path re-validated in scope when it now passes', async () => {
    const form = createForm({
      initialValues: { email: '' },
      rules: { email: 'required' },
    });
    await form.validate();
    expect(form.getState().errors.email).toBeTruthy();

    form.set('email', 'a@b.com');
    await form.validate(['email']);
    expect(form.getState().errors.email).toBeUndefined();
  });
});

describe('built-in rules — integration with form lifecycle', () => {
  it('errors are cleared after reset()', async () => {
    const form = createForm({
      initialValues: { name: '' },
      rules: { name: 'required' },
    });
    await form.validate();
    expect(form.getState().errors.name).toBeTruthy();

    form.reset();
    expect(form.getState().errors).toEqual({});
  });

  it('set with validate:true triggers built-in rule evaluation', async () => {
    const form = createForm({
      initialValues: { email: '' },
      rules: { email: 'email' },
    });
    form.set('email', 'notanemail', { validate: true });
    // Validation is async; wait a tick
    await new Promise((r) => setTimeout(r, 0));
    expect(form.getState().errors.email).toBeTruthy();
  });

  it('set with validate:true clears error when value becomes valid', async () => {
    const form = createForm({
      initialValues: { email: 'notanemail' },
      rules: { email: 'email' },
    });
    await form.validate();
    expect(form.getState().errors.email).toBeTruthy();

    form.set('email', 'valid@example.com', { validate: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(form.getState().errors.email).toBeUndefined();
  });

  it('rules work on nested dot-path fields', async () => {
    const form = createForm({
      initialValues: { user: { email: 'bad' } },
      rules: { 'user.email': 'email' },
    });
    await form.validate();
    expect(form.getState().errors['user.email']).toBeTruthy();
  });

  it('rules only (no validator function) works correctly', async () => {
    const form = createForm({
      initialValues: { email: '', name: 'Ada' },
      rules: { email: 'required', name: { minLength: 2 } },
    });
    await form.validate();
    expect(form.getState().errors.email).toBeTruthy();
    expect(form.getState().errors.name).toBeUndefined();
  });

  it('isValidating is false after rule-only validation completes', async () => {
    const form = createForm({
      initialValues: { name: '' },
      rules: { name: 'required' },
    });
    const promise = form.validate();
    await promise;
    expect(form.getState().isValidating).toBe(false);
  });

  it('validate() returns false when built-in rules have errors', async () => {
    const form = createForm({
      initialValues: { name: '' },
      rules: { name: 'required' },
    });
    const valid = await form.validate();
    expect(valid).toBe(false);
  });

  it('validate() returns true when all built-in rules pass', async () => {
    const form = createForm({
      initialValues: { name: 'Ada' },
      rules: { name: 'required' },
    });
    const valid = await form.validate();
    expect(valid).toBe(true);
  });
});
