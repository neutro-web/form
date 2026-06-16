import { describe, expect, it, vi } from 'vitest';
import { createForm } from '../src/index';

function makeMockAdapter<T>(stored: T | null = null) {
  return {
    read: vi.fn().mockResolvedValue(stored),
    write: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  };
}

describe('Persistence middleware', () => {
  it('hydrate() merges stored values with config initialValues', async () => {
    const adapter = makeMockAdapter({ email: 'stored@test.com' });
    const form = createForm({
      initialValues: { email: '', name: 'Alice' },
      persistence: { adapter, debounceMs: 0 },
    });
    await form.hydrate();
    expect(form.get('email')).toBe('stored@test.com');
    expect(form.get('name')).toBe('Alice'); // not overwritten
  });

  it('hydrate() called twice only installs one write subscription', async () => {
    const adapter = makeMockAdapter({ email: 'stored@test.com' });
    const form = createForm({
      initialValues: { email: '', name: 'Alice' },
      persistence: { adapter, debounceMs: 0 },
    });
    await form.hydrate();
    await form.hydrate();
    // Reset the write mock so we only count writes caused by the set() call below
    adapter.write.mockClear();
    form.set('email', 'new@test.com');
    // Wait for any microtasks/promises to settle
    await Promise.resolve();
    expect(adapter.write).toHaveBeenCalledTimes(1);
  });

  it('write subscription is not triggered immediately on hydrate', async () => {
    const adapter = makeMockAdapter({ email: 'stored@test.com' });
    const form = createForm({
      initialValues: { email: '', name: 'Alice' },
      persistence: { adapter, debounceMs: 0 },
    });
    await form.hydrate();
    // After hydrate, no write should have happened — only read
    await Promise.resolve();
    expect(adapter.read).toHaveBeenCalledTimes(1);
    expect(adapter.write).not.toHaveBeenCalled();
  });

  it('reset() without prior hydrate does not call adapter', async () => {
    const adapter = makeMockAdapter(null);
    const form = createForm({
      initialValues: { email: '', name: 'Alice' },
      persistence: { adapter, debounceMs: 0 },
    });
    // Do NOT call hydrate()
    form.reset();
    await Promise.resolve();
    expect(adapter.write).not.toHaveBeenCalled();
    expect(adapter.clear).not.toHaveBeenCalled();
  });
});
