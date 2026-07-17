/**
 * @neutro/form-core
 * High-Performance, Zero-Dependency, Framework-Agnostic Reactive Form Engine.
 */

import { createCoreForm } from './engine.js';
import { attachArrayOps } from './features/array-ops.js';
import { attachComputedFields } from './features/computed-fields.js';
import { attachDomBridge } from './features/dom-bridge.js';
import { attachPersistence } from './features/persistence.js';

export type { FormEngineContext } from './engine.js';

export type Primitive = string | number | boolean | null | undefined | Date | File;

export type DeepPartial<T> = T extends Primitive
  ? T
  : T extends Array<infer U>
    ? _DeepPartialArray<U>
    : T extends object
      ? _DeepPartialObject<T>
      : T | undefined;

interface _DeepPartialArray<T> extends Array<DeepPartial<T>> {}
type _DeepPartialObject<T> = { [P in keyof T]?: DeepPartial<T[P]> };

type Prev = [never, 0, 1, 2, 3, 4, 5, ...any[]];

export type PathImpl<T, K extends keyof T, Depth extends number = 5> = [Depth] extends [never]
  ? never
  : K extends string
    ? T[K] extends Primitive
      ? K
      : T[K] extends Array<infer U>
        ?
            | K
            | `${K}.${number}`
            | (U extends object ? `${K}.${number}.${PathImpl<U, keyof U, Prev[Depth]>}` : never)
        : NonNullable<T[K]> extends object
          ? K | `${K}.${PathImpl<NonNullable<T[K]>, keyof NonNullable<T[K]>, Prev[Depth]>}`
          : K
    : never;

export type Path<T> = PathImpl<T, keyof T> & string;

type _GetPathValue<T, P extends string> = P extends `${infer K}.${infer Rest}`
  ? K extends keyof T
    ? _GetPathValue<NonNullable<T[K]>, Rest>
    : T extends readonly any[]
      ? _GetPathValue<NonNullable<T[number]>, Rest>
      : unknown
  : P extends keyof T
    ? T[P]
    : T extends readonly any[]
      ? T[number]
      : unknown;

export type GetPathValue<T, P extends string> = _GetPathValue<T, P>;

export type ComputedLeaf<TRoot, V> = {
  fn: (values: TRoot) => V;
  transient?: boolean;
};

export type ComputedConfig<T, TRoot = T> = {
  [K in keyof T]?: NonNullable<T[K]> extends Array<any>
    ? ComputedLeaf<TRoot, T[K]>
    : NonNullable<T[K]> extends object
      ? ComputedLeaf<TRoot, T[K]> | ComputedConfig<NonNullable<T[K]>, TRoot>
      : ComputedLeaf<TRoot, T[K]>;
};

export interface FormState<T> {
  values: T;
  errors: Record<string, string>;
  touched: Record<string, boolean>;
  dirty: Record<string, boolean>;
  isSubmitting: boolean;
  isValidating: boolean;
  /** null = not yet validated; true = last full validation passed; false = errors exist */
  isValid: boolean | null;
  /** Number of times submit() has been called, including failed validation attempts */
  submissionAttempts: number;
  /** Deep snapshot of all form values at last successful submission; null before first success */
  lastSubmittedValues: Partial<T> | null;
}

export type FormSubscriber<T> = (state: FormState<T>) => void;
export type PathSubscriber<V = any> = (
  value: V,
  fieldState: { error?: string; touched?: boolean; dirty?: boolean }
) => void;

export type BuiltInRule =
  // Presence
  | 'required' // non-empty value
  | 'accepted' // must be true (checkboxes, terms)
  // Format
  | 'email' // valid email
  | 'url' // valid URL
  | 'numeric' // is a number
  | 'integer' // whole number only
  | 'positive' // number > 0
  | 'nonNegative' // number >= 0
  | 'alpha' // letters only
  | 'alphanumeric' // letters and numbers
  | 'date' // parseable date string
  // Length / size
  | { minLength: number; message?: string } // string length >= n
  | { maxLength: number; message?: string } // string length <= n
  | { min: number; message?: string } // number >= n
  | { max: number; message?: string } // number <= n
  // String content
  | { startsWith: string; message?: string }
  | { endsWith: string; message?: string }
  | { includes: string; message?: string } // string contains substring
  | { pattern: string | RegExp; message?: string } // matches regex
  // Array
  | { minItems: number; message?: string } // array.length >= n
  | { maxItems: number; message?: string } // array.length <= n
  | 'unique' // all array items distinct
  | { contains: unknown; message?: string } // array includes value (deep equal)
  // Enum
  | { oneOf: unknown[]; message?: string } // value is in the list
  | { notOneOf: unknown[]; message?: string } // value is not in the list
  // Cross-field comparisons (all accept a dot-path string)
  | { matches: string; message?: string } // deep-equals value at path
  | { doesNotMatch: string; message?: string } // does NOT deep-equal value at path
  | { greaterThan: string; message?: string } // numeric > value at path
  | { lessThan: string; message?: string } // numeric < value at path
  | { after: string; message?: string } // date/time after value at path
  | { before: string; message?: string } // date/time before value at path
  // Conditional presence
  | { requiredIf: string; message?: string } // required when field at path is truthy
  | { requiredUnless: string; message?: string } // required unless field at path is truthy
  // File validation
  | { maxFileSize: number; message?: string } // every file must be <= n bytes
  | { minFileSize: number; message?: string } // every file must be >= n bytes
  | { fileTypes: string[]; message?: string } // every file MIME type must be in list
  | { maxFiles: number; message?: string } // FileList length <= n
  | { minFiles: number; message?: string }; // FileList length >= n

