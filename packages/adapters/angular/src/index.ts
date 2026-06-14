import { type Signal, signal, DestroyRef, NgZone, inject } from '@angular/core';
import type { FormInstance, FormState } from '@neutro/form-core';

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
}

// Must be called inside an injection context (component constructor or inject() call site).
export function useAngularForm<T extends object>(form: FormInstance<T>): AngularFormReturn<T> {
  const formSignal = signal(form.getState());
  // NgZone.run() ensures signal updates trigger change detection in zone.js apps.
  // In zoneless apps the optional inject returns null and we call set() directly.
  const zone = inject(NgZone, { optional: true });
  const unsubscribe = form.subscribe((s) =>
    zone ? zone.run(() => formSignal.set(s)) : formSignal.set(s)
  );
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
  };
}

// Returns two readonly Signals for direct template binding.
// Must be called inside an injection context.
export function useAngularFormPath<T extends object>(form: FormInstance<T>, path: string) {
  const value = signal<unknown>(form.get(path));
  const fieldState = signal<{ error?: string; touched?: boolean; dirty?: boolean } | null>(null);
  const zone = inject(NgZone, { optional: true });
  const unsubscribe = form.subscribeToPath(path, (v, fs) => {
    if (zone) {
      zone.run(() => { value.set(v); fieldState.set(fs); });
    } else {
      value.set(v);
      fieldState.set(fs);
    }
  });
  inject(DestroyRef).onDestroy(unsubscribe);
  return { value: value.asReadonly(), fieldState: fieldState.asReadonly() };
}
