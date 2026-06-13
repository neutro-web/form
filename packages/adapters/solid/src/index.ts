import { createSignal, onCleanup } from 'solid-js';
import { type Store, createStore, reconcile } from 'solid-js/store';
import type { FormInstance, FormState } from '@neutro/form-core';

export interface SolidFormActions<T extends object> {
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

// Bug fix: use createStore + reconcile instead of createSignal so Solid's
// fine-grained reactivity can track individual field changes rather than
// replacing the entire state signal on every mutation.
export function useSolidForm<T extends object>(form: FormInstance<T>): [Store<FormState<T>>, SolidFormActions<T>] {
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
      arrayAppend: form.arrayAppend,
      arrayInsert: form.arrayInsert,
      arrayRemove: form.arrayRemove,
      arrayMove: form.arrayMove,
      arraySwap: form.arraySwap,
    },
  ];
}

// Path is evaluated once at call time. For dynamic paths inside <For>, pass
// the path as a prop and call useSolidFormPath at the component level so each
// instance gets its own subscription — one per array item.
export function useSolidFormPath<T extends object>(form: FormInstance<T>, path: string) {
  const [value, setValue] = createSignal<unknown>(form.get(path));
  const [fieldState, setFieldState] = createSignal<{ error?: string; touched?: boolean; dirty?: boolean } | null>(null);
  const unsubscribe = form.subscribeToPath(path, (v, fs) => {
    setValue(() => v);
    setFieldState(() => fs);
  });
  onCleanup(unsubscribe);
  return { value, fieldState };
}
