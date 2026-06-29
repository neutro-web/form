import type { FormInstance, FormState, Path } from '@neutro/form-core';
import {
  computed,
  type DeepReadonly,
  getCurrentInstance,
  type MaybeRef,
  onUnmounted,
  readonly,
  ref,
  type ShallowRef,
  shallowRef,
  unref,
  watch,
  watchEffect,
} from 'vue';

export interface VueFormReturn<T extends object> {
  state: DeepReadonly<ShallowRef<FormState<T>>>;
  get: FormInstance<T>['get'];
  set: FormInstance<T>['set'];
  connect: FormInstance<T>['connect'];
  submit: FormInstance<T>['submit'];
  handleSubmit: FormInstance<T>['handleSubmit'];
  reset: FormInstance<T>['reset'];
  batch: FormInstance<T>['batch'];
  validate: FormInstance<T>['validate'];
  subscribeToPath: FormInstance<T>['subscribeToPath'];
  getPayload: FormInstance<T>['getPayload'];
  getAriaProps: FormInstance<T>['getAriaProps'];
  getFieldMode: FormInstance<T>['getFieldMode'];
  getConnectedCount: FormInstance<T>['getConnectedCount'];
  destroy: FormInstance<T>['destroy'];
  arrayAppend: FormInstance<T>['arrayAppend'];
  arrayInsert: FormInstance<T>['arrayInsert'];
  arrayRemove: FormInstance<T>['arrayRemove'];
  arrayMove: FormInstance<T>['arrayMove'];
  arraySwap: FormInstance<T>['arraySwap'];
  setErrors: FormInstance<T>['setErrors'];
  clearErrors: FormInstance<T>['clearErrors'];
  resetField: FormInstance<T>['resetField'];
  isDirty: FormInstance<T>['isDirty'];
  isFieldDirty: FormInstance<T>['isFieldDirty'];
  isFieldValid: FormInstance<T>['isFieldValid'];
  focus: FormInstance<T>['focus'];
  focusFirstError: FormInstance<T>['focusFirstError'];
  hydrate: FormInstance<T>['hydrate'];
  watch: FormInstance<T>['watch'];
  setDynamic: FormInstance<T>['setDynamic'];
  getDynamic: FormInstance<T>['getDynamic'];
  subscribeToPathDynamic: FormInstance<T>['subscribeToPathDynamic'];
}

export function useVueForm<T extends object>(form: FormInstance<T>): VueFormReturn<T> {
  const state = shallowRef<FormState<T>>(form.getState());
  const unsubscribe = form.subscribe((s) => {
    state.value = s;
  });
  if (getCurrentInstance()) onUnmounted(unsubscribe);
  return {
    state: readonly(state),
    get: form.get,
    set: form.set,
    connect: form.connect,
    submit: form.submit,
    handleSubmit: form.handleSubmit,
    reset: form.reset,
    batch: form.batch,
    validate: form.validate,
    subscribeToPath: form.subscribeToPath,
    getPayload: form.getPayload,
    getAriaProps: form.getAriaProps,
    getFieldMode: form.getFieldMode,
    getConnectedCount: form.getConnectedCount,
    destroy: form.destroy,
    arrayAppend: form.arrayAppend,
    arrayInsert: form.arrayInsert,
    arrayRemove: form.arrayRemove,
    arrayMove: form.arrayMove,
    arraySwap: form.arraySwap,
    setErrors: form.setErrors,
    clearErrors: form.clearErrors,
    resetField: form.resetField,
    isDirty: form.isDirty,
    isFieldDirty: form.isFieldDirty,
    isFieldValid: form.isFieldValid,
    focus: form.focus,
    focusFirstError: form.focusFirstError,
    hydrate: form.hydrate,
    watch: form.watch,
    setDynamic: form.setDynamic,
    getDynamic: form.getDynamic,
    subscribeToPathDynamic: form.subscribeToPathDynamic,
  };
}

// Accepts MaybeRef<string> so the path itself can be reactive (e.g. inside v-for).
export function useVueFormPath<T extends object>(form: FormInstance<T>, path: MaybeRef<string>) {
  const value = shallowRef<unknown>(form.get(unref(path) as any));
  const fieldState = shallowRef<{ error?: string; touched?: boolean; dirty?: boolean } | null>(
    null
  );

  let unsubscribe = form.subscribeToPath(unref(path) as any, (v: unknown, fs) => {
    value.value = v;
    fieldState.value = fs;
  });

  watch(
    () => unref(path),
    (newPath) => {
      unsubscribe();
      value.value = form.get(newPath as any);
      fieldState.value = null;
      unsubscribe = form.subscribeToPath(newPath as any, (v: unknown, fs) => {
        value.value = v;
        fieldState.value = fs;
      });
    }
  );

  if (getCurrentInstance()) onUnmounted(() => unsubscribe());

  return { value: readonly(value), fieldState: readonly(fieldState) };
}

export function useVueWatch<T extends object>(
  form: FormInstance<T>,
  paths: Array<Path<T> | string> | Path<T> | string
): DeepReadonly<import('vue').Ref<Record<string, unknown>>> {
  const pathArray = computed(() => (Array.isArray(paths) ? paths : [paths]) as string[]);

  const watched = ref<Record<string, unknown>>({});

  let stop: (() => void) | null = null;

  const resubscribe = () => {
    if (stop) stop();
    const current = pathArray.value;
    stop = form.watch(current as any, (vals) => {
      watched.value = { ...vals };
    });
  };

  watchEffect(resubscribe);
  if (getCurrentInstance())
    onUnmounted(() => {
      if (stop) stop();
    });

  return readonly(watched) as DeepReadonly<import('vue').Ref<Record<string, unknown>>>;
}