export type ValidationMode = 'onChange' | 'onBlur' | 'onTouched' | 'onSubmitOnly';

export interface ValidationModeConfig<T extends object> {
  default?: ValidationMode;
  fields?: Partial<Record<Path<T> | (string & {}), ValidationMode>>;
}

export type FormAction =
  | { type: 'SET'; path: string; value: unknown; options?: SetOptions }
  | { type: 'VALIDATE'; paths?: string[] }
  | { type: 'SUBMIT' }
  | { type: 'RESET'; newValues?: unknown }
  | { type: 'SET_ERRORS'; errors: Record<string, string> }
  | { type: 'CONNECT'; path: string }
  | { type: 'DISCONNECT'; path: string }
  | { type: 'BLUR'; path: string }
  | { type: 'BATCH_START' }
  | { type: 'BATCH_END' }
  | { type: 'ARRAY_APPEND'; path: string; item: unknown }
  | { type: 'ARRAY_INSERT'; path: string; index: number; item: unknown }
  | { type: 'ARRAY_REMOVE'; path: string; index: number }
  | { type: 'ARRAY_MOVE'; path: string; from: number; to: number }
  | { type: 'ARRAY_SWAP'; path: string; i: number; j: number }
  | { type: 'CLEAR_ERRORS' }
  | { type: 'RESET_FIELD'; path: string };

export interface AriaPropsOptions {
  required?: boolean;
  errorId?: string;
}

export interface AriaProps {
  'aria-invalid': 'true' | 'false';
  'aria-describedby': string | undefined;
  'aria-required': true | undefined;
}

export interface FormConfig<T extends object> {
  initialValues: T;
  rules?: Partial<Record<Path<T> | (string & {}), BuiltInRule | BuiltInRule[]>>;
  validator?: (
    values: T,
    scopePaths?: string[],
    signal?: AbortSignal
  ) => Record<string, string> | Promise<Record<string, string>>;
  dependencies?: Partial<Record<Path<T> | (string & {}), Array<Path<T> | (string & {})>>>;
  asyncDebounceMs?: number;
  /** Per-field validation trigger mode. Defaults to 'onTouched'. */
  validationMode?: ValidationMode | ValidationModeConfig<T>;
  persistence?: PersistenceConfig<T>;
  onSubmitSuccess?: (payload: Partial<T>) => void | Promise<void>;
  onSubmitError?: (error: unknown, payload: Partial<T>) => void | Promise<void>;
  /** Derived fields evaluated after every mutation. See ComputedConfig<T>. */
  computed?: ComputedConfig<T>;
  /** Max evaluation passes per mutation before the circular-dependency warning fires. Default: 5. */
  computedPassLimit?: number;
  /** Controls runtime path validation. Default: 'dev' (warn in development only). */
  pathValidation?: 'dev' | 'always' | 'off';
}

export interface ConnectOptions {
  persist?: boolean;
  format?: (val: string) => string;
  validateOn?: ValidationMode;
}

export interface SetOptions {
  touch?: boolean;
  validate?: boolean;
}

export interface ResetFieldOptions {
  keepError?: boolean; // retain errors[path] — default false
  keepTouched?: boolean; // retain touched[path] — default false
  keepDirty?: boolean; // retain dirty[path] — default false
}

export interface PersistenceAdapter<T> {
  read(): T | null | undefined | Promise<T | null | undefined>;
  write(values: T): void | Promise<void>;
  clear(): void | Promise<void>;
}

export interface PersistenceConfig<T extends object> {
  adapter: PersistenceAdapter<T>;
  /** Milliseconds to debounce writes. Default: 300. Set to 0 to write on every change. */
  debounceMs?: number;
  /** Paths to exclude from read and write (e.g. passwords, file inputs). */
  exclude?: Array<Path<T> | (string & {})>;
}

export type ArrayItem<V> = V extends Array<infer U> ? U : never;

/**
 * The minimal-tier surface: everything `createCoreForm` (packages/core/src/engine.ts)
 * provides on its own, with no computed fields, array-ops, DOM bridge, or
 * persistence attached. `minimal.ts`'s `createForm` returns exactly this shape.
 * `FormInstance<T>` (below) extends this with the full-tier-only members.
 */
