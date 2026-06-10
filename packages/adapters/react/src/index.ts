import { useSyncExternalStore, useCallback, useRef } from 'react';

export function useForm<T extends object>(form: any) {
  const state = useSyncExternalStore(form.subscribe, form.getState, form.getState);
  return {
    state,
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

// Bug #1 fix: wrap the callback so React's () => void notifier adapts to
// PathSubscriber's (value, fieldState) => void signature.
export function useFormPath<T extends object>(form: any, path: string) {
  const subscribe = useCallback(
    (onStoreChange: () => void) => form.subscribeToPath(path, () => onStoreChange()),
    [form, path]
  );
  const getSnapshot = useCallback(() => form.get(path), [form, path]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// Zero-rerender hook: wires a DOM input directly via form.connect() without
// touching React state. Equivalent to RHF's register() pattern.
// Cleanups are tracked in a ref so StrictMode double-mount doesn't leak listeners.
export function useFormConnect(form: any) {
  const cleanups = useRef(new Map<string, () => void>());
  return useCallback(
    (path: string, options?: any) =>
      (el: HTMLElement | null) => {
        if (el) {
          cleanups.current.get(path)?.();
          cleanups.current.set(path, form.connect(path, el, options));
        } else {
          cleanups.current.get(path)?.();
          cleanups.current.delete(path);
        }
      },
    [form]
  );
}
