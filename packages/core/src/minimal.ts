/**
 * @neutro/form-core minimal entry point.
 *
 * Exposes only the engine core (`createCoreForm`): set/get/validate/
 * subscribe/reset/submit/batch and friends. No computed fields, array-ops,
 * DOM bridge (`connect`/`focus`/`getAriaProps`), or persistence (`hydrate`) —
 * those are full-tier-only, attached by `./index.ts`'s `createForm`. A
 * `computed` config option passed here is accepted but silently not honored,
 * matching the no-op defaults `createCoreForm` leaves in place.
 */
import { createCoreForm } from './engine.js';
import type { FormConfig, MinimalFormInstance } from './index.js';

export function createForm<T extends object>(config: FormConfig<T>): MinimalFormInstance<T> {
  const { instance } = createCoreForm(config);
  return instance;
}

export type {
  FormAction,
  FormConfig,
  FormState,
  FormSubscriber,
  GetPathValue,
  MinimalFormInstance,
  Path,
  PathSubscriber,
  ResetFieldOptions,
  SetOptions,
} from './index.js';
