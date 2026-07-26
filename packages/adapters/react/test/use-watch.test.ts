// @vitest-environment jsdom

import { createForm } from '@neutro/form-core';
import { act, render } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { useWatch } from '../src/index.js';

describe('useWatch', () => {
  it('does not resubscribe on every render when called with an inline array literal', () => {
    const form = createForm({ initialValues: { a: '1', b: '2' } });
    let effectRuns = 0;
    let outerRenderCount = 0;

    const originalWatch = (form as any).watch.bind(form);
    (form as any).watch = (...args: any[]) => {
      effectRuns++;
      return originalWatch(...args);
    };

    function Child() {
      // Inline array literal -- a new reference every render of the parent.
      useWatch(form as any, ['a', 'b'] as any);
      return null;
    }

    function Parent({ tick }: { tick: number }) {
      outerRenderCount++;
      return React.createElement('div', { 'data-tick': tick }, React.createElement(Child));
    }

    const { rerender } = render(React.createElement(Parent, { tick: 0 }));
    expect(effectRuns).toBe(1);

    // Force several parent re-renders that don't change the watched paths.
    for (let i = 1; i <= 5; i++) {
      rerender(React.createElement(Parent, { tick: i }));
    }
    expect(outerRenderCount).toBe(6);
    // The watch effect should not have torn down/resubscribed on any of those renders.
    expect(effectRuns).toBe(1);
  });

  it('still resubscribes when the watched paths actually change', () => {
    const form = createForm({ initialValues: { a: '1', b: '2', c: '3' } });
    let effectRuns = 0;
    const originalWatch = (form as any).watch.bind(form);
    (form as any).watch = (...args: any[]) => {
      effectRuns++;
      return originalWatch(...args);
    };

    function Child({ paths }: { paths: string[] }) {
      useWatch(form as any, paths as any);
      return null;
    }

    const { rerender } = render(React.createElement(Child, { paths: ['a', 'b'] }));
    expect(effectRuns).toBe(1);

    rerender(React.createElement(Child, { paths: ['a', 'c'] }));
    expect(effectRuns).toBe(2);
  });

  it('returns updated values when a watched field changes', () => {
    const form = createForm({ initialValues: { a: '1' } });
    let latest: Record<string, unknown> = {};

    function Child() {
      latest = useWatch(form as any, ['a'] as any);
      return null;
    }

    render(React.createElement(Child));
    act(() => {
      (form as any).set('a', '2');
    });
    expect(latest.a).toBe('2');
  });

  it('resubscribes when the path list changes shape even if a naive comma-join would collide', () => {
    // ['a,b'] (one path containing a literal comma) and ['a', 'b'] (two paths)
    // both join to the string "a,b" -- a naive join-based memo key would treat
    // these as the same paths and fail to resubscribe.
    const form = createForm({ initialValues: {} as Record<string, string> });
    (form as any).set('a,b', 'combined');
    (form as any).set('a', '1');
    (form as any).set('b', '2');

    let effectRuns = 0;
    const originalWatch = (form as any).watch.bind(form);
    (form as any).watch = (...args: any[]) => {
      effectRuns++;
      return originalWatch(...args);
    };

    function Child({ paths }: { paths: string[] }) {
      useWatch(form as any, paths as any);
      return null;
    }

    const { rerender } = render(React.createElement(Child, { paths: ['a,b'] }));
    expect(effectRuns).toBe(1);

    rerender(React.createElement(Child, { paths: ['a', 'b'] }));
    expect(effectRuns).toBe(2);
  });
});
