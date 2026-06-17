import type { FormInstance, FormState, GetPathValue, Path } from '@neutro/form-core';
import React, { useCallback, useRef, useSyncExternalStore } from 'react';

export function useForm<T extends object>(
  form: FormInstance<T>
): FormState<T> & Omit<FormInstance<T>, 'subscribe' | 'getState' | '_subscribeToActions'> {
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
  } as FormState<T> & Omit<FormInstance<T>, 'subscribe' | 'getState' | '_subscribeToActions'>;
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

export function useWatch<T extends object>(
  form: FormInstance<T>,
  paths: Path<T> | string | Array<Path<T> | string>
): Record<string, unknown> {
  const pathArray = Array.isArray(paths) ? paths : [paths]
  const [watched, setWatched] = React.useState<Record<string, unknown>>(() => {
    const snap: Record<string, unknown> = {}
    pathArray.forEach(p => { snap[p as string] = form.get(p as any) })
    return snap
  })

  React.useEffect(() => {
    const stop = form.watch(paths, (vals) => setWatched({ ...vals }))
    return stop
  }, [form, JSON.stringify(pathArray)])

  return watched
}

// Zero-rerender hook: wires a DOM input directly via form.connect() without
// touching React state. Equivalent to RHF's register() pattern.
// Cleanups are tracked in a ref so StrictMode double-mount doesn't leak listeners.
export function useFormConnect(form: any) {
  const cleanups = useRef(new Map<string, () => void>());
  return useCallback(
    (path: string, options?: any) => (el: HTMLElement | null) => {
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
