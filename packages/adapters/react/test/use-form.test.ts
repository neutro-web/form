// @vitest-environment jsdom

import { createForm } from '@neutro/form-core';
import { act, render } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { useForm } from '../src/index.js';

describe('useForm', () => {
  it('mounts without crashing and does not tear (regression: useSyncExternalStore snapshot instability)', () => {
    const form = createForm({ initialValues: { name: '', age: 0 } });
    let renderCount = 0;

    function Page() {
      renderCount++;
      const { values } = useForm(form as any);
      return React.createElement('div', { 'data-testid': 'name' }, values.name);
    }

    // Previously: form.getState (a non-memoized snapshot fn) passed directly to
    // useSyncExternalStore threw "Maximum update depth exceeded" on mount.
    expect(() => render(React.createElement(Page))).not.toThrow();
    // One mount render only -- no infinite re-render loop.
    expect(renderCount).toBe(1);
  });

  it('re-renders exactly once per actual form.set() call', () => {
    const form = createForm({ initialValues: { name: '' } });
    let renderCount = 0;

    function Page() {
      renderCount++;
      const { values } = useForm(form as any);
      return React.createElement('div', null, values.name);
    }

    render(React.createElement(Page));
    expect(renderCount).toBe(1);

    for (let i = 0; i < 5; i++) {
      act(() => {
        (form as any).set('name', `x${i}`);
      });
    }
    expect(renderCount).toBe(6);
  });

  it('reflects the latest state after a change', () => {
    const form = createForm({ initialValues: { name: 'initial' } });
    let latest = '';

    function Page() {
      const { values } = useForm(form as any);
      latest = values.name;
      return null;
    }

    render(React.createElement(Page));
    act(() => {
      (form as any).set('name', 'updated');
    });
    expect(latest).toBe('updated');
  });
});
