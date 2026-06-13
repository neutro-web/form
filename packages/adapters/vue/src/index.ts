import { type DeepReadonly, type ShallowRef, shallowRef, readonly, unref, watch, onUnmounted, type MaybeRef } from 'vue';
import type { FormInstance, FormState } from '@neutro/form-core';

export interface VueFormReturn<T extends object> {
  state: DeepReadonly<ShallowRef<FormState<T>>>;
  get: FormInstance<T>['get'];
  set: FormInstance<T>['set'];
  connect: FormInstance<T>['connect'];
  submit: FormInstance<T>['submit'];
  handleSubmit: FormInstance<T>['handleSubmit'];
  reset: FormInstance<T>['reset'];
  batch: FormInstance<T>['batch'];
  arrayAppend: FormInstance<T>['arrayAppend'];
  arrayInsert: FormInstance<T>['arrayInsert'];
  arrayRemove: FormInstance<T>['arrayRemove'];
  arrayMove: FormInstance<T>['arrayMove'];
  arraySwap: FormInstance<T>['arraySwap'];
}

export function useVueForm<T extends object>(form: FormInstance<T>): VueFormReturn<T> {
  const state = shallowRef<FormState<T>>(form.getState());
  const unsubscribe = form.subscribe((s) => { state.value = s; });
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
export function useVueFormPath<T extends object>(form: FormInstance<T>, path: MaybeRef<string>) {
  const value = shallowRef<unknown>(form.get(unref(path)));
  const fieldState = shallowRef<{ error?: string; touched?: boolean; dirty?: boolean } | null>(null);

  let unsubscribe = form.subscribeToPath(unref(path), (v: unknown, fs) => {
    value.value = v;
    fieldState.value = fs;
  });

  watch(
    () => unref(path),
    (newPath) => {
      unsubscribe();
      value.value = form.get(newPath);
      fieldState.value = null;
      unsubscribe = form.subscribeToPath(newPath, (v: unknown, fs) => {
        value.value = v;
        fieldState.value = fs;
      });
    }
  );

  onUnmounted(() => unsubscribe());

  return { value: readonly(value), fieldState: readonly(fieldState) };
}
