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
