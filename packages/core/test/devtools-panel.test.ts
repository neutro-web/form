// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createNeutroFormDevtoolsPanel } from '../src/devtools';
import { createForm } from '../src/index';

function makeContainer() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

describe('createNeutroFormDevtoolsPanel', () => {
  // ── Inline mode (container provided) ────────────────────────────────────

  it('inline: mounts DOM inside the container and clears on unsub', () => {
    const form = createForm({ initialValues: { email: '' } });
    const container = makeContainer();
    const unsub = createNeutroFormDevtoolsPanel(form, { container });
    const root = container.shadowRoot ?? container;
    expect(root.children.length).toBeGreaterThan(0);
    unsub();
    expect(root.children.length).toBe(0);
  });

  it('inline: panel reflects current state.values after mount', () => {
    const form = createForm({ initialValues: { email: 'hello@test.com' } });
    const container = makeContainer();
    const unsub = createNeutroFormDevtoolsPanel(form, { container, name: 'Test' });
    const root = container.shadowRoot ?? container;
    expect(root.textContent).toContain('hello@test.com');
    unsub();
  });

  it('inline: panel updates when form.set() is called', () => {
    const form = createForm({ initialValues: { email: '' } });
    const container = makeContainer();
    const unsub = createNeutroFormDevtoolsPanel(form, { container });
    form.set('email', 'updated@test.com');
    const root = container.shadowRoot ?? container;
    expect(root.textContent).toContain('updated@test.com');
    unsub();
  });

  it('inline: panel shows error text when an error is set', async () => {
    const form = createForm({
      initialValues: { email: '' },
      validator: (v) => (v.email ? {} : { email: 'Required' }),
    });
    const container = makeContainer();
    const unsub = createNeutroFormDevtoolsPanel(form, { container });
    await form.validate();
    const root = container.shadowRoot ?? container;
    expect(root.textContent).toContain('Required');
    unsub();
  });

  it('inline: action log entry appears after form.set()', () => {
    const form = createForm({ initialValues: { email: '' } });
    const container = makeContainer();
    const unsub = createNeutroFormDevtoolsPanel(form, { container });
    form.set('email', 'typed@test.com');
    const root = container.shadowRoot ?? container;
    expect(root.textContent).toContain('SET');
    unsub();
  });

  it('inline: unsubscribe stops DOM updates', () => {
    const form = createForm({ initialValues: { email: '' } });
    const container = makeContainer();
    const unsub = createNeutroFormDevtoolsPanel(form, { container });
    const root = container.shadowRoot ?? container;
    unsub();
    form.set('email', 'ghost');
    expect(root.textContent).not.toContain('ghost');
  });

  it('inline: duplicate call guard warns and returns no-op', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const form = createForm({ initialValues: { email: '' } });
    const container = makeContainer();
    const unsub1 = createNeutroFormDevtoolsPanel(form, { container });
    const unsub2 = createNeutroFormDevtoolsPanel(form, { container });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('called twice'));
    unsub1();
    unsub2();
    warnSpy.mockRestore();
  });

  it('inline: same form can power panels in two different containers', () => {
    const form = createForm({ initialValues: { email: '' } });
    const c1 = makeContainer();
    const c2 = makeContainer();
    const u1 = createNeutroFormDevtoolsPanel(form, { container: c1 });
    const u2 = createNeutroFormDevtoolsPanel(form, { container: c2 });
    const r1 = c1.shadowRoot ?? c1;
    const r2 = c2.shadowRoot ?? c2;
    expect(r1.children.length).toBeGreaterThan(0);
    expect(r2.children.length).toBeGreaterThan(0);
    u1();
    u2();
  });

  // ── Floating mode (no container) ─────────────────────────────────────────

  it('floating: mounts a fixed element on document.body', () => {
    const form = createForm({ initialValues: { email: '' } });
    const before = document.body.children.length;
    const unsub = createNeutroFormDevtoolsPanel(form, { name: 'FloatTest' });
    expect(document.body.children.length).toBeGreaterThan(before);
    unsub();
    expect(document.body.children.length).toBe(before);
  });

  it('floating: duplicate call guard warns when same form already has a floating panel', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const form = createForm({ initialValues: { email: '' } });
    const unsub1 = createNeutroFormDevtoolsPanel(form);
    const unsub2 = createNeutroFormDevtoolsPanel(form);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('floating panel is already mounted')
    );
    unsub1();
    unsub2();
    warnSpy.mockRestore();
  });

  it('floating: after unsub, can remount a new floating panel for the same form', () => {
    const form = createForm({ initialValues: { email: '' } });
    const before = document.body.children.length;
    const unsub1 = createNeutroFormDevtoolsPanel(form);
    unsub1(); // removes floating panel
    expect(document.body.children.length).toBe(before);
    // Should be allowed to mount again now
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const unsub2 = createNeutroFormDevtoolsPanel(form);
    expect(warnSpy).not.toHaveBeenCalled();
    unsub2();
    warnSpy.mockRestore();
  });

  // ── SSR guard ────────────────────────────────────────────────────────────

  it('SSR guard: returns a no-op function without throwing when document is unavailable', () => {
    const form = createForm({ initialValues: { email: '' } });
    const container = document.createElement('div');
    const origDoc = (globalThis as any).document;
    (globalThis as any).document = undefined;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let unsub: (() => void) | undefined;
    expect(() => {
      unsub = createNeutroFormDevtoolsPanel(form, { container: container as any });
    }).not.toThrow();
    expect(typeof unsub).toBe('function');
    (globalThis as any).document = origDoc;
    warnSpy.mockRestore();
    if (unsub) unsub();
  });
});
