// Svelte adapter — uses svelte/store primitives (readable) so this file
// compiles with plain tsup without needing the Svelte preprocessor.
// Consumers use the $ prefix in .svelte templates: $field.value, $field.fieldState
//
// Deliberately rune-free: nothing here uses $state/$effect/$derived. The
// `svelte` peer range (^4.0.0 || ^5.0.0) is accurate — this is a
// version-agnostic store-based adapter, not a Svelte-5-specific one. It
// works unchanged on Svelte 4, and stores remain fully idiomatic and
// auto-subscribable (`$field`) in Svelte 5 templates.

import type { FormInstance, FormState, Path } from '@neutro/form-core';
import { type Readable, readable } from 'svelte/store';

export interface SvelteFormReturn<T extends object> {
  state: Readable<FormState<T>>;
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

export function useSvelteForm<T extends object>(form: FormInstance<T>): SvelteFormReturn<T> {
  const state = readable<FormState<T>>(form.getState(), (set) => {
    // Re-seed with current state on each re-subscription so re-mounted
    // components don't show stale state from before the zero-subscriber window.
    set(form.getState());
    return form.subscribe((s) => set(s));
  });
  return {
    state,
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

export function useSvelteFormPath<T extends object>(form: FormInstance<T>, path: string) {
  const field = readable<{
    value: unknown;
    fieldState: { error?: string; touched?: boolean; dirty?: boolean } | null;
  }>({ value: form.get(path as any), fieldState: null }, (set) => {
    set({ value: form.get(path as any), fieldState: null });
    return form.subscribeToPath(path as any, (v, fs) => set({ value: v, fieldState: fs }));
  });
  return field;
}

export function useSvelteWatch<T extends object>(
  form: FormInstance<T>,
  paths: Array<Path<T> | string> | Path<T> | string
): Readable<Record<string, unknown>> {
  const pathArray = (Array.isArray(paths) ? paths : [paths]) as string[];
  const initial: Record<string, unknown> = {};
  pathArray.forEach((p) => {
    initial[p] = form.get(p as any);
  });

  return readable<Record<string, unknown>>(initial, (set) => {
    const stop = form.watch(pathArray as any, (vals) => set({ ...vals }));
    return stop;
  });
}
