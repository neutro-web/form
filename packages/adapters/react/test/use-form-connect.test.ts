// @vitest-environment jsdom

import { createForm } from '@neutro/form-core';
import { render } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { useFormConnect } from '../src/index.js';

describe('useFormConnect', () => {
  it('returns a stable ref-callback identity per path across re-renders', () => {
    const form = createForm({ initialValues: { name: '' } });
    const refCallbacks: Array<(el: HTMLElement | null) => void> = [];

    function Field({ tick }: { tick: number }) {
      const connectField = useFormConnect(form as any);
      refCallbacks.push(connectField('name'));
      return React.createElement('input', { 'data-tick': tick });
    }

    const { rerender } = render(React.createElement(Field, { tick: 0 }));
    rerender(React.createElement(Field, { tick: 1 }));
    rerender(React.createElement(Field, { tick: 2 }));

    expect(refCallbacks).toHaveLength(3);
    // Same path called inline on every render must yield the SAME function
    // reference -- otherwise React sees a changed `ref` prop and disconnects +
    // reconnects the element on every parent re-render.
    expect(refCallbacks[0]).toBe(refCallbacks[1]);
    expect(refCallbacks[1]).toBe(refCallbacks[2]);
  });

  it('does not disconnect/reconnect the element on unrelated re-renders', () => {
    const form = createForm({ initialValues: { name: '' } });
    let connectCount = 0;
    const originalConnect = (form as any).connect.bind(form);
    (form as any).connect = (...args: any[]) => {
      connectCount++;
      return originalConnect(...args);
    };

    function Field({ tick }: { tick: number }) {
      const connectField = useFormConnect(form as any);
      return React.createElement('input', { 'data-tick': tick, ref: connectField('name') });
    }

    const { rerender } = render(React.createElement(Field, { tick: 0 }));
    expect(connectCount).toBe(1);

    for (let i = 1; i <= 4; i++) {
      rerender(React.createElement(Field, { tick: i }));
    }
    // A stable ref identity means React never re-invokes the ref callback on
    // these re-renders, so connect() should still have been called exactly once.
    expect(connectCount).toBe(1);
  });

  it('uses the latest options on reconnect even though the callback identity is cached', () => {
    const form = createForm({ initialValues: { name: '' } });
    const seenOptions: Array<unknown> = [];
    const originalConnect = (form as any).connect.bind(form);
    (form as any).connect = (path: string, el: HTMLElement, options?: unknown) => {
      seenOptions.push(options);
      return originalConnect(path, el, options);
    };

    function Field({ persist }: { persist: boolean }) {
      const connectField = useFormConnect(form as any);
      return React.createElement('input', { ref: connectField('name', { persist }) });
    }

    const { unmount } = render(React.createElement(Field, { persist: false }));
    expect(seenOptions[0]).toEqual({ persist: false });

    // Remount with different options -- an actual (dis)connect cycle should pick
    // up the new options via the latestOptions side-map, not a stale closure.
    unmount();
    render(React.createElement(Field, { persist: true }));
    expect(seenOptions[seenOptions.length - 1]).toEqual({ persist: true });
  });
});
