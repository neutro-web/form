// Svelte adapter — uses svelte/store primitives (readable) so this file
// compiles with plain tsup without needing the Svelte preprocessor.
// Consumers use the $ prefix in .svelte templates: $field.value, $field.fieldState
import { type Readable, readable } from 'svelte/store';
import type { FormInstance, FormState } from '@neutro/form-core';

export interface SvelteFormReturn<T extends object> {
  state: Readable<FormState<T>>;
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

export function useSvelteForm<T extends object>(form: FormInstance<T>): SvelteFormReturn<T> {
  const state = readable<FormState<T>>(form.getState(), (set) => {
    // Re-seed with current state on each re-subscription so re-mounted
    // components don't show stale state from before the zero-subscriber window.
    set(form.getState());
    return form.subscribe((s) => set(s));
  });
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

export function useSvelteFormPath<T extends object>(form: FormInstance<T>, path: string) {
  const field = readable<{ value: unknown; fieldState: { error?: string; touched?: boolean; dirty?: boolean } | null }>(
    { value: form.get(path), fieldState: null },
    (set) => {
      set({ value: form.get(path), fieldState: null });
      return form.subscribeToPath(path, (v, fs) => set({ value: v, fieldState: fs }));
    }
  );
  return field;
}
