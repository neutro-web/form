import { DestroyRef, inject, NgZone, type Signal, signal } from '@angular/core';
import type { FormInstance, FormState, Path } from '@neutro/form-core';

export interface AngularFormReturn<T extends object> {
  state: Signal<FormState<T>>;
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

// Must be called inside an injection context (component constructor or inject() call site).
export function useAngularForm<T extends object>(form: FormInstance<T>): AngularFormReturn<T> {
  const formSignal = signal(form.getState());
  // NgZone.run() is a defensive, idempotent wrap: zone.js already patches most
  // of the async boundaries core relies on (setTimeout, event listeners,
  // Promise), so callbacks are very likely already running inside the Angular
  // zone by the time they get here. This doesn't "ensure" change detection so
  // much as guarantee it even in the rare case a callback fires outside the
  // zone. In zoneless apps the optional inject returns null and we call set()
  // directly.
  const zone = inject(NgZone, { optional: true });
  // form.subscribe() fires its callback once synchronously on registration,
  // with the exact same state already used to seed formSignal above (nothing
  // else can run between these two statements) -- skip that redundant first
  // call instead of cloning and set()-ing an identical value again.
  let skipFirst = true;
  const unsubscribe = form.subscribe((s) => {
    if (skipFirst) {
      skipFirst = false;
      return;
    }
    zone ? zone.run(() => formSignal.set(s)) : formSignal.set(s);
  });
  inject(DestroyRef).onDestroy(unsubscribe);
  return {
    state: formSignal.asReadonly(),
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

// Returns two readonly Signals for direct template binding.
// Must be called inside an injection context.
//
// Unlike useAngularForm above, the synchronous first call subscribeToPath
// makes below is NOT skippable here: `value`'s seed (form.get(path)) does
// duplicate that first call, but `fieldState`'s seed is `null` -- there's no
// public API to read the current error/touched/dirty state synchronously
// without subscribing, so the first callback is what actually populates
// fieldState for the first time, not a redundant re-set of an already-known
// value.
export function useAngularFormPath<T extends object>(form: FormInstance<T>, path: string) {
  const value = signal<unknown>(form.get(path as any));
  const fieldState = signal<{ error?: string; touched?: boolean; dirty?: boolean } | null>(null);
  const zone = inject(NgZone, { optional: true });
  const unsubscribe = form.subscribeToPath(path as any, (v, fs) => {
    if (zone) {
      zone.run(() => {
        value.set(v);
        fieldState.set(fs);
      });
    } else {
      value.set(v);
      fieldState.set(fs);
    }
  });
  inject(DestroyRef).onDestroy(unsubscribe);
  return { value: value.asReadonly(), fieldState: fieldState.asReadonly() };
}

export function useAngularWatch<T extends object>(
  form: FormInstance<T>,
  paths: Array<Path<T> | string> | Path<T> | string
): Signal<Record<string, unknown>> {
  const destroyRef = inject(DestroyRef);
  const zone = inject(NgZone, { optional: true });
  const pathArray = (Array.isArray(paths) ? paths : [paths]) as string[];

  const initial: Record<string, unknown> = {};
  pathArray.forEach((p) => {
    initial[p] = form.get(p as any);
  });

  const watched = signal<Record<string, unknown>>(initial);
  const stop = form.watch(pathArray as any, (vals) => {
    zone ? zone.run(() => watched.set({ ...vals })) : watched.set({ ...vals });
  });
  destroyRef.onDestroy(stop);

  return watched.asReadonly();
}
