// @vitest-environment jsdom

import { createForm } from '@neutro/form-core';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';
import { useVueForm } from '../src/index.js';

describe('useVueForm — real component mount/unmount', () => {
  it('unsubscribes from the core engine when the component unmounts', () => {
    const form = createForm({ initialValues: { email: '' } });
    let state: any;
    const Comp = defineComponent({
      setup() {
        ({ state } = useVueForm(form as any));
        return () => h('div');
      },
    });
    const wrapper = mount(Comp);
    wrapper.unmount();

    const beforeUnmount = state.value;
    (form as any).set('email', 'after-unmount@test.com');

    expect(state.value).toBe(beforeUnmount);
    expect(state.value.values.email).not.toBe('after-unmount@test.com');
  });
});
