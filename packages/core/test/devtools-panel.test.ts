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
    // Panel is appended either to a Shadow DOM root or directly to container (light DOM fallback)
    const effectiveRoot = container.shadowRoot ?? container;
    expect(effectiveRoot.children.length).toBeGreaterThan(0);
    unsub();
    document.body.removeChild(container);
  });
});
