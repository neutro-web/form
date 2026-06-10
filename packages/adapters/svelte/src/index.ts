// Svelte adapter — uses svelte/store primitives (readable) so this file
// compiles with plain tsup without needing the Svelte preprocessor.
// Consumers use the $ prefix in .svelte templates: $field.value, $field.fieldState
import { readable } from 'svelte/store';

export function useSvelteForm(form: any) {
  const state = readable(form.getState(), (set) =>
    form.subscribe((s: any) => set(s))
  );
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

export function useSvelteFormPath(form: any, path: string) {
  const field = readable<{ value: unknown; fieldState: { error?: string; touched?: boolean; dirty?: boolean } | null }>(
    { value: form.get(path), fieldState: null },
    (set) =>
      form.subscribeToPath(path, (v: unknown, fs: any) => set({ value: v, fieldState: fs }))
  );
  return field;
}
