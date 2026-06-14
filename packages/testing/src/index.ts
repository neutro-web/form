import { createForm, type FormConfig, type FormInstance } from '@neutro/form-core';

export function fillForm<T extends object>(
  form: FormInstance<T>,
  values: Partial<Record<string, unknown>>
): void {
  form.batch(() => {
    for (const [path, value] of Object.entries(values)) {
      form.set(path as any, value);
    }
  });
}

export function blurField<T extends object>(form: FormInstance<T>, path: string): void {
  const current = form.get(path as any);
  // form.set is a no-op when the value is unchanged, so we use a unique sentinel
  // object to force the internal touched flag to be set, then restore the value.
  // Wrapping in batch ensures subscribers see only the final state.
  const sentinel = Object.create(null);
  form.batch(() => {
    form.set(path as any, sentinel, { touch: true });
    form.set(path as any, current);
  });
}

export function triggerValidation<T extends object>(
  form: FormInstance<T>,
  paths?: string[]
): Promise<boolean> {
  return form.validate(paths);
}

export interface FormFixture<T extends object> {
  form: FormInstance<T>;
  fill(values: Partial<Record<string, unknown>>): void;
  blur(path: string): void;
  validate(paths?: string[]): Promise<boolean>;
  cleanup(): void;
}

export function createFormFixture<T extends object>(config: FormConfig<T>): FormFixture<T> {
  const form = createForm<T>({ ...config, asyncDebounceMs: config.asyncDebounceMs ?? 0 });
  return {
    form,
    fill: (values) => fillForm(form, values),
    blur: (path) => blurField(form, path),
    validate: (paths) => triggerValidation(form, paths),
    cleanup: () => form.destroy(),
  };
}