export interface MinimalFormInstance<T extends object> {
  subscribe: (fn: FormSubscriber<T>) => () => void;
  subscribeToPath<P extends Path<T>>(path: P, fn: PathSubscriber<GetPathValue<T, P>>): () => void;
  subscribeToPathDynamic(path: string, fn: (value: unknown) => void): () => void;
  get<P extends Path<T>>(path: P): GetPathValue<T, P>;
  set<P extends Path<T>>(path: P, val: GetPathValue<T, P>, options?: SetOptions): void;
  validate(scopePaths?: Array<Path<T> | string[]>): Promise<boolean>;
  submit: (onValid: (payload: Partial<T>) => void | Promise<void>) => Promise<boolean>;
  handleSubmit: (
    onValid: (payload: Partial<T>) => void | Promise<void>,
    onInvalid?: (errors: Record<string, string>) => void
  ) => (e?: Event) => void;
  getState: () => FormState<T>;
  getPayload: () => Partial<T>;
  setDynamic(path: string, value: unknown, options?: SetOptions): void;
  getDynamic<V = unknown>(path: string): V;
  batch: (fn: () => void) => void;
  reset: (newValues?: T) => void;
  resetField(path: Path<T>, options?: ResetFieldOptions): void;
  destroy: () => void;
  setErrors: (errors: Partial<Record<Path<T>, string>>) => void;
  clearErrors: () => void;
  /**
   * Returns the effective ValidationMode for a field. Useful for debugging
   * validation timing; framework adapters should rely on this only in custom
   * event handlers, not in render logic.
   */
  getFieldMode: (path: string) => ValidationMode;
  isDirty(): boolean;
  isFieldDirty(path: Path<T>): boolean;
  isFieldValid(path: Path<T>): boolean | null;
  watch(
    paths: Path<T> | Array<Path<T>>,
    callback: (values: Record<string, unknown>) => void
  ): () => void;
  _subscribeToActions: (fn: (action: FormAction, state: FormState<T>) => void) => () => void;
  /** @internal test-only accessor for pathIndex membership. Not part of the stable public API. */
  _debugPathIndex: () => Map<string, Set<string>>;
  /** @internal test-only direct access to indexKey. Not part of the stable public API. */
  _debugIndexKey: (key: string) => void;
  /** @internal test-only direct access to unindexKey. Not part of the stable public API. */
  _debugUnindexKey: (key: string) => void;
  /**
   * @internal test-only snapshot of the SIX TRACKED STRUCTURES THEMSELVES
   * (not pathIndex) — used as an independent ground truth in tests, since
   * asserting against _debugPathIndex alone only proves the index is
   * internally consistent with itself, not that it matches the real
   * errors/touched/dirty/wasSet/validatedPaths/pathSubscribers state.
   * Not part of the stable public API.
   */
  _debugRawState: () => {
    errors: Record<string, string>;
    touched: Record<string, boolean>;
    dirty: Record<string, boolean>;
    wasSet: Record<string, boolean>;
    validatedPaths: string[];
    pathSubscriberKeys: string[];
  };
}

/**
 * The full-tier surface, extending `MinimalFormInstance` with array-ops,
 * DOM bridge, and persistence — attached by `index.ts`'s `createForm`, on
 * top of `computed` config support (which is honored silently, not exposed
 * as an extra method).
 */
export interface FormInstance<T extends object> extends MinimalFormInstance<T> {
  connect: (path: Path<T>, el: HTMLElement, options?: ConnectOptions) => () => void;
  getAriaProps: (path: Path<T>, options?: AriaPropsOptions) => AriaProps;
  arrayAppend<P extends Path<T>>(path: P, item: ArrayItem<GetPathValue<T, P>>): void;

  arrayInsert<P extends Path<T>>(path: P, index: number, item: ArrayItem<GetPathValue<T, P>>): void;

  arrayRemove<P extends Path<T>>(path: P, index: number): void;

  arrayMove<P extends Path<T>>(path: P, fromIndex: number, toIndex: number): void;

  arraySwap<P extends Path<T>>(path: P, indexA: number, indexB: number): void;
  /**
   * Reads stored values from the persistence adapter and merges them into the
   * form as the new initial values. No-op if no adapter is configured.
   * Must be called after mount. Returns a Promise that resolves when done.
   */
  hydrate(): Promise<void>;
  getConnectedCount: () => number;
  focus(path: Path<T>): boolean;
  focusFirstError(): boolean;
}

// ---------------------------------------------------------------------------
// Validator adapters
// ---------------------------------------------------------------------------

export function zodAdapter<T>(schema: { safeParse: (values: T) => any }) {
  return (values: T): Record<string, string> => {
    const result = schema.safeParse(values);
    if (result.success) return {};
    const errors: Record<string, string> = {};
    result.error.issues.forEach((issue: any) => {
      errors[issue.path.join('.')] = issue.message;
    });
    return errors;
  };
}

