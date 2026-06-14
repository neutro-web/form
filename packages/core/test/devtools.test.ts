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
