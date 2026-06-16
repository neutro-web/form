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

  it('hydrate() uses config initialValues when adapter returns null', async () => {
    const adapter = makeMockAdapter(null);
    const form = createForm({
      initialValues: { email: 'default@test.com' },
      persistence: { adapter, debounceMs: 0 },
    });
    await form.hydrate();
    expect(form.get('email')).toBe('default@test.com');
  });

  it('setting a field value triggers adapter.write() when debounceMs is 0', async () => {
    const adapter = makeMockAdapter<{ email: string }>(null);
    const form = createForm({
      initialValues: { email: '' },
      persistence: { adapter, debounceMs: 0 },
    });
    await form.hydrate();
    adapter.write.mockClear();
    form.set('email', 'typed@test.com');
    // write is async (Promise.resolve) when debounceMs: 0 — wait one microtask
    await Promise.resolve();
    expect(adapter.write).toHaveBeenCalledWith({ email: 'typed@test.com' });
  });

  it('excluded paths are NOT written to storage', async () => {
    const adapter = makeMockAdapter<{ email: string; password: string }>(null);
    const form = createForm({
      initialValues: { email: '', password: '' },
      persistence: { adapter, debounceMs: 0, exclude: ['password'] },
    });
    await form.hydrate();
    adapter.write.mockClear();
    form.set('password', 'secret');
    await Promise.resolve();
    const writtenArg = adapter.write.mock.calls[0]?.[0] as any;
    expect(writtenArg).toBeDefined();
    expect(writtenArg.email).toBe('');
    expect('password' in writtenArg).toBe(false);
  });

  it('reset() with no args calls adapter.clear() after hydrate', async () => {
    const adapter = makeMockAdapter<{ email: string }>(null);
    const form = createForm({
      initialValues: { email: '' },
      persistence: { adapter, debounceMs: 0 },
    });
    await form.hydrate();
    form.reset();
    expect(adapter.clear).toHaveBeenCalledOnce();
  });

  it('reset(newValues) calls adapter.write(newValues) after hydrate', async () => {
    const adapter = makeMockAdapter<{ email: string }>(null);
    const form = createForm({
      initialValues: { email: '' },
      persistence: { adapter, debounceMs: 0 },
    });
    await form.hydrate();
    adapter.write.mockClear();
    form.reset({ email: 'new@test.com' });
    expect(adapter.write).toHaveBeenCalledWith({ email: 'new@test.com' });
  });

  it('storage write errors are caught and do not throw', async () => {
    const adapter = {
      read: vi.fn().mockResolvedValue(null),
      write: vi.fn().mockRejectedValue(new Error('QuotaExceededError')),
      clear: vi.fn().mockResolvedValue(undefined),
    };
    const form = createForm({
      initialValues: { email: '' },
      persistence: { adapter, debounceMs: 0 },
    });
    await form.hydrate();
    expect(() => form.set('email', 'test')).not.toThrow();
    // Allow the rejected promise to settle without unhandled rejection
    await Promise.resolve();
  });

  it('hydrate() read errors fall back to initialValues silently', async () => {
    const adapter = {
      read: vi.fn().mockRejectedValue(new Error('storage unavailable')),
      write: vi.fn(),
      clear: vi.fn(),
    };
    const form = createForm({
      initialValues: { email: 'fallback@test.com' },
      persistence: { adapter },
    });
    await form.hydrate();
    expect(form.get('email')).toBe('fallback@test.com');
  });

  it('destroy() clears the pending write timer before it fires', async () => {
    vi.useFakeTimers();
    const adapter = makeMockAdapter<{ email: string }>(null);
    const form = createForm({
      initialValues: { email: '' },
      persistence: { adapter, debounceMs: 500 },
    });
    await form.hydrate();
    form.set('email', 'pending');
    form.destroy();
    vi.advanceTimersByTime(1000);
    expect(adapter.write).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
