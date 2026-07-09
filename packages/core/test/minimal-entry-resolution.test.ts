import { createForm } from '@neutro/form-core/minimal';
import { describe, expect, it } from 'vitest';

describe('minimal entry point resolves via source alias', () => {
  it('createForm is a function', () => {
    expect(typeof createForm).toBe('function');
  });
});
