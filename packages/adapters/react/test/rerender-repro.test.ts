// @vitest-environment jsdom

import { createForm } from '@neutro/form-core';
import { act, render } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { useFormPath } from '../src/index.js';

const FIELDS = Array.from({ length: 10 }, (_, i) => `field${i}`);

function buildApp(childUsesAdapterHook: boolean) {
  const renders: Record<string, number> = {};
  const form = createForm({ initialValues: Object.fromEntries(FIELDS.map((n) => [n, ''])) });

  function FieldHandRolled({ name }: { name: string }) {
    renders[name] = (renders[name] ?? 0) + 1;
    const value = React.useSyncExternalStore(
      (cb) => (form as any).subscribeToPath(name, cb),
      () => (form as any).get(name)
    );
    return React.createElement('input', {
      'data-testid': name,
      value: value as string,
      onChange: (e: any) => (form as any).set(name, e.target.value),
    });
  }

  function FieldAdapterHook({ name }: { name: string }) {
    renders[name] = (renders[name] ?? 0) + 1;
    const value = useFormPath(form as any, name as any);
    return React.createElement('input', {
      'data-testid': name,
      value: value as string,
      onChange: (e: any) => (form as any).set(name, e.target.value),
    });
  }

  const Field = childUsesAdapterHook ? FieldAdapterHook : FieldHandRolled;

  function Page() {
    // Mirrors the real demo's parent: subscribes to field0 alone, for an error banner.
    const field0Error = React.useSyncExternalStore(
      (cb) => (form as any).subscribeToPath('field0', cb),
      () => (form as any).getState().errors.field0 ?? ''
    );
    return React.createElement(
      'section',
      null,
      FIELDS.map((name) => React.createElement(Field, { key: name, name })),
      React.createElement('div', null, field0Error)
    );
  }

  return { Page, renders, form };
}

describe('React adapter re-render overhead: hand-rolled useSyncExternalStore vs useFormPath', () => {
  it('hand-rolled useSyncExternalStore (unstable subscribe/getSnapshot identity) renders field0 twice per value change', () => {
    const { Page, renders, form } = buildApp(false);
    render(React.createElement(Page));

    for (let i = 0; i < 20; i++) {
      act(() => {
        (form as any).set('field0', `x${i}`);
      });
    }

    // 1 mount render + 40 (2x the 20 set() calls) -- matches the real bench demo's
    // observed 40 total re-renders for this exact scenario.
    expect(renders.field0).toBe(41);
    // Siblings never re-render -- the effect is confined to field0 itself, not a cascade.
    for (let i = 1; i < 10; i++) {
      expect(renders[`field${i}`]).toBe(1);
    }
  });

  it("adapter's useFormPath (stable, useCallback-wrapped subscribe/getSnapshot) renders field0 once per value change", () => {
    const { Page, renders, form } = buildApp(true);
    render(React.createElement(Page));

    for (let i = 0; i < 20; i++) {
      act(() => {
        (form as any).set('field0', `x${i}`);
      });
    }

    // 1 mount render + 20 (exactly 1 per set() call) -- the clean baseline.
    expect(renders.field0).toBe(21);
    for (let i = 1; i < 10; i++) {
      expect(renders[`field${i}`]).toBe(1);
    }
  });
});