export function valibotAdapter<T>(schema: {
  safeParse: (values: T) => {
    success: boolean;
    issues?: Array<{ path: Array<{ key: string | number }>; message: string }>;
  };
}) {
  return (values: T): Record<string, string> => {
    const result = schema.safeParse(values);
    if (result.success) return {};
    const errors: Record<string, string> = {};
    (result.issues ?? []).forEach((issue) => {
      const path = issue.path.map((p) => String(p.key)).join('.');
      if (path) errors[path] = issue.message;
    });
    return errors;
  };
}

export function yupAdapter<T>(schema: {
  validate: (values: T, options: { abortEarly: boolean }) => Promise<any>;
}) {
  return async (values: T): Promise<Record<string, string>> => {
    try {
      await schema.validate(values, { abortEarly: false });
      return {};
    } catch (err: any) {
      const errors: Record<string, string> = {};
      if (err.inner && Array.isArray(err.inner) && err.inner.length > 0) {
        err.inner.forEach((e: any) => {
          if (e.path && !errors[e.path]) errors[e.path] = e.message;
        });
      } else if (err.path) {
        errors[err.path] = err.message;
      }
      return errors;
    }
  };
}

export interface ValidationErrorLike {
  property: string;
  constraints?: Record<string, string>;
  children?: ValidationErrorLike[];
}

function flattenClassValidationErrors(
  errors: ValidationErrorLike[],
  prefix = ''
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const error of errors) {
    const path = prefix ? `${prefix}.${error.property}` : error.property;
    if (error.constraints && Object.keys(error.constraints).length > 0) {
      result[path] = Object.values(error.constraints)[0];
    }
    if (error.children && error.children.length > 0) {
      Object.assign(result, flattenClassValidationErrors(error.children, path));
    }
  }
  return result;
}

export function classValidatorAdapter<T extends object>(
  cls: new () => T,
  validate: (obj: T) => Promise<ValidationErrorLike[]>
) {
  return async (values: T): Promise<Record<string, string>> => {
    const instance = Object.assign(new cls(), values);
    const validationErrors = await validate(instance);
    return flattenClassValidationErrors(validationErrors);
  };
}

export function localStorageAdapter<T>(key: string): PersistenceAdapter<T> {
  return {
    read(): T | null {
      if (typeof localStorage === 'undefined') return null;
      try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : null;
      } catch {
        return null;
      }
    },
    write(values: T): void {
      if (typeof localStorage === 'undefined') return;
      try {
        localStorage.setItem(key, JSON.stringify(values));
      } catch (err) {
        console.error('[NeutroForm] localStorageAdapter write failed:', err);
      }
    },
    clear(): void {
      if (typeof localStorage === 'undefined') return;
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore
      }
    },
  };
}

