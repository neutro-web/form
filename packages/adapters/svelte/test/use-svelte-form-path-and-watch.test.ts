import { createForm } from '@neutro/form-core';
import { describe, expect, it } from 'vitest';
import { useSvelteFormPath, useSvelteWatch } from '../src/index';

describe('useSvelteFormPath', () => {
  it('emits the initial value on subscribe', () => {
    const form = createForm({ initialValues: { email: '' } });
    const field = useSvelteFormPath(form, 'email');
    let latest: any;
    const unsubscribe = field.subscribe((v) => {
      latest = v;
    });
    // The store's start() function fires two synchronous set() calls before
    // subscribe() returns: an explicit `{ fieldState: null }` seed, then
    // subscribeToPath's own synchronous initial callback with the real field
    // state -- so subscribers only ever observe the latter, not `null`.
    expect(latest.value).toBe('');
    expect(latest.fieldState).toEqual({ error: undefined, touched: undefined, dirty: undefined });
    unsubscribe();
  });

  it('emits updated value/fieldState when the field changes', async () => {
    const form = createForm({ initialValues: { email: '' }, rules: { email: 'email' } });
    const field = useSvelteFormPath(form, 'email');
    const seen: any[] = [];
    const unsubscribe = field.subscribe((v) => seen.push(v));

    form.set('email', 'not-an-email', { touch: true });
    await form.validate(['email']);

    const lastSeen = seen[seen.length - 1];
    expect(lastSeen.value).toBe('not-an-email');
    expect(lastSeen.fieldState?.touched).toBe(true);
    expect(lastSeen.fieldState?.error).toBeTruthy();
    unsubscribe();
  });

  it('detaches from the core engine on unsubscribe', () => {
    const form = createForm({ initialValues: { email: '' } });
    const field = useSvelteFormPath(form, 'email');
    const seen: any[] = [];
    const unsubscribe = field.subscribe((v) => seen.push(v));
    unsubscribe();

    form.set('email', 'after-unsubscribe@test.com');

    // No new emission should have landed after unsubscribing.
    expect(seen.every((v) => v.value !== 'after-unsubscribe@test.com')).toBe(true);
  });

  it('re-subscribing after a zero-subscriber window gets fresh state, not a stale closure value', () => {
    const form = createForm({ initialValues: { email: '' } });
    const field = useSvelteFormPath(form, 'email');

    let first: any;
    const unsub1 = field.subscribe((v) => {
      first = v;
    });
    unsub1();

    form.set('email', 'changed-while-unsubscribed@test.com');

    let second: any;
    const unsub2 = field.subscribe((v) => {
      second = v;
    });
    expect(second.value).toBe('changed-while-unsubscribed@test.com');
    expect(second.value).not.toBe(first.value);
    unsub2();
  });
});

describe('useSvelteWatch', () => {
  it('emits the initial snapshot of the watched paths', () => {
    const form = createForm({ initialValues: { a: '1', b: '2' } });
    const watched = useSvelteWatch(form, ['a', 'b']);
    let latest: any;
    const unsubscribe = watched.subscribe((v) => {
      latest = v;
    });
    expect(latest).toEqual({ a: '1', b: '2' });
    unsubscribe();
  });

  it('emits an updated snapshot when a watched field changes', () => {
    const form = createForm({ initialValues: { a: '1', b: '2' } });
    const watched = useSvelteWatch(form, ['a', 'b']);
    const seen: any[] = [];
    const unsubscribe = watched.subscribe((v) => seen.push(v));

    form.set('a', 'changed');

    expect(seen[seen.length - 1].a).toBe('changed');
    unsubscribe();
  });

  it('dedupes multiple watched paths and does not aggregate unwatched fields', () => {
    const form = createForm({ initialValues: { a: '1', b: '2', c: '3' } });
    const watched = useSvelteWatch(form, ['a', 'a', 'b']);
    let latest: any;
    const unsubscribe = watched.subscribe((v) => {
      latest = v;
    });
    expect(Object.keys(latest).sort()).toEqual(['a', 'b']);
    unsubscribe();
  });

  it('detaches from the core engine on unsubscribe', () => {
    const form = createForm({ initialValues: { a: '1' } });
    const watched = useSvelteWatch(form, ['a']);
    const seen: any[] = [];
    const unsubscribe = watched.subscribe((v) => seen.push(v));
    unsubscribe();

    form.set('a', 'after-unsubscribe');

    expect(seen.every((v) => v.a !== 'after-unsubscribe')).toBe(true);
  });
});
