import { useSyncExternalStore, useCallback, useRef } from 'react';
import type { FormInstance, FormState, Path, GetPathValue } from '@neutro/form-core';

export function useForm<T extends object>(form: FormInstance<T>): FormState<T> & Omit<FormInstance<T>, 'subscribe' | 'getState'> {
  const state = useSyncExternalStore(form.subscribe, form.getState, form.getState);
  return {
    ...state,
    get: form.get,
    set: form.set,
    connect: form.connect,
    submit: form.submit,
    handleSubmit: form.handleSubmit,
    reset: form.reset,
    batch: form.batch,
    subscribeToPath: form.subscribeToPath,
    validate: form.validate,
    getPayload: form.getPayload,
    getConnectedCount: form.getConnectedCount,
    destroy: form.destroy,
    arrayAppend: form.arrayAppend,
    arrayInsert: form.arrayInsert,
    arrayRemove: form.arrayRemove,
    arrayMove: form.arrayMove,
    arraySwap: form.arraySwap,
  } as FormState<T> & Omit<FormInstance<T>, 'subscribe' | 'getState'>;
}

export function useFormPath<T extends object, P extends Path<T>>(
  form: FormInstance<T>,
  path: P
): GetPathValue<T, P> {
  const subscribe = useCallback(
    (onStoreChange: () => void) => form.subscribeToPath(path, () => onStoreChange()),
    [form, path]
  );
  const getSnapshot = useCallback(() => form.get(path), [form, path]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot) as GetPathValue<T, P>;
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
