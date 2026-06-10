import { signal, DestroyRef, inject } from '@angular/core';

// Must be called inside an injection context (component constructor or inject() call site).
export function useAngularForm<T extends object>(form: any) {
  const formSignal = signal(form.getState());
  const unsubscribe = form.subscribe((s: any) => { formSignal.set(s); });
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
    arrayAppend: form.arrayAppend,
    arrayInsert: form.arrayInsert,
    arrayRemove: form.arrayRemove,
    arrayMove: form.arrayMove,
    arraySwap: form.arraySwap,
  };
}

// Returns two readonly Signals for direct template binding.
// Must be called inside an injection context.
export function useAngularFormPath(form: any, path: string) {
  const value = signal<unknown>(form.get(path));
  const fieldState = signal<{ error?: string; touched?: boolean; dirty?: boolean } | null>(null);
  const unsubscribe = form.subscribeToPath(path, (v: unknown, fs: any) => {
    value.set(v);
    fieldState.set(fs);
  });
  inject(DestroyRef).onDestroy(unsubscribe);
  return { value: value.asReadonly(), fieldState: fieldState.asReadonly() };
}
