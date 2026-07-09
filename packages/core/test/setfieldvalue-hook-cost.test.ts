import { describe, expect, it, vi } from 'vitest';
import { createForm } from '../src/index.js';

describe('setFieldValue hook-check cost fix (behavior preservation)', () => {
  it('computed fields still update correctly after a dependency-triggering set()', () => {
    const form = createForm({
      initialValues: { a: 1, b: 0 },
      computed: { b: { fn: (v: { a: number }) => v.a * 2 } },
    });
    form.set('a', 5);
    expect(form.get('b')).toBe(10);
  });

  it('a non-computed field write with no computed config configured is unaffected', () => {
    const form = createForm({ initialValues: { x: 1 } });
    form.set('x', 2);
    expect(form.get('x')).toBe(2);
  });

  it('setting a computed field directly is still a no-op with a warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const form = createForm({
      initialValues: { a: 1, b: 0 },
      computed: { b: { fn: (v: { a: number }) => v.a * 2 } },
    });
    form.set('b', 999);
    expect(form.get('b')).toBe(2); // unchanged — still derived from a
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
