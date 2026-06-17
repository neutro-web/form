import {
  createForm,
  type FormConfig,
  type FormInstance,
  type ResetFieldOptions,
} from '@neutro/form-core';

/** Batch-sets multiple field values in one notification flush. */
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

/**
 * Marks a field as touched without changing its value.
 *
 * This simulates a user visiting and leaving a field. It does NOT trigger
 * validation automatically — call triggerValidation() (or fixture.validate())
 * afterwards to assert the resulting errors.
 *
 * Implementation note: form.set() is a no-op when the value is unchanged, so a
 * unique sentinel object is used to force the touched flag, then the original
 * value is restored. Both calls are wrapped in batch() so subscribers see only
 * the final state.
 */
export function blurField<T extends object>(form: FormInstance<T>, path: string): void {
  const current = form.get(path as any);
  const sentinel = Object.create(null);
  form.batch(() => {
    form.set(path as any, sentinel, { touch: true });
    form.set(path as any, current);
  });
}

/**
 * Runs form validation and returns whether the form is valid.
 *
 * Thin wrapper around form.validate() for discoverability. When using the
 * standalone function (not createFormFixture), set asyncDebounceMs: 0 on the
 * form to prevent tests from timing out on async validators.
 */
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
  resetField(path: string, options?: ResetFieldOptions): void;
  cleanup(): void;
}

/**
 * Creates a test fixture wrapping a form instance.
 *
 * Defaults asyncDebounceMs to 0 so async validators resolve in tests without
 * fake timers. Pass asyncDebounceMs explicitly to override.
 *
 * @example
 * const fixture = createFormFixture({ initialValues: { email: '' }, rules: { email: ['required'] } });
 * afterEach(() => fixture.cleanup());
 */
export function createFormFixture<T extends object>(config: FormConfig<T>): FormFixture<T> {
  const form = createForm<T>({ ...config, asyncDebounceMs: config.asyncDebounceMs ?? 0 });
  return {
    form,
    fill: (values) => fillForm(form, values),
    blur: (path) => blurField(form, path),
    validate: (paths) => triggerValidation(form, paths),
    resetField: (path, options) => form.resetField(path, options),
    cleanup: () => form.destroy(),
  };
}
