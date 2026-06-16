// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createForm } from '../src/index';
import { createDevtoolsPanel } from '../src/devtools';

describe('createDevtoolsPanel', () => {
  it('mounts a DOM element inside the container', () => {
    const form = createForm({ initialValues: { email: '' } });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const unsub = createDevtoolsPanel(form, container);
    const effectiveRoot = container.shadowRoot ?? container;
    expect(effectiveRoot.children.length).toBeGreaterThan(0);
    unsub();
    expect(effectiveRoot.children.length).toBe(0);
    document.body.removeChild(container);
  });
});
