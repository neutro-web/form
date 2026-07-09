import { describe, expect, it } from 'vitest';
import { createForm } from '../src/index.js';

describe('validatedPaths renaming (rekeyArrayState/arraySwap consolidation baseline)', () => {
  it("arrayMove correctly re-validates the moved item's path", async () => {
    const form = createForm({
      initialValues: { items: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] },
      rules: { 'items.*.name': 'required' },
    });
    await form.validate(['items.0.name', 'items.1.name', 'items.2.name']);
    form.arrayMove('items', 0, 2);
    expect(form.isFieldValid('items.2.name')).not.toBeNull();
  });

  it('arraySwap correctly swaps validated-path membership between the two slots', async () => {
    const form = createForm({
      initialValues: { items: [{ name: 'a' }, { name: 'b' }] },
      rules: { 'items.*.name': 'required' },
    });
    await form.validate(['items.0.name']);
    expect(form.isFieldValid('items.0.name')).not.toBeNull();
    expect(form.isFieldValid('items.1.name')).toBeNull();
    form.arraySwap('items', 0, 1);
    expect(form.isFieldValid('items.1.name')).not.toBeNull();
    expect(form.isFieldValid('items.0.name')).toBeNull();
  });
});
