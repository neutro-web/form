// @vitest-environment jsdom

import { createForm } from '@neutro/form-core';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { useVueFormPath } from '../src/index.js';

const FIELDS = Array.from({ length: 10 }, (_, i) => `field${i}`);

describe('Vue adapter re-render baseline: whole-form parent + useVueFormPath children', () => {
  it('field0 re-renders once per value change, siblings never re-render, matching the real demo structure', async () => {
    const renders: Record<string, number> = {};
    const form = createForm({ initialValues: Object.fromEntries(FIELDS.map((n) => [n, ''])) });

    const FieldComponent = defineComponent({
      props: { name: { type: String, required: true } },
      setup(props) {
        const { value } = useVueFormPath(form as any, props.name as any);
        return () => {
          renders[props.name] = (renders[props.name] ?? 0) + 1;
          return h('input', {
            'data-testid': props.name,
            value: value.value as string,
            onInput: (e: Event) =>
              (form as any).set(props.name, (e.target as HTMLInputElement).value),
          });
        };
      },
    });

    const Page = defineComponent({
      setup() {
        // Mirrors the real Vue demo's parent: a whole-form subscription, not per-field.
        const state = ref(form.getState());
        form.subscribe((s: any) => {
          state.value = s;
        });
        return () =>
          h('section', [
            ...FIELDS.map((name) => h(FieldComponent, { key: name, name })),
            h('div', state.value.errors.field0 ?? ''),
          ]);
      },
    });

    mount(Page);

    // Vue's scheduler batches synchronous mutations into a single flush -- awaiting
    // nextTick() after each set() is required to observe one render per value change,
    // mirroring the 20 discrete keystrokes the real browser bench measures one at a
    // time (a real DOM keystroke always has a render opportunity between events).
    // Without this, Vue coalesces all 20 into a single post-loop render.
    for (let i = 0; i < 20; i++) {
      (form as any).set('field0', `x${i}`);
      await nextTick();
    }

    expect(renders.field0).toBe(21); // 1 mount + 20, exactly 1 per set() call.
    for (let i = 1; i < 10; i++) {
      expect(renders[`field${i}`]).toBe(1); // Siblings never re-render.
    }
  });
});