export function sessionStorageAdapter<T>(key: string): PersistenceAdapter<T> {
  return {
    read(): T | null {
      if (typeof sessionStorage === 'undefined') return null;
      try {
        const raw = sessionStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : null;
      } catch {
        return null;
      }
    },
    write(values: T): void {
      if (typeof sessionStorage === 'undefined') return;
      try {
        sessionStorage.setItem(key, JSON.stringify(values));
      } catch (err) {
        console.error('[NeutroForm] sessionStorageAdapter write failed:', err);
      }
    },
    clear(): void {
      if (typeof sessionStorage === 'undefined') return;
      try {
        sessionStorage.removeItem(key);
      } catch {
        // ignore
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

export function deepClone<T>(val: T, hash = new WeakMap()): T {
  if (val === null || val === undefined || typeof val !== 'object') return val;
  if (val instanceof Date) return new Date(val.getTime()) as any;
  if (val instanceof RegExp) return new RegExp(val.source, val.flags) as any;
  if (typeof File !== 'undefined' && val instanceof File) return val;
  if (hash.has(val)) return hash.get(val);
  if (val instanceof Set) {
    const cloneSet = new Set();
    hash.set(val, cloneSet);
    for (const item of val) cloneSet.add(deepClone(item, hash));
    return cloneSet as any;
  }
  if (val instanceof Map) {
    const cloneMap = new Map();
    hash.set(val, cloneMap);
    for (const [key, value] of val) cloneMap.set(key, deepClone(value, hash));
    return cloneMap as any;
  }
  if (Array.isArray(val)) {
    const cloneArr = new Array(val.length);
    hash.set(val, cloneArr);
    for (let i = 0; i < val.length; i++) cloneArr[i] = deepClone(val[i], hash);
    return cloneArr as any;
  }
  const cloneObj = Object.create(Object.getPrototypeOf(val));
  hash.set(val, cloneObj);
  for (const key of Reflect.ownKeys(val)) {
    const desc = Object.getOwnPropertyDescriptor(val, key);
    if (desc)
      Object.defineProperty(cloneObj, key, { ...desc, value: deepClone((val as any)[key], hash) });
  }
  return cloneObj;
}

export const DANGEROUS_PATH_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function getNestedValue(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (DANGEROUS_PATH_KEYS.has(part)) return undefined;
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

export function setNestedValue(obj: any, path: string, value: any): void {
  const parts = path.split('.');
  if (parts.some((p) => DANGEROUS_PATH_KEYS.has(p))) {
    console.error('[NeutroForm] Blocked dangerous path segment:', path);
    return;
  }
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const nextPart = parts[i + 1];
    if (!(part in current) || current[part] === null || typeof current[part] !== 'object') {
      current[part] = !Number.isNaN(Number(nextPart)) ? [] : {};
    }
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}

// Bug #10: O(N²) → O(N) via Set. Bug #11: Map → WeakMap for circular-ref tracking.
export function isDeepEqual(a: any, b: any, hash = new WeakMap()): boolean {
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof RegExp && b instanceof RegExp) return a.toString() === b.toString();
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (hash.has(a) && hash.get(a) === b) return true;
  hash.set(a, b);
  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false;
    for (const item of a) if (!b.has(item)) return false;
    return true;
  }
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [key, val] of a) {
      if (!b.has(key) || !isDeepEqual(val, b.get(key), hash)) return false;
    }
    return true;
  }
  const keysA = Reflect.ownKeys(a);
  const keysB = new Set(Reflect.ownKeys(b)); // O(1) lookup — fixes O(N²) bug
  if (keysA.length !== keysB.size) return false;
  for (const key of keysA) {
    if (!keysB.has(key) || !isDeepEqual(a[key], b[key], hash)) return false;
  }
  return true;
}

export function extractAllPaths(obj: any, prefix = '', _depth = 0): string[] {
  if (_depth > 50) return prefix ? [prefix] : [];
  if (
    obj === null ||
    typeof obj !== 'object' ||
    obj instanceof Date ||
    (typeof File !== 'undefined' && obj instanceof File)
  ) {
    return prefix ? [prefix] : [];
  }
  const paths: string[] = [];
  if (prefix) paths.push(prefix);
  for (const key in obj) {
    if (Object.hasOwn(obj, key)) {
      const currentPath = prefix ? `${prefix}.${key}` : key;
      if (Array.isArray(obj[key])) {
        paths.push(currentPath);
        obj[key].forEach((item: any, index: number) => {
          paths.push(...extractAllPaths(item, `${currentPath}.${index}`, _depth + 1));
        });
      } else {
        paths.push(...extractAllPaths(obj[key], currentPath, _depth + 1));
      }
    }
  }
  return paths;
}

export interface WildcardDependency {
  pattern: string;
  dependents: string[];
}

// matchesWildcardPattern/resolveWildcardDependents moved to engine.ts — they are
// only used by runValidation, which now lives there. WildcardDependency and
// compileDependencyScopes stay here since compileDependencyScopes is exported
// public API (see packages/core/test/form.test.ts).

// Bug #12: register wildcard dependency keys directly so empty-array deps are pre-compiled.
export function compileDependencyScopes(
  dependencies: Record<string, string[] | undefined>,
  initialValues: any
): { preComputedScopes: Record<string, string[]>; wildcardDependencies: WildcardDependency[] } {
  const preComputedScopes: Record<string, string[]> = {};
  const wildcardDependencies: WildcardDependency[] = [];
  const allFieldPaths = extractAllPaths(initialValues);

  const isWildcardEntry = (key: string) => key.includes('*');

  const staticDependencies: Record<string, string[] | undefined> = {};
  Object.entries(dependencies).forEach(([key, val]) => {
    if (isWildcardEntry(key)) {
      wildcardDependencies.push({ pattern: key, dependents: val ?? [] });
    } else {
      staticDependencies[key] = val;
    }
  });

  const resolveTransitiveClosure = (currentPath: string, visited: Set<string>) => {
    if (visited.has(currentPath)) return;
    visited.add(currentPath);
    const directDependents = staticDependencies[currentPath];
    if (directDependents) {
      for (const dep of directDependents) resolveTransitiveClosure(dep, visited);
    }
  };

  allFieldPaths.forEach((path) => {
    const visited = new Set<string>();
    resolveTransitiveClosure(path, visited);
    preComputedScopes[path] = Array.from(visited);
  });

  // Register static dependency keys not present in initialValues (e.g. on empty arrays)
  Object.keys(staticDependencies).forEach((path) => {
    if (!preComputedScopes[path]) {
      const visited = new Set<string>();
      resolveTransitiveClosure(path, visited);
      preComputedScopes[path] = Array.from(visited);
    }
  });

  return { preComputedScopes, wildcardDependencies };
}

// ---------------------------------------------------------------------------
// Built-in rule runner
// ---------------------------------------------------------------------------

function matchesMimeType(ruleType: string, fileType: string): boolean {
  const normalRule = ruleType.toLowerCase();
  const normalFile = fileType.toLowerCase();
  if (normalRule.endsWith('/*')) {
    // slice(0,-1) retains the slash, preventing 'imageX/...' false-positives; length check rejects bare 'image/'
    const prefix = normalRule.slice(0, -1);
    return normalFile.startsWith(prefix) && normalFile.length > prefix.length;
  }
  return normalRule === normalFile;
}

function isFileLike(
  v: unknown
): v is { name: string; size: number; type: string; lastModified: number } {
  if (v === null || typeof v !== 'object') return false;
  if (typeof File !== 'undefined' && v instanceof File) return true;
  // Duck-type for environments where File is unavailable (Node/test)
  const o = v as any;
  return (
    typeof o.name === 'string' &&
    typeof o.size === 'number' &&
    typeof o.type === 'string' &&
    typeof o.lastModified === 'number'
  );
}

function isFileListLike(v: unknown): v is { length: number; item: (i: number) => File | null } {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  if (typeof FileList !== 'undefined' && v instanceof FileList) return true;
  // Duck-type for environments where FileList is unavailable (Node/test)
  // Must not match a single file-like object that also has .length/.item (unlikely but safe)
  return (
    typeof (v as any).length === 'number' && typeof (v as any).item === 'function' && !isFileLike(v)
  );
}

function isEmpty(v: unknown): boolean {
  return (
    v === undefined ||
    v === null ||
    v === '' ||
    (typeof v === 'string' && !v.trim()) ||
    (Array.isArray(v) && v.length === 0) ||
    (isFileListLike(v) && v.length === 0)
  );
}

function toDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

export function applyBuiltInRules<T>(
  values: T,
  rules: Record<string, BuiltInRule | BuiltInRule[]>,
  scopePaths?: string[]
): Record<string, string> {
  const errors: Record<string, string> = {};
  const paths = scopePaths ?? Object.keys(rules);

  for (const path of paths) {
    const ruleSet = rules[path];
    if (!ruleSet) continue;
    const ruleArr = Array.isArray(ruleSet) ? ruleSet : [ruleSet];
    const value = getNestedValue(values, path);
    const str = typeof value === 'string' ? value : String(value ?? '');
    const arr = Array.isArray(value) ? value : null;
    const present = !isEmpty(value);

    for (const rule of ruleArr) {
      let error: string | null = null;

      // ── Presence ──────────────────────────────────────────────────────────
      if (rule === 'required') {
        if (!present) error = 'Required';
      } else if (rule === 'accepted') {
        if (value !== true && value !== 1 && value !== 'yes' && value !== 'true') {
          error = 'This field must be accepted';
        }

        // ── Format ────────────────────────────────────────────────────────────
      } else if (rule === 'email') {
        if (present && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) {
          error = 'Must be a valid email address';
        }
      } else if (rule === 'url') {
        if (present) {
          try {
            const u = new URL(str);
            const segs = u.hostname.split('.');
            const validHost =
              u.hostname === 'localhost' || (segs.length >= 2 && segs.every((s) => s.length > 0));
            if (!['http:', 'https:'].includes(u.protocol) || !validHost) {
              error = 'Must be a valid URL';
            }
          } catch {
            error = 'Must be a valid URL';
          }
        }
      } else if (rule === 'numeric') {
        if (present && Number.isNaN(Number(value))) error = 'Must be a number';
      } else if (rule === 'integer') {
        if (present && !Number.isInteger(Number(value))) error = 'Must be a whole number';
      } else if (rule === 'positive') {
        if (present && Number(value) <= 0) error = 'Must be greater than zero';
      } else if (rule === 'nonNegative') {
        if (present && Number(value) < 0) error = 'Must be zero or greater';
      } else if (rule === 'alpha') {
        if (present && !/^[a-zA-Z]+$/.test(str)) error = 'Must contain letters only';
      } else if (rule === 'alphanumeric') {
        if (present && !/^[a-zA-Z0-9]+$/.test(str)) error = 'Must contain letters and numbers only';
      } else if (rule === 'date') {
        if (present && toDate(value) === null) error = 'Must be a valid date';

        // ── Unique (array) ────────────────────────────────────────────────────
      } else if (rule === 'unique') {
        if (arr) {
          const seen = new Set(arr.map((item) => JSON.stringify(item)));
          if (seen.size !== arr.length) error = 'All items must be unique';
        }
      } else if (typeof rule === 'object') {
        // ── Length / size ────────────────────────────────────────────────────
        if ('minLength' in rule) {
          if (present && str.length < rule.minLength)
            error =
              rule.message ??
              `Must be at least ${rule.minLength} character${rule.minLength === 1 ? '' : 's'}`;
        } else if ('maxLength' in rule) {
          if (present && str.length > rule.maxLength)
            error =
              rule.message ??
              `Must be at most ${rule.maxLength} character${rule.maxLength === 1 ? '' : 's'}`;
        } else if ('min' in rule) {
          if (present && Number(value) < (rule as { min: number; message?: string }).min)
            error = rule.message ?? `Must be at least ${(rule as { min: number }).min}`;
        } else if ('max' in rule) {
          if (present && Number(value) > (rule as { max: number; message?: string }).max)
            error = rule.message ?? `Must be at most ${(rule as { max: number }).max}`;

          // ── String content ────────────────────────────────────────────────
        } else if ('startsWith' in rule) {
          if (present && !str.startsWith((rule as { startsWith: string }).startsWith))
            error =
              rule.message ?? `Must start with "${(rule as { startsWith: string }).startsWith}"`;
        } else if ('endsWith' in rule) {
          if (present && !str.endsWith((rule as { endsWith: string }).endsWith))
            error = rule.message ?? `Must end with "${(rule as { endsWith: string }).endsWith}"`;
        } else if ('includes' in rule) {
          if (present && !str.includes((rule as { includes: string }).includes))
            error = rule.message ?? `Must contain "${(rule as { includes: string }).includes}"`;
        } else if ('pattern' in rule) {
          const re =
            typeof rule.pattern === 'string' ? new RegExp(rule.pattern) : (rule.pattern as RegExp);
          if (present && !re.test(str)) error = rule.message ?? 'Invalid format';

          // ── Array ─────────────────────────────────────────────────────────
        } else if ('minItems' in rule) {
          const len = arr ? arr.length : 0;
          if (len < (rule as { minItems: number }).minItems)
            error =
              rule.message ??
              `Must have at least ${(rule as { minItems: number }).minItems} item${(rule as { minItems: number }).minItems === 1 ? '' : 's'}`;
        } else if ('maxItems' in rule) {
          const len = arr ? arr.length : 0;
          if (len > (rule as { maxItems: number }).maxItems)
            error =
              rule.message ??
              `Must have at most ${(rule as { maxItems: number }).maxItems} item${(rule as { maxItems: number }).maxItems === 1 ? '' : 's'}`;
        } else if ('contains' in rule) {
          if (!arr?.some((item) => isDeepEqual(item, (rule as { contains: unknown }).contains)))
            error = rule.message ?? 'Must contain the required value';

          // ── Enum ──────────────────────────────────────────────────────────
        } else if ('oneOf' in rule) {
          if (
            present &&
            !(rule as { oneOf: unknown[] }).oneOf.some((opt) => isDeepEqual(value, opt))
          )
            error =
              rule.message ?? `Must be one of: ${(rule as { oneOf: unknown[] }).oneOf.join(', ')}`;
        } else if ('notOneOf' in rule) {
          if (
            present &&
            (rule as { notOneOf: unknown[] }).notOneOf.some((opt) => isDeepEqual(value, opt))
          )
            error =
              rule.message ??
              `Must not be one of: ${(rule as { notOneOf: unknown[] }).notOneOf.join(', ')}`;

          // ── Cross-field comparisons ───────────────────────────────────────
        } else if ('matches' in rule) {
          const other = getNestedValue(values, (rule as { matches: string }).matches);
          if (!isDeepEqual(value, other)) error = rule.message ?? 'Values do not match';
        } else if ('doesNotMatch' in rule) {
          const other = getNestedValue(values, (rule as { doesNotMatch: string }).doesNotMatch);
          if (isDeepEqual(value, other)) error = rule.message ?? 'Values must not match';
        } else if ('greaterThan' in rule) {
          const other = Number(
            getNestedValue(values, (rule as { greaterThan: string }).greaterThan)
          );
          if (present && Number(value) <= other)
            error = rule.message ?? `Must be greater than ${other}`;
        } else if ('lessThan' in rule) {
          const other = Number(getNestedValue(values, (rule as { lessThan: string }).lessThan));
          if (present && Number(value) >= other)
            error = rule.message ?? `Must be less than ${other}`;
        } else if ('after' in rule) {
          const thisDate = toDate(value);
          const otherDate = toDate(getNestedValue(values, (rule as { after: string }).after));
          if (thisDate && otherDate && thisDate <= otherDate)
            error = rule.message ?? 'Must be after the reference date';
        } else if ('before' in rule) {
          const thisDate = toDate(value);
          const otherDate = toDate(getNestedValue(values, (rule as { before: string }).before));
          if (thisDate && otherDate && thisDate >= otherDate)
            error = rule.message ?? 'Must be before the reference date';

          // ── Conditional presence ──────────────────────────────────────────
        } else if ('requiredIf' in rule) {
          const trigger = getNestedValue(values, (rule as { requiredIf: string }).requiredIf);
          if (trigger && !present) error = rule.message ?? 'Required';
        } else if ('requiredUnless' in rule) {
          const trigger = getNestedValue(
            values,
            (rule as { requiredUnless: string }).requiredUnless
          );
          if (!trigger && !present) error = rule.message ?? 'Required';

          // ── File validation ───────────────────────────────────────────────
        } else if ('maxFileSize' in rule) {
          const limit = (rule as { maxFileSize: number; message?: string }).maxFileSize;
          const msg =
            (rule as { message?: string }).message ?? `File must be at most ${formatBytes(limit)}`;
          const files: Array<{ size: number; type: string }> = [];
          if (isFileLike(value)) {
            files.push(value);
          } else if (isFileListLike(value)) {
            for (let i = 0; i < value.length; i++) {
              const f = value.item(i);
              if (f) files.push(f);
            }
          }
          if (present && files.some((f) => f.size > limit)) error = msg;
        } else if ('minFileSize' in rule) {
          const limit = (rule as { minFileSize: number; message?: string }).minFileSize;
          const msg =
            (rule as { message?: string }).message ?? `File must be at least ${formatBytes(limit)}`;
          const files: Array<{ size: number; type: string }> = [];
          if (isFileLike(value)) {
            files.push(value);
          } else if (isFileListLike(value)) {
            for (let i = 0; i < value.length; i++) {
              const f = value.item(i);
              if (f) files.push(f);
            }
          }
          if (present && files.some((f) => f.size < limit)) error = msg;
        } else if ('fileTypes' in rule) {
          const types = (rule as { fileTypes: string[]; message?: string }).fileTypes;
          const msg =
            (rule as { message?: string }).message ??
            `File type must be one of: ${types.join(', ')}`;
          const files: Array<{ size: number; type: string }> = [];
          if (isFileLike(value)) {
            files.push(value);
          } else if (isFileListLike(value)) {
            for (let i = 0; i < value.length; i++) {
              const f = value.item(i);
              if (f) files.push(f);
            }
          }
          if (present && files.some((f) => !types.some((r) => matchesMimeType(r, f.type))))
            error = msg;
        } else if ('maxFiles' in rule) {
          const max = (rule as { maxFiles: number; message?: string }).maxFiles;
          const count = isFileListLike(value) ? (value as any).length : isFileLike(value) ? 1 : 0;
          if (count > max)
            error =
              (rule as { message?: string }).message ??
              `Select at most ${max} file${max === 1 ? '' : 's'}`;
        } else if ('minFiles' in rule) {
          const min = (rule as { minFiles: number; message?: string }).minFiles;
          const count = isFileListLike(value) ? (value as any).length : isFileLike(value) ? 1 : 0;
          if (count < min)
            error =
              (rule as { message?: string }).message ??
              `Select at least ${min} file${min === 1 ? '' : 's'}`;
        }
      }

      if (error !== null) {
        errors[path] = error;
        break;
      }
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Module-scope production flag
// ---------------------------------------------------------------------------

export const __isProduction = ((): boolean => {
  try {
    return (globalThis as any).process?.env?.NODE_ENV === 'production';
  } catch {
    return false;
  }
})();

// ---------------------------------------------------------------------------
// createForm (full-tier composition)
// ---------------------------------------------------------------------------

/**
 * Full-tier `createForm`: builds the shared engine core via `createCoreForm`,
 * then attaches computed fields, array-ops, DOM bridge, and persistence on
 * top. `attachComputedFields` is deliberately called here — NOT inside
 * `createCoreForm` — so that `minimal.ts`'s `createForm` (which calls
 * `createCoreForm` directly and returns its `instance` unmodified) never
 * gets computed-field support. See engine.ts's module doc comment.
 *
 * Only need set/get/validate/subscribe? `@neutro/form/core/minimal` ships a smaller bundle.
 */
export function createForm<T extends object>(config: FormConfig<T>): FormInstance<T> {
  const { ctx, instance } = createCoreForm(config);

  // Full-tier only — minimal.ts never calls this. Must run before the seed
  // call below so the real hasComputedFields/isComputedField/runComputedPass
  // overrides (not the no-op defaults createCoreForm leaves in place) are
  // installed first.
  attachComputedFields(ctx, config);
  // Seed computed values into initialValues/values now that the real
  // implementation is installed. createCoreForm never calls this itself
  // (its runComputedPass stays at the no-op default until the line above
  // runs), so this is the only place computed fields get seeded at init.
  ctx.runComputedPass();

  const { hydrate } = attachPersistence(ctx);
  const { connect, focus, focusFirstError, getAriaProps, getConnectedCount } = attachDomBridge(
    ctx,
    config
  );
  const { arrayAppend, arrayInsert, arrayRemove, arrayMove, arraySwap } = attachArrayOps(ctx);

  return Object.assign(instance, {
    connect,
    getAriaProps,
    arrayAppend,
    arrayInsert,
    arrayRemove,
    arrayMove,
    arraySwap,
    hydrate,
    getConnectedCount,
    focus,
    focusFirstError,
  }) as FormInstance<T>;
}
