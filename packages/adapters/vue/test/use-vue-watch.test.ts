// @vitest-environment jsdom

import { createForm } from '@neutro/form-core';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';
import { useVueWatch } from '../src/index.js';

describe('useVueWatch', () => {
  it('reflects the initial snapshot of the watched paths', () => {
    const form = createForm({ initialValues: { a: '1', b: '2' } });
    let watched: any;
    const Comp = defineComponent({
      setup() {
        watched = useVueWatch(form as any, ['a', 'b']);
        return () => h('div');
      },
    });
    mount(Comp);
    expect(watched.value).toEqual({ a: '1', b: '2' });
  });

  it('updates when a watched field changes', () => {
    const form = createForm({ initialValues: { a: '1', b: '2' } });
    let watched: any;
    const Comp = defineComponent({
      setup() {
        watched = useVueWatch(form as any, ['a', 'b']);
        return () => h('div');
      },
    });
    mount(Comp);
    (form as any).set('a', 'changed');
    expect(watched.value.a).toBe('changed');
  });

  it('unsubscribes from the core engine when the component unmounts', () => {
    const form = createForm({ initialValues: { a: '1' } });
    let watched: any;
    const Comp = defineComponent({
      setup() {
        watched = useVueWatch(form as any, ['a']);
        return () => h('div');
      },
    });
    const wrapper = mount(Comp);
    wrapper.unmount();

    (form as any).set('a', 'after-unmount');

    expect(watched.value.a).not.toBe('after-unmount');
  });
});
