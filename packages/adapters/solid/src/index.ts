import type { FormInstance, FormState, Path } from '@neutro/form-core';
import { createSignal, onCleanup } from 'solid-js';
import { createStore, reconcile, type Store } from 'solid-js/store';

export interface SolidFormActions<T extends object> {
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

// Bug fix: use createStore + reconcile instead of createSignal so Solid's
// fine-grained reactivity can track individual field changes rather than
// replacing the entire state signal on every mutation.
//
// `form` is captured once at call time and is not itself reactive: if the
// underlying FormInstance is swapped after this hook runs (e.g. a caller
// conditionally recreates the form), this hook will not resubscribe to the
// new instance. Call it once per stable FormInstance, same as the other two
// hooks below.
export function useSolidForm<T extends object>(
  form: FormInstance<T>
): [Store<FormState<T>>, SolidFormActions<T>] {
  const [state, setState] = createStore<FormState<T>>(form.getState());
  const unsubscribe = form.subscribe((s) => {
    setState(reconcile(s));
  });
  onCleanup(unsubscribe);
  return [
    state,
    {
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
    },
  ];
}

// Path is evaluated once at call time. For dynamic paths inside <For>, pass
// the path as a prop and call useSolidFormPath at the component level so each
// instance gets its own subscription — one per array item.
export function useSolidFormPath<T extends object>(form: FormInstance<T>, path: string) {
  const [value, setValue] = createSignal<unknown>(form.get(path as any));
  // `null` is just a placeholder to give createSignal a starting value -- it
  // is never actually observable. subscribeToPath fires its callback
  // synchronously with the real field state before this function returns, so
  // `fieldState()` always reads a real object by the time any caller (or
  // Solid's own reactive graph) can see it. The `| null` in the type below
  // exists only to describe that placeholder, not because the null case is
  // reachable in practice.
  const [fieldState, setFieldState] = createSignal<{
    error?: string;
    touched?: boolean;
    dirty?: boolean;
  } | null>(null);
  const unsubscribe = form.subscribeToPath(path as any, (v, fs) => {
    setValue(() => v);
    setFieldState(() => fs);
  });
  onCleanup(unsubscribe);
  return { value, fieldState };
}

export function useSolidWatch<T extends object>(
  form: FormInstance<T>,
  paths: Array<Path<T> | string> | Path<T> | string
): () => Record<string, unknown> {
  const pathArray = (Array.isArray(paths) ? paths : [paths]) as string[];
  const initial: Record<string, unknown> = {};
  pathArray.forEach((p) => {
    initial[p] = form.get(p as any);
  });

  const [watched, setWatched] = createSignal<Record<string, unknown>>(initial);
  const stop = form.watch(pathArray as any, (vals) => setWatched({ ...vals }));
  onCleanup(stop);

  return watched;
}
