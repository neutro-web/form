// @vitest-environment jsdom

import { createForm } from '@neutro/form-core';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { useVueFormPath } from '../src/index.js';

describe('useVueFormPath', () => {
  it('reflects the initial value for a path', () => {
    const form = createForm({ initialValues: { email: '' } });
    let value: any;
    const Field = defineComponent({
      setup() {
        ({ value } = useVueFormPath(form as any, 'email'));
        return () => h('div');
      },
    });
    mount(Field);
    expect(value.value).toBe('');
  });

  it('unsubscribes from the old path and subscribes to the new one when the path ref changes', async () => {
    const form = createForm({ initialValues: { a: '1', b: '2' } });
    let value: any;
    const path = ref('a');
    const Field = defineComponent({
      setup() {
        ({ value } = useVueFormPath(form as any, path));
        return () => h('div');
      },
    });
    mount(Field);
    expect(value.value).toBe('1');

    path.value = 'b';
    await nextTick();
    expect(value.value).toBe('2');

    // The old subscription (on 'a') should be torn down -- changes to 'a' no
    // longer affect this ref.
    (form as any).set('a', 'changed-a');
    expect(value.value).toBe('2');

    // The new subscription (on 'b') is live.
    (form as any).set('b', 'changed-b');
    expect(value.value).toBe('changed-b');
  });

  it('unsubscribes from the core engine when the component unmounts', () => {
    const form = createForm({ initialValues: { email: '' } });
    let value: any;
    const Field = defineComponent({
      setup() {
        ({ value } = useVueFormPath(form as any, 'email'));
        return () => h('div');
      },
    });
    const wrapper = mount(Field);
    wrapper.unmount();

    (form as any).set('email', 'after-unmount@test.com');

    // If the subscriber were still attached, `value` would have been updated.
    expect(value.value).not.toBe('after-unmount@test.com');
  });
});
