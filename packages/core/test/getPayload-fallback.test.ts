// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createForm } from '../src/index.js';

describe('getPayload/submit fallback when nothing connected/persisted', () => {
  it('getPayload returns full values when no field is connected', () => {
    const form = createForm({ initialValues: { name: 'x', age: 5 } });
    expect(form.getPayload()).toEqual({ name: 'x', age: 5 });
  });

  it('submit callback receives full values when no field is connected', async () => {
    const form = createForm({ initialValues: { name: 'x' } });
    let received: unknown;
    await form.submit(async (payload) => {
      received = payload;
    });
    expect(received).toEqual({ name: 'x' });
  });

  it('once a field is connected, filtering resumes as before', () => {
    const form = createForm({ initialValues: { name: 'x', age: 5 } });
    const el = document.createElement('input');
    const disconnect = form.connect('name', el);
    expect(form.getPayload()).toEqual({ name: 'x' });
    disconnect();
  });
});
