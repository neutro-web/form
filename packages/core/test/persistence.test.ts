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
});
