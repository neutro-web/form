import { createSignal, onCleanup } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';

// Bug fix: use createStore + reconcile instead of createSignal so Solid's
// fine-grained reactivity can track individual field changes rather than
// replacing the entire state signal on every mutation.
export function useSolidForm<T extends object>(form: any) {
  const [state, setState] = createStore<any>(form.getState());
  const unsubscribe = form.subscribe((s: any) => {
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
  ] as const;
}

// Note: path() is evaluated once at call time. For dynamic paths, use
// createMemo(() => state.values[path()]) on the store returned from useSolidForm.
export function useSolidFormPath(form: any, path: () => string) {
  const [value, setValue] = createSignal<unknown>(form.get(path()));
  const [fieldState, setFieldState] = createSignal<{ error?: string; touched?: boolean; dirty?: boolean } | null>(null);
  const unsubscribe = form.subscribeToPath(path(), (v: unknown, fs: any) => {
    setValue(() => v);
    setFieldState(() => fs);
  });
  onCleanup(unsubscribe);
  return { value, fieldState };
}
