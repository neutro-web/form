import type {
  ConnectOptions,
  FormInstance,
  FormState,
  GetPathValue,
  Path,
} from '@neutro/form-core';
import React, { useCallback, useRef, useSyncExternalStore } from 'react';

export function useForm<T extends object>(
  form: FormInstance<T>
): FormState<T> & Omit<FormInstance<T>, 'subscribe' | 'getState' | '_subscribeToActions'> {
  // form.getState() allocates a brand-new object every call (deep-cloned values,
  // spread errors/touched/dirty) -- it can never be passed directly as
  // useSyncExternalStore's getSnapshot, which requires a referentially stable
  // result between renders when nothing changed. Cache the snapshot in a ref and
  // only replace it when form.subscribe's callback actually fires from a real
  // notification (skipping the synchronous initial call subscribe() makes on
  // registration, which would otherwise force one extra render per mount).
  const cacheRef = useRef<{ form: FormInstance<T>; snapshot: FormState<T> } | null>(null);
  if (cacheRef.current === null || cacheRef.current.form !== form) {
    cacheRef.current = { form, snapshot: form.getState() };
  }
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      let skipFirst = true;
      return form.subscribe(() => {
        if (skipFirst) {
          skipFirst = false;
          return;
        }
        cacheRef.current = { form, snapshot: form.getState() };
        onStoreChange();
      });
    },
    [form]
  );
  // biome-ignore lint/style/noNonNullAssertion: cacheRef.current is always populated by the render-time init above before getSnapshot can ever be called
  const getSnapshot = useCallback(() => cacheRef.current!.snapshot, []);
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
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
    subscribeToPathDynamic: form.subscribeToPathDynamic,
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
    focus: form.focus,
    focusFirstError: form.focusFirstError,
    hydrate: form.hydrate,
    watch: form.watch,
    setDynamic: form.setDynamic,
    getDynamic: form.getDynamic,
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
  const pathArray = Array.isArray(paths) ? paths : [paths];
  const pathsKey = pathArray.join(',');
  // Stabilize the array reference by content, not identity -- callers commonly
  // pass an inline array literal (`useWatch(form, ['a','b'])`), which is a new
  // reference every render and would otherwise force the effect below to tear
  // down and resubscribe on every render regardless of whether the paths changed.
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathsKey is the intentional content-based dependency key for pathArray
  const stablePaths = React.useMemo(() => pathArray, [pathsKey]);

  const [watched, setWatched] = React.useState<Record<string, unknown>>(() => {
    const snap: Record<string, unknown> = {};
    pathArray.forEach((p) => {
      snap[p as string] = form.get(p as any);
    });
    return snap;
  });

  React.useEffect(() => {
    const stop = form.watch(stablePaths as any, (vals) => setWatched({ ...vals }));
    return stop;
  }, [form, stablePaths]);

  return watched;
}

// Zero-rerender hook: wires a DOM input directly via form.connect() without
// touching React state. Equivalent to RHF's register() pattern.
// Cleanups are tracked in a ref so StrictMode double-mount doesn't leak listeners.
export function useFormConnect<T extends object>(form: FormInstance<T>) {
  const cleanups = useRef(new Map<string, () => void>());
  // Ref-callback identity is cached per path so calling connectField('name') with
  // the same path across renders returns the SAME function reference. Without
  // this, every render produces a brand-new ref callback, and React treats that
  // as a changed `ref` prop -- disconnecting and reconnecting the element on
  // every parent re-render, not just once, which defeats the "zero re-render"
  // guarantee this hook is meant to provide. The latest `options` for a path are
  // kept in a side map so a changed `options` value doesn't require a new
  // callback identity -- the next (re)connect just picks up the latest value.
  const refCallbacks = useRef(new Map<string, (el: HTMLElement | null) => void>());
  const latestOptions = useRef(new Map<string, ConnectOptions | undefined>());
  return useCallback(
    (path: string, options?: ConnectOptions) => {
      latestOptions.current.set(path, options);
      let cb = refCallbacks.current.get(path);
      if (!cb) {
        cb = (el: HTMLElement | null) => {
          if (el) {
            cleanups.current.get(path)?.();
            cleanups.current.set(
              path,
              form.connect(path as any, el, latestOptions.current.get(path))
            );
          } else {
            cleanups.current.get(path)?.();
            cleanups.current.delete(path);
          }
        };
        refCallbacks.current.set(path, cb);
      }
      return cb;
    },
    [form]
  );
}
