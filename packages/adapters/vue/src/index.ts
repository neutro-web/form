import { shallowRef, readonly, unref, watch, onUnmounted, type MaybeRef } from 'vue';

export function useVueForm<T extends object>(form: any) {
  const state = shallowRef(form.getState());
  const unsubscribe = form.subscribe((s: any) => { state.value = s; });
  onUnmounted(unsubscribe);
  return {
    state: readonly(state),
    get: form.get,
    set: form.set,
    connect: form.connect,
    submit: form.submit,
    handleSubmit: form.handleSubmit,
    reset: form.reset,
    batch: form.batch,
    arrayAppend: form.arrayAppend,
    arrayInsert: form.arrayInsert,
    arrayRemove: form.arrayRemove,
    arrayMove: form.arrayMove,
    arraySwap: form.arraySwap,
  };
}

// Accepts MaybeRef<string> so the path itself can be reactive (e.g. inside v-for).
export function useVueFormPath(form: any, path: MaybeRef<string>) {
  const value = shallowRef<unknown>(form.get(unref(path)));
  const fieldState = shallowRef<{ error?: string; touched?: boolean; dirty?: boolean } | null>(null);

  let unsubscribe = form.subscribeToPath(unref(path), (v: unknown, fs: any) => {
    value.value = v;
    fieldState.value = fs;
  });

  watch(
    () => unref(path),
    (newPath) => {
      unsubscribe();
      value.value = form.get(newPath);
      fieldState.value = null;
      unsubscribe = form.subscribeToPath(newPath, (v: unknown, fs: any) => {
        value.value = v;
        fieldState.value = fs;
      });
    }
  );

  onUnmounted(() => unsubscribe());

  return { value: readonly(value), fieldState: readonly(fieldState) };
}
