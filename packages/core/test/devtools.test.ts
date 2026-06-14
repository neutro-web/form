// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createForm } from '../src/index';

afterEach(() => { vi.restoreAllMocks(); });

// ---------------------------------------------------------------------------
// _subscribeToActions infrastructure
// ---------------------------------------------------------------------------

describe('_subscribeToActions', () => {
  it('returns an unsubscribe function that stops delivery', () => {
    const form = createForm({ initialValues: { x: 0 } });
    const spy = vi.fn();
    const unsub = form._subscribeToActions(spy);
    form.set('x', 1);
    expect(spy).toHaveBeenCalledTimes(1);
    unsub();
    form.set('x', 2);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('delivers to multiple independent listeners', () => {
    const form = createForm({ initialValues: { x: 0 } });
    const spy1 = vi.fn();
    const spy2 = vi.fn();
    form._subscribeToActions(spy1);
    form._subscribeToActions(spy2);
    form.set('x', 99);
    expect(spy1).toHaveBeenCalledTimes(1);
    expect(spy2).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Action dispatch — non-DOM methods
// ---------------------------------------------------------------------------

describe('SET action', () => {
  it('fires with path, value, options, and post-mutation state', () => {
    const form = createForm({ initialValues: { email: '' } });
    const actions: Array<{ action: any; state: any }> = [];
    form._subscribeToActions((action, state) => actions.push({ action, state }));

    form.set('email', 'alice@example.com', { touch: true });

    expect(actions).toHaveLength(1);
    expect(actions[0].action).toEqual({
      type: 'SET',
      path: 'email',
      value: 'alice@example.com',
      options: { touch: true },
    });
    expect(actions[0].state.values.email).toBe('alice@example.com');
    expect(actions[0].state.touched.email).toBe(true);
  });

  it('state snapshot reflects post-mutation values', () => {
    const form = createForm({ initialValues: { a: 0, b: 0 } });
    const states: any[] = [];
    form._subscribeToActions((_, state) => states.push(state));
    form.set('a', 1);
    form.set('b', 2);
    expect(states[0].values).toEqual({ a: 1, b: 0 });
    expect(states[1].values).toEqual({ a: 1, b: 2 });
  });
});

describe('VALIDATE action', () => {
  it('fires with undefined paths when called without args', () => {
    const form = createForm({ initialValues: { x: '' } });
    const spy = vi.fn();
    form._subscribeToActions(spy);
    form.validate();
    expect(spy.mock.calls[0][0]).toEqual({ type: 'VALIDATE', paths: undefined });
  });

  it('fires with paths array when scoped', () => {
    const form = createForm({ initialValues: { email: '', name: '' } });
    const spy = vi.fn();
    form._subscribeToActions(spy);
    form.validate(['email']);
    expect(spy.mock.calls[0][0]).toEqual({ type: 'VALIDATE', paths: ['email'] });
  });
});

describe('SUBMIT action', () => {
  it('fires on each submit call, including concurrent calls', async () => {
    const form = createForm({ initialValues: { x: '' } });
    const spy = vi.fn();
    form._subscribeToActions(spy);
    // Both calls dispatch SUBMIT — even though the second is blocked by isSubmitting guard
    const [, p2] = [form.submit(() => {}), form.submit(() => {})];
    await p2;
    const submitCalls = spy.mock.calls.filter(([a]) => a.type === 'SUBMIT');
    expect(submitCalls).toHaveLength(2);
  });
});

describe('RESET action', () => {
  it('fires after state is cleared', () => {
    const form = createForm({ initialValues: { x: 1 } });
    form.set('x', 99);
    const spy = vi.fn();
    form._subscribeToActions(spy);
    form.reset();
    const [action, state] = spy.mock.calls[0];
    expect(action).toEqual({ type: 'RESET', newValues: undefined });
    expect(state.values.x).toBe(1);
    expect(state.dirty).toEqual({});
  });

  it('fires with newValues when provided', () => {
    const form = createForm({ initialValues: { x: 1 } });
    const spy = vi.fn();
    form._subscribeToActions(spy);
    form.reset({ x: 42 });
    expect(spy.mock.calls[0][0]).toEqual({ type: 'RESET', newValues: { x: 42 } });
  });
});

describe('SET_ERRORS action', () => {
  it('fires with the incoming errors map', () => {
    const form = createForm({ initialValues: { email: '' } });
    const spy = vi.fn();
    form._subscribeToActions(spy);
    form.setErrors({ email: 'Already taken' });
    const [action, state] = spy.mock.calls[0];
    expect(action).toEqual({ type: 'SET_ERRORS', errors: { email: 'Already taken' } });
    expect(state.errors.email).toBe('Already taken');
    expect(state.touched.email).toBe(true);
  });

  it('does not fire when errors map is empty', () => {
    const form = createForm({ initialValues: { x: '' } });
    const spy = vi.fn();
    form._subscribeToActions(spy);
    form.setErrors({});
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('BATCH_START / BATCH_END actions', () => {
  it('wraps mutations in BATCH_START then BATCH_END', () => {
    const form = createForm({ initialValues: { a: 0, b: 0 } });
    const types: string[] = [];
    form._subscribeToActions((action) => types.push(action.type));

    form.batch(() => {
      form.set('a', 1);
      form.set('b', 2);
    });

    expect(types).toEqual(['BATCH_START', 'SET', 'SET', 'BATCH_END']);
  });

  it('does not emit BATCH events for internal batch calls in setFieldValue', () => {
    const form = createForm({ initialValues: { x: 0 } });
    const types: string[] = [];
    form._subscribeToActions((action) => types.push(action.type));
    form.set('x', 1); // setFieldValue calls internal batch() — should not produce BATCH_START/END
    expect(types).toEqual(['SET']);
  });
});

describe('array operation actions', () => {
  it('ARRAY_APPEND fires with path and item', () => {
    const form = createForm({ initialValues: { items: [] as string[] } });
    const spy = vi.fn();
    form._subscribeToActions(spy);
    form.arrayAppend('items', 'hello');
    expect(spy.mock.calls[0][0]).toEqual({ type: 'ARRAY_APPEND', path: 'items', item: 'hello' });
  });

  it('ARRAY_INSERT fires with path, index, item', () => {
    const form = createForm({ initialValues: { items: ['a', 'b'] as string[] } });
    const spy = vi.fn();
    form._subscribeToActions(spy);
    form.arrayInsert('items', 1, 'x');
    expect(spy.mock.calls[0][0]).toEqual({ type: 'ARRAY_INSERT', path: 'items', index: 1, item: 'x' });
  });

  it('ARRAY_REMOVE fires with path and index', () => {
    const form = createForm({ initialValues: { items: ['a', 'b'] as string[] } });
    const spy = vi.fn();
    form._subscribeToActions(spy);
    form.arrayRemove('items', 0);
    expect(spy.mock.calls[0][0]).toEqual({ type: 'ARRAY_REMOVE', path: 'items', index: 0 });
  });

  it('ARRAY_MOVE fires with path, from, to', () => {
    const form = createForm({ initialValues: { items: ['a', 'b', 'c'] as string[] } });
    const spy = vi.fn();
    form._subscribeToActions(spy);
    form.arrayMove('items', 0, 2);
    expect(spy.mock.calls[0][0]).toEqual({ type: 'ARRAY_MOVE', path: 'items', from: 0, to: 2 });
  });

  it('ARRAY_SWAP fires with path, i, j', () => {
    const form = createForm({ initialValues: { items: ['a', 'b', 'c'] as string[] } });
    const spy = vi.fn();
    form._subscribeToActions(spy);
    form.arraySwap('items', 0, 2);
    expect(spy.mock.calls[0][0]).toEqual({ type: 'ARRAY_SWAP', path: 'items', i: 0, j: 2 });
  });
});

// ---------------------------------------------------------------------------
// Action dispatch — DOM bridge (requires jsdom)
// ---------------------------------------------------------------------------

describe('CONNECT / DISCONNECT / BLUR actions', () => {
  it('CONNECT fires when connect() is called', () => {
    const form = createForm({ initialValues: { email: '' } });
    const spy = vi.fn();
    form._subscribeToActions(spy);

    const el = document.createElement('input');
    document.body.appendChild(el);
    form.connect('email', el);
    document.body.removeChild(el);

    expect(spy.mock.calls[0][0]).toEqual({ type: 'CONNECT', path: 'email' });
  });

  it('DISCONNECT fires when the cleanup function is called', () => {
    const form = createForm({ initialValues: { email: '' } });
    const el = document.createElement('input');
    document.body.appendChild(el);
    const disconnect = form.connect('email', el);

    const spy = vi.fn();
    form._subscribeToActions(spy);
    disconnect();

    document.body.removeChild(el);
    expect(spy.mock.calls[0][0]).toEqual({ type: 'DISCONNECT', path: 'email' });
  });

  it('BLUR fires with path after touched is set to true', () => {
    const form = createForm({ initialValues: { email: '' } });
    const el = document.createElement('input');
    document.body.appendChild(el);
    form.connect('email', el);

    const spy = vi.fn();
    form._subscribeToActions(spy);
    el.dispatchEvent(new FocusEvent('blur'));

    document.body.removeChild(el);
    const [action, state] = spy.mock.calls[0];
    expect(action).toEqual({ type: 'BLUR', path: 'email' });
    expect(state.touched.email).toBe(true);
  });
});
