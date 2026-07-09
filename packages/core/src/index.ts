/**
 * @neutro/form-core
 * High-Performance, Zero-Dependency, Framework-Agnostic Reactive Form Engine.
 */

import { attachComputedFields } from './features/computed-fields.js';
import { _getPayload, attachDomBridge } from './features/dom-bridge.js';
import { attachPersistence } from './features/persistence.js';
import { buildPathTrie, isKnownPath } from './path-trie.js';

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

export interface FormInstance<T extends object> {
  subscribe: (fn: FormSubscriber<T>) => () => void;
  subscribeToPath<P extends Path<T>>(path: P, fn: PathSubscriber<GetPathValue<T, P>>): () => void;
  subscribeToPathDynamic(path: string, fn: (value: unknown) => void): () => void;
  get<P extends Path<T>>(path: P): GetPathValue<T, P>;
  set<P extends Path<T>>(path: P, val: GetPathValue<T, P>, options?: SetOptions): void;
  validate(scopePaths?: Array<Path<T> | string[]>): Promise<boolean>;
  connect: (path: Path<T>, el: HTMLElement, options?: ConnectOptions) => () => void;
  submit: (onValid: (payload: Partial<T>) => void | Promise<void>) => Promise<boolean>;
  handleSubmit: (
    onValid: (payload: Partial<T>) => void | Promise<void>,
    onInvalid?: (errors: Record<string, string>) => void
  ) => (e?: Event) => void;
  getState: () => FormState<T>;
  getPayload: () => Partial<T>;
  setDynamic(path: string, value: unknown, options?: SetOptions): void;
  getDynamic<V = unknown>(path: string): V;
  getAriaProps: (path: Path<T>, options?: AriaPropsOptions) => AriaProps;
  batch: (fn: () => void) => void;
  arrayAppend<P extends Path<T>>(path: P, item: ArrayItem<GetPathValue<T, P>>): void;

  arrayInsert<P extends Path<T>>(path: P, index: number, item: ArrayItem<GetPathValue<T, P>>): void;

  arrayRemove<P extends Path<T>>(path: P, index: number): void;

  arrayMove<P extends Path<T>>(path: P, fromIndex: number, toIndex: number): void;

  arraySwap<P extends Path<T>>(path: P, indexA: number, indexB: number): void;
  reset: (newValues?: T) => void;
  resetField(path: Path<T>, options?: ResetFieldOptions): void;
  /**
   * Reads stored values from the persistence adapter and merges them into the
   * form as the new initial values. No-op if no adapter is configured.
   * Must be called after mount. Returns a Promise that resolves when done.
   */
  hydrate(): Promise<void>;
  getConnectedCount: () => number;
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
  focus(path: Path<T>): boolean;
  focusFirstError(): boolean;
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

function matchesWildcardPattern(pattern: string, path: string): string[] | null {
  const patternParts = pattern.split('.');
  const pathParts = path.split('.');
  if (patternParts.length !== pathParts.length) return null;
  const indices: string[] = [];
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i] === '*') {
      if (!/^\d+$/.test(pathParts[i])) return null; // only numeric indices
      indices.push(pathParts[i]);
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return indices;
}

function resolveWildcardDependents(dependentPatterns: string[], indices: string[]): string[] {
  return dependentPatterns.map((dep) => {
    let i = 0;
    return dep.replace(/\*/g, () => indices[i++] ?? '*');
  });
}

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

function applyBuiltInRules<T>(
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
// createForm
// ---------------------------------------------------------------------------

/**
 * Consolidates createForm's closure state (the six tracked structures, DOM
 * bridge registries, batching/async bookkeeping, submission state, and the
 * cross-cluster primitives every feature needs) into a single object. This
 * removes the need to pass ~35 individual closure variables/functions around
 * once the engine is split into feature files (see the modular-bundle-splitting
 * spec). All fields alias the SAME underlying objects/Maps/Sets used elsewhere
 * in createForm — mutating ctx.errors mutates the real `errors` map in place —
 * so this is purely an access-path change, not a state duplication.
 */
export interface FormEngineContext<T extends object> {
  values: T;
  initialValues: T;
  errors: Record<string, string>;
  touched: Record<string, boolean>;
  dirty: Record<string, boolean>;
  wasSet: Record<string, boolean>;
  validatedPaths: Set<string>;
  pathIndex: Map<string, Map<string, number>>;
  pathSubscribers: Map<string, Set<PathSubscriber>>;
  globalSubscribers: Set<FormSubscriber<T>>;
  connectionRegistry: Map<string, WeakRef<HTMLElement>>;
  connectedPaths: Set<string>;
  persistedPaths: Set<string>;
  mutationObserver: MutationObserver | null;
  persistenceUnsubscribe: (() => void) | null;
  persistenceWriteTimer: ReturnType<typeof setTimeout> | null;
  batchDepth: number;
  pendingPaths: Set<string | undefined>;
  pendingExactPaths: Set<string>;
  asyncEpoch: number;
  activeAbortControllers: Map<string, AbortController>;
  isSubmitting: boolean;
  isValidating: boolean;
  hasValidated: boolean;
  isHydrating: boolean;
  submissionAttempts: number;
  lastSubmittedValues: Partial<T> | null;
  config: FormConfig<T>;
  transientPaths: string[];
  isComputedField: (path: string) => boolean;
  runComputedPass: () => string[];
  hasComputedFields: () => boolean;
  onReset: (newValues?: T) => void;
  runValidation: (scopePaths?: string[]) => Promise<boolean>;
  dispatchAction: (action: FormAction) => void;
  notify: (path?: string, options?: { exact?: boolean }) => void;
  notifyGlobalSubscribers: (snap: FormState<T>) => void;
  notifyPathSubscribers: (paths: string[], exactPaths?: string[]) => void;
  batch: (fn: () => void) => void;
  indexKey: (key: string) => void;
  unindexKey: (key: string) => void;
  getState: () => FormState<T>;
  resolveFieldMode: (path: string, connectOverride?: ValidationMode) => ValidationMode;
  deepMerge: (base: any, override: any, seen?: WeakSet<any>) => any;
  setFieldValue: (path: string, value: unknown, options?: SetOptions) => void;
  subscribeToPath: <V>(path: string, fn: PathSubscriber<V>) => () => void;
  __warnUnknownPath: (path: string) => void;
  isFieldRequired: (path: string) => boolean;
  subscribe: (fn: FormSubscriber<T>) => () => void;
}

export function createForm<T extends object>(config: FormConfig<T>): FormInstance<T> {
  // `values`/`initialValues` are the sole two documented exceptions kept as
  // standalone `const` (not inlined into ctx below, not deleted): several
  // top-level statements between here and `ctx`'s declaration (the
  // compileDependencyScopes call, the computed-fields seed pass, the dev
  // path-trie build) read them immediately, before `ctx` exists — see the
  // comments at those call sites. Every other tracked-state field (errors,
  // touched, dirty, wasSet, validatedPaths, pathIndex, pathSubscribers,
  // globalSubscribers, connectionRegistry, connectedPaths, persistedPaths,
  // mutationObserver, persistenceUnsubscribe, persistenceWriteTimer,
  // batchDepth, pendingPaths, pendingExactPaths, asyncEpoch,
  // activeAbortControllers, isSubmitting, isValidating, hasValidated,
  // isHydrating, submissionAttempts, lastSubmittedValues) has no such
  // pre-ctx reader, so it is declared directly inside the ctx object literal
  // below instead of as a standalone `const`/`let` here.
  const initialValues = deepClone(config.initialValues);
  const values = deepClone(initialValues);

  const { preComputedScopes, wildcardDependencies } = config.dependencies
    ? compileDependencyScopes(config.dependencies, initialValues)
    : {
        preComputedScopes: {} as Record<string, string[]>,
        wildcardDependencies: [] as WildcardDependency[],
      };

  const rawDebounce = config.asyncDebounceMs ?? 300;
  const asyncDebounceMs =
    Number.isFinite(rawDebounce) && rawDebounce >= 0
      ? rawDebounce
      : (() => {
          console.warn(
            `[NeutroForm] asyncDebounceMs must be a finite non-negative number (got ${rawDebounce}); using 300ms`
          );
          return 300;
        })();

  // Re-evaluate production flag per form instance so tests can toggle NODE_ENV between instances.
  const __isProdLocal = ((): boolean => {
    try {
      return (globalThis as any).process?.env?.NODE_ENV === 'production';
    } catch {
      return false;
    }
  })();

  const getState = (): FormState<T> => ({
    values: deepClone(ctx.values),
    errors: { ...ctx.errors },
    touched: { ...ctx.touched },
    dirty: { ...ctx.dirty },
    isSubmitting: ctx.isSubmitting,
    isValidating: ctx.isValidating,
    isValid: ctx.hasValidated ? Object.keys(ctx.errors).length === 0 : null,
    submissionAttempts: ctx.submissionAttempts,
    lastSubmittedValues: ctx.lastSubmittedValues ? deepClone(ctx.lastSubmittedValues) : null,
  });

  const actionListeners = new Set<(action: FormAction, state: FormState<T>) => void>();
  const dispatchAction = (action: FormAction): void => {
    if (actionListeners.size === 0) return;
    const snapshot = ctx.getState();
    actionListeners.forEach((fn) => {
      try {
        fn(action, snapshot);
      } catch (err) {
        console.error('[NeutroForm] _subscribeToActions listener threw:', err);
      }
    });
  };

  const notifyGlobalSubscribers = (snapshot: FormState<T>) => {
    for (const fn of ctx.globalSubscribers) {
      try {
        fn(snapshot);
      } catch (err) {
        console.error('[NeutroForm] subscriber threw:', err);
      }
    }
  };

  // Shared path fan-out logic used by ctx.notify(), _flushNotifications(), and reset().
  //
  // Walks both directions from each mutated path: upward to ancestors (so a
  // subscriber on 'items' fires when 'items.0.v' changes) and downward to
  // registered descendants (so a subscriber on 'items.0.v' fires when 'items.0'
  // or 'items' is replaced wholesale). The descendant scan only runs when the
  // mutated value is itself an object/array — primitive leaf sets (the
  // set-get/subscriptions benchmark hot path) skip the O(n) descendant scan entirely.
  //
  // All paths-to-ctx.notify across the whole flush are collected into one Set before
  // firing, so a subscriber reachable via two different mutated paths in the same
  // ctx.batch (e.g. arrayRemove's shifted-key ctx.notify plus its whole-array ctx.notify)
  // fires exactly once, not once per path that reaches it.
  const notifyPathSubscribers = (paths: string[], exactPaths: string[] = []) => {
    const toNotify = new Set<string>();
    for (const mutatedPath of paths) {
      toNotify.add('*');
      const parts = mutatedPath.split('.');
      let accum = '';
      for (const part of parts) {
        accum = accum ? `${accum}.${part}` : part;
        toNotify.add(accum);
      }
      const currentVal = getNestedValue(ctx.values, mutatedPath);
      if (currentVal !== null && typeof currentVal === 'object') {
        const descendantPrefix = `${mutatedPath}.`;
        for (const registered of ctx.pathSubscribers.keys()) {
          if (registered !== '*' && registered.startsWith(descendantPrefix)) {
            toNotify.add(registered);
          }
        }
      }
    }
    // Exact-only paths: walk ancestors (so the path itself and its ancestors are
    // notified) but deliberately skip the descendant scan above — this is what lets
    // arrayRemove reach a subscriber on the array path itself without re-notifying
    // every unaffected sibling item registered under it.
    for (const mutatedPath of exactPaths) {
      toNotify.add('*');
      const parts = mutatedPath.split('.');
      let accum = '';
      for (const part of parts) {
        accum = accum ? `${accum}.${part}` : part;
        toNotify.add(accum);
      }
    }
    for (const p of toNotify) {
      const listeners = ctx.pathSubscribers.get(p);
      if (!listeners) continue;
      const val = p === '*' ? deepClone(ctx.values) : deepClone(getNestedValue(ctx.values, p));
      for (const cb of listeners) {
        try {
          cb(val, { error: ctx.errors[p], touched: ctx.touched[p], dirty: ctx.dirty[p] });
        } catch (err) {
          console.error('[NeutroForm] path subscriber threw:', err);
        }
      }
    }
  };

  // Called when a ctx.batch flushes: notifies global subscribers once, then replays each path.
  const _flushNotifications = (paths: Array<string | undefined>, exactPaths: string[] = []) => {
    if (ctx.globalSubscribers.size > 0) {
      ctx.notifyGlobalSubscribers(ctx.getState());
    }
    const unique = [...new Set(paths.filter((p): p is string => p !== undefined))];
    const uniqueExact = [...new Set(exactPaths)];
    ctx.notifyPathSubscribers(unique, uniqueExact);
  };

  // Bug #9: guard ctx.getState() behind ctx.globalSubscribers.size > 0.
  // Rule: ctx.notify(path) for field-data mutations; ctx.notify() with no arg for flag-only changes.
  // Pass { exact: true } to ctx.notify a subscriber registered on mutatedPath itself (and its
  // ancestors) WITHOUT the descendant scan — i.e. without re-notifying sibling entries
  // registered under the same path. See arrayRemove.
  const notify = (mutatedPath?: string, options?: { exact?: boolean }) => {
    const exact = options?.exact ?? false;
    if (ctx.batchDepth > 0) {
      if (exact && mutatedPath) {
        ctx.pendingExactPaths.add(mutatedPath);
      } else {
        ctx.pendingPaths.add(mutatedPath);
      }
      return;
    }
    if (ctx.globalSubscribers.size > 0) {
      ctx.notifyGlobalSubscribers(ctx.getState());
    }
    if (mutatedPath) {
      if (exact) ctx.notifyPathSubscribers([], [mutatedPath]);
      else ctx.notifyPathSubscribers([mutatedPath]);
    }
  };

  const batch = (fn: () => void) => {
    ctx.batchDepth++;
    try {
      fn();
    } finally {
      ctx.batchDepth--;
      if (ctx.batchDepth === 0 && (ctx.pendingPaths.size > 0 || ctx.pendingExactPaths.size > 0)) {
        const paths = [...ctx.pendingPaths];
        const exactPaths = [...ctx.pendingExactPaths];
        ctx.pendingPaths.clear();
        ctx.pendingExactPaths.clear();
        _flushNotifications(paths, exactPaths);
      }
    }
  };

  const subscribe = (fn: FormSubscriber<T>) => {
    ctx.globalSubscribers.add(fn);
    try {
      fn(ctx.getState());
    } catch (err) {
      console.error('[NeutroForm] subscriber threw on initial call:', err);
    }
    return () => {
      ctx.globalSubscribers.delete(fn);
    };
  };

  const runValidation = async (scopePaths?: string[]): Promise<boolean> => {
    if (!ctx.config.validator && !ctx.config.rules) {
      if (!scopePaths) {
        ctx.hasValidated = true;
        for (const p of extractAllPaths(ctx.values)) {
          if (!ctx.validatedPaths.has(p)) {
            ctx.validatedPaths.add(p);
            ctx.indexKey(p);
          }
        }
      } else {
        for (const path of scopePaths) {
          if (!ctx.validatedPaths.has(path)) {
            ctx.validatedPaths.add(path);
            ctx.indexKey(path);
          }
        }
      }
      return true;
    }
    ctx.isValidating = true;
    // ctx.isValidating is a global flag — only global subscribers need this notification.
    if (ctx.globalSubscribers.size > 0) {
      ctx.notifyGlobalSubscribers(ctx.getState());
    }

    let expandedScope: string[] | undefined;
    if (
      scopePaths &&
      (Object.keys(preComputedScopes).length > 0 || wildcardDependencies.length > 0)
    ) {
      const expandedSet = new Set<string>();
      for (const path of scopePaths) {
        const resolved = preComputedScopes[path];
        if (resolved) {
          for (const p of resolved) expandedSet.add(p);
        } else {
          expandedSet.add(path);
        }
        // Apply runtime wildcard dependency resolution
        wildcardDependencies.forEach(({ pattern, dependents }) => {
          const indices = matchesWildcardPattern(pattern, path);
          if (indices !== null) {
            const resolved = resolveWildcardDependents(dependents, indices);
            for (const p of resolved) expandedSet.add(p);
          }
        });
      }
      expandedScope = Array.from(expandedSet);
    } else if (scopePaths) {
      expandedScope = scopePaths;
    }

    const activeEpoch = ++ctx.asyncEpoch;
    let abortController: AbortController | undefined;

    try {
      if (expandedScope) {
        for (const path of expandedScope) {
          ctx.activeAbortControllers.get(path)?.abort();
          ctx.activeAbortControllers.delete(path);
        }
      }
      abortController = new AbortController();
      if (expandedScope) {
        for (const path of expandedScope) ctx.activeAbortControllers.set(path, abortController);
      }

      // Built-in rules run synchronously first; custom validator ctx.errors override on conflict.
      const builtInErrors: Record<string, string> = ctx.config.rules
        ? applyBuiltInRules(
            ctx.values,
            ctx.config.rules as Record<string, BuiltInRule | BuiltInRule[]>,
            expandedScope
          )
        : {};

      if (ctx.config.validator) {
        // Bug #13: pass snapshot so mid-await mutations can't corrupt validation state.
        const valuesSnapshot = deepClone(ctx.values);
        const validationResult = ctx.config.validator(
          valuesSnapshot,
          expandedScope,
          abortController.signal
        );

        const isValidatorReturn = (r: unknown): r is Record<string, string> =>
          r !== null && r !== undefined && typeof r === 'object' && !Array.isArray(r);

        if (validationResult instanceof Promise) {
          // Bug #8: per-invocation debounce — uses a local timer, not a shared one.
          const resolvedErrors = await new Promise<Record<string, string>>((resolve) => {
            const runValidator = async () => {
              try {
                const result = await validationResult;
                if (!isValidatorReturn(result)) {
                  console.error(
                    '[NeutroForm] validator must return Record<string,string> or Promise<Record<string,string>>'
                  );
                  resolve({});
                } else {
                  resolve(result);
                }
              } catch {
                resolve({ _global: 'Asynchronous validation transaction failed.' });
              }
            };

            if (!asyncDebounceMs) {
              // Bug #8 fix: with no debounce window to wait through, skip the
              // setTimeout macrotask entirely. A bare setTimeout(fn, 0) still
              // forces a full event-loop timer-phase cycle on every call -
              // ~300x slower than resolving via microtask scheduling (proven
              // during v0.5.0 schema-validator-overhead bench work: a sync
              // validator sharing this same AbortController/epoch machinery
              // ran ~300x faster than the async path, isolating the
              // setTimeout call itself as the dominant cost, not the
              // AbortController/epoch bookkeeping).
              if (abortController?.signal.aborted) {
                resolve(ctx.errors);
                return;
              }
              runValidator();
            } else {
              let localTimer: any;
              const onAbort = () => {
                clearTimeout(localTimer);
                resolve(ctx.errors);
              };
              abortController?.signal.addEventListener('abort', onAbort, { once: true });
              localTimer = setTimeout(() => {
                abortController?.signal.removeEventListener('abort', onAbort);
                if (abortController?.signal.aborted) {
                  resolve(ctx.errors);
                  return;
                }
                runValidator();
              }, asyncDebounceMs);
            }
          });

          if (activeEpoch === ctx.asyncEpoch && !abortController?.signal.aborted) {
            const combined = { ...builtInErrors, ...resolvedErrors };
            applyRecordDiff(
              ctx.errors,
              expandedScope ? mergeScopedErrors(ctx.errors, combined, expandedScope) : combined
            );
          }
        } else {
          if (!isValidatorReturn(validationResult)) {
            console.error(
              '[NeutroForm] validator must return Record<string,string> or Promise<Record<string,string>>'
            );
          }
          const safeResult = isValidatorReturn(validationResult) ? validationResult : {};
          const combined = { ...builtInErrors, ...safeResult };
          applyRecordDiff(
            ctx.errors,
            expandedScope ? mergeScopedErrors(ctx.errors, combined, expandedScope) : combined
          );
        }
      } else {
        applyRecordDiff(
          ctx.errors,
          expandedScope
            ? mergeScopedErrors(ctx.errors, builtInErrors, expandedScope)
            : builtInErrors
        );
      }
    } finally {
      if (expandedScope) {
        for (const path of expandedScope) ctx.activeAbortControllers.delete(path);
      }
      ctx.isValidating = false;
      if (!expandedScope && activeEpoch === ctx.asyncEpoch) ctx.hasValidated = true;
      // Populate ctx.validatedPaths: for a scoped run reuse expandedScope; for a full run
      // walk current ctx.values. (extractAllPaths is not called for scoped runs.)
      if (expandedScope) {
        if (activeEpoch === ctx.asyncEpoch && !abortController?.signal.aborted) {
          for (const path of expandedScope) {
            if (!ctx.validatedPaths.has(path)) {
              ctx.validatedPaths.add(path);
              ctx.indexKey(path);
            }
          }
        }
      } else if (activeEpoch === ctx.asyncEpoch) {
        for (const p of extractAllPaths(ctx.values)) {
          if (!ctx.validatedPaths.has(p)) {
            ctx.validatedPaths.add(p);
            ctx.indexKey(p);
          }
        }
      }
      if (ctx.globalSubscribers.size > 0) {
        ctx.notifyGlobalSubscribers(ctx.getState());
      }
      // Notify path subscribers so they see updated error state.
      const pathsToNotify =
        expandedScope ?? [...ctx.pathSubscribers.keys()].filter((p) => p !== '*');
      ctx.notifyPathSubscribers(pathsToNotify);
    }

    return Object.keys(ctx.errors).length === 0;
  };

  const indexKey = (key: string) => {
    const segments = key.split('.');
    let prefix = segments[0];
    for (let i = 1; i < segments.length; i++) {
      let counts = ctx.pathIndex.get(prefix);
      if (!counts) {
        counts = new Map();
        ctx.pathIndex.set(prefix, counts);
      }
      counts.set(key, (counts.get(key) ?? 0) + 1);
      prefix = `${prefix}.${segments[i]}`;
    }
  };

  const unindexKey = (key: string) => {
    const segments = key.split('.');
    let prefix = segments[0];
    for (let i = 1; i < segments.length; i++) {
      const counts = ctx.pathIndex.get(prefix);
      if (counts) {
        const next = (counts.get(key) ?? 1) - 1;
        if (next <= 0) counts.delete(key);
        else counts.set(key, next);
        if (counts.size === 0) ctx.pathIndex.delete(prefix);
      }
      prefix = `${prefix}.${segments[i]}`;
    }
  };

  // In-place diff applier for `ctx.errors`, which ctx.runValidation updates via a computed
  // next-value map rather than mutating key-by-key. Clears keys absent from `next`,
  // assigns/updates keys present in `next`, keeping ctx.pathIndex in sync via
  // ctx.indexKey/ctx.unindexKey — without reassigning `target`'s identity.
  const applyRecordDiff = (target: Record<string, string>, next: Record<string, string>): void => {
    for (const key of Object.keys(target)) {
      if (!(key in next)) {
        delete target[key];
        ctx.unindexKey(key);
      }
    }
    for (const key of Object.keys(next)) {
      if (!(key in target)) ctx.indexKey(key);
      target[key] = next[key];
    }
  };

  const mergeScopedErrors = (
    currentErrors: Record<string, string>,
    nextErrors: Record<string, string>,
    scopePaths: string[]
  ): Record<string, string> => {
    const updated = { ...currentErrors };
    scopePaths.forEach((path) => {
      Object.keys(updated).forEach((key) => {
        if (key === path || key.startsWith(`${path}.`)) delete updated[key];
      });
    });
    Object.keys(nextErrors).forEach((key) => {
      if (DANGEROUS_PATH_KEYS.has(key)) return;
      if (scopePaths.some((scope) => key === scope || key.startsWith(`${scope}.`)))
        updated[key] = nextErrors[key];
    });
    return updated;
  };

  const setFieldValue = (
    path: string,
    val: any,
    options: { touch?: boolean; validate?: boolean } = {}
  ) => {
    if (ctx.isComputedField(path)) {
      if (!__isProdLocal) {
        console.warn(`[NeutroForm] "${path}" is a computed field — set() is a no-op.`);
      }
      return;
    }
    const wasAlreadySet = path in ctx.wasSet;
    ctx.wasSet[path] = true;
    if (!wasAlreadySet) ctx.indexKey(path);
    const currentVal = getNestedValue(ctx.values, path);
    if (isDeepEqual(currentVal, val)) return;
    ctx.batch(() => {
      setNestedValue(ctx.values, path, val);
      const initialVal = getNestedValue(ctx.initialValues, path);
      const dirtyAlreadySet = path in ctx.dirty;
      ctx.dirty[path] = !isDeepEqual(initialVal, val);
      if (!ctx.dirty[path]) {
        delete ctx.dirty[path];
        if (dirtyAlreadySet) ctx.unindexKey(path);
      } else if (!dirtyAlreadySet) {
        ctx.indexKey(path);
      }
      if (options.touch) {
        const touchedAlreadySet = path in ctx.touched;
        ctx.touched[path] = true;
        if (!touchedAlreadySet) ctx.indexKey(path);
      }
    });
    if (ctx.hasComputedFields()) {
      if (ctx.batchDepth > 0) {
        // Inside an outer ctx.batch: run computed pass to keep ctx.values consistent,
        // but defer all notifications until the ctx.batch flushes.
        const changedComputedPaths = ctx.runComputedPass();
        ctx.pendingPaths.add(path);
        for (const cp of changedComputedPaths) ctx.pendingPaths.add(cp);
      } else {
        // Outside any ctx.batch: run the computed pass first, then ctx.notify path and computed
        // subscribers in one call. A single call means ctx.notifyPathSubscribers' dedup Set
        // covers both — a descendant subscriber under `path` (e.g. a computed field nested
        // inside an object-valued set() target) fires exactly once, with the post-computed
        // value, instead of once (stale, pre-computed) from a `[path]`-only call and again
        // (fresh) from a separate `changedComputedPaths` call.
        const changedComputedPaths = ctx.runComputedPass();
        ctx.notifyPathSubscribers([path, ...changedComputedPaths]);
        if (ctx.globalSubscribers.size > 0) {
          ctx.notifyGlobalSubscribers(ctx.getState());
        }
      }
    } else {
      ctx.notify(path);
    }
    if (options.validate === true) ctx.runValidation([path]);
  };

  const shiftStateIndices = (
    basePath: string,
    fromIndex: number,
    action: 'remove' | 'insert',
    targetIndex?: number
  ): string[] => {
    const shiftedKeys: string[] = [];
    const candidates = Array.from(ctx.pathIndex.get(basePath)?.keys() ?? []);
    // Two-phase per map: compute every drop/rename against the ORIGINAL stateMap
    // first, then delete every affected candidate key, and only after all deletes
    // have landed write the renamed ctx.values back in. Doing delete-and-write in a
    // single interleaved pass (in `candidates` iteration order) is unsafe: e.g.
    // removing index 0 from a 5-item array renames index 1's key down to index 0's
    // key while ALSO needing to drop the original index-0 key — if the candidate
    // order processes the rename before the drop, the drop (keyed only by string,
    // not by "was this a rename target") silently wipes out the just-renamed value.
    const shiftMap = (stateMap: Record<string, any>) => {
      const prefix = `${basePath}.`;
      const toDelete: string[] = [];
      const renames: Array<[string, string, any]> = [];
      for (const key of candidates) {
        if (!(key in stateMap)) continue;
        if (!key.startsWith(prefix)) continue;
        const remaining = key.substring(prefix.length);
        const match = remaining.match(/^(\d+)(.*)$/);
        if (!match) continue;
        const index = parseInt(match[1], 10);
        const tail = match[2];
        if (action === 'remove') {
          if (index === fromIndex) {
            toDelete.push(key);
            ctx.unindexKey(key);
          } else if (index > fromIndex) {
            toDelete.push(key);
            ctx.unindexKey(key);
            renames.push([key, `${prefix}${index - 1}${tail}`, stateMap[key]]);
          }
        } else if (action === 'insert' && targetIndex !== undefined) {
          if (index >= targetIndex) {
            toDelete.push(key);
            ctx.unindexKey(key);
            renames.push([key, `${prefix}${index + 1}${tail}`, stateMap[key]]);
          }
        }
      }
      // Value captured in the renames triple ABOVE, before any delete below — reading
      // stateMap[oldKey] after deletion would return undefined.
      for (const key of toDelete) delete stateMap[key];
      for (const [, newKey, value] of renames) {
        stateMap[newKey] = value;
        ctx.indexKey(newKey);
        shiftedKeys.push(newKey);
      }
    };
    ctx.batch(() => {
      shiftMap(ctx.errors);
      shiftMap(ctx.touched);
      shiftMap(ctx.dirty);
      shiftMap(ctx.wasSet);
      // Update ctx.validatedPaths for the structural change.
      // For insert: shift existing indices ≥ targetIndex up by 1 so tracking follows items.
      // For remove: drop the removed index, renumber survivors above it.
      const arrPrefix = `${basePath}.`;
      const validatedRenames: string[] = [];
      for (const key of candidates) {
        if (!ctx.validatedPaths.has(key)) continue;
        if (!key.startsWith(arrPrefix)) continue;
        const remaining = key.substring(arrPrefix.length);
        const match = remaining.match(/^(\d+)(.*)$/);
        if (!match) continue;
        const index = parseInt(match[1], 10);
        const tail = match[2];
        if (action === 'remove') {
          if (index === fromIndex) {
            ctx.validatedPaths.delete(key);
            ctx.unindexKey(key);
          } else if (index > fromIndex) {
            ctx.validatedPaths.delete(key);
            ctx.unindexKey(key);
            validatedRenames.push(`${arrPrefix}${index - 1}${tail}`);
          }
        } else if (action === 'insert' && targetIndex !== undefined) {
          if (index >= targetIndex) {
            ctx.validatedPaths.delete(key);
            ctx.unindexKey(key);
            validatedRenames.push(`${arrPrefix}${index + 1}${tail}`);
          }
        }
      }
      // Add renamed ctx.validatedPaths entries only after every drop/delete above has
      // landed — same collision hazard as shiftMap above (a rename target can
      // coincide with a key that's also being dropped this same pass).
      for (const newKey of validatedRenames) {
        ctx.validatedPaths.add(newKey);
        ctx.indexKey(newKey);
      }
      // Also ctx.notify any actively-registered subscriber path under this array index whose
      // slot content shifted, even when no error/ctx.touched/ctx.dirty/ctx.wasSet state exists there -
      // otherwise arrayRemove/arrayInsert would have no way to reach a per-item VALUE
      // subscriber except by falling back to notifying the whole array (which, since
      // ctx.notify() cascades to descendants, re-fires every unaffected sibling too, not just
      // the shifted items). Unlike the state maps above (which relocate data to a new key),
      // subscriptions are registered against a fixed slot path - by the time this runs,
      // `ctx.values` has already been mutated (splice happened before this call), so re-running
      // ctx.notify() on the *same* key re-reads the new content that shifted into that slot.
      // Note: ctx.pathSubscribers itself is NOT renamed here (subscriptions stay registered at
      // their original path — only the ctx.notify-list is computed), so no ctx.indexKey/ctx.unindexKey
      // calls are needed for this loop; it only reads ctx.pathSubscribers, never writes it.
      for (const key of candidates) {
        if (!ctx.pathSubscribers.has(key) || key === '*') continue;
        if (!key.startsWith(arrPrefix)) continue;
        const remaining = key.substring(arrPrefix.length);
        const match = remaining.match(/^(\d+)(.*)$/);
        if (!match) continue;
        const index = parseInt(match[1], 10);
        if (action === 'remove') {
          if (index >= fromIndex) shiftedKeys.push(key);
        } else if (action === 'insert' && targetIndex !== undefined) {
          if (index >= targetIndex) shiftedKeys.push(key);
        }
      }
    });
    return [...new Set(shiftedKeys)];
  };

  const rekeyArrayState = (basePath: string, fromIndex: number, toIndex: number) => {
    const prefix = `${basePath}.`;
    const candidates = Array.from(ctx.pathIndex.get(basePath)?.keys() ?? []);
    const computeNewIndex = (index: number): number => {
      if (index === fromIndex) return toIndex;
      if (fromIndex < toIndex && index > fromIndex && index <= toIndex) return index - 1;
      if (fromIndex > toIndex && index >= toIndex && index < fromIndex) return index + 1;
      return index;
    };
    // Two-phase, mirroring shiftStateIndices (Task 10): a sliding-window arrayMove
    // rename is a permutation over the affected indices, so a destination key for
    // one source can equal the source key of another rename processed later in the
    // SAME candidates iteration (Map order is insertion order, not ascending numeric
    // order). Interleaving delete-and-write in one pass over `candidates` risks a
    // later `delete updated[key]` wiping out a value an earlier iteration already
    // wrote to that same key as its rename target. Phase 1 computes every rename
    // against the pristine `stateMap` (never mutated mid-loop); phase 2 deletes all
    // affected source keys, then writes all renamed ctx.values - deletes-before-writes
    // guarantees a write can never be clobbered by a later delete of the same key.
    const shiftMap = (stateMap: Record<string, any>) => {
      const renames: Array<[string, string, any]> = [];
      for (const key of candidates) {
        if (!(key in stateMap)) continue;
        if (!key.startsWith(prefix)) continue;
        const remaining = key.substring(prefix.length);
        const match = remaining.match(/^(\d+)(.*)$/);
        if (!match) continue;
        const index = parseInt(match[1], 10);
        const tail = match[2];
        const newIndex = computeNewIndex(index);
        if (newIndex === index) continue; // untouched by this move, leave as-is
        renames.push([key, `${prefix}${newIndex}${tail}`, stateMap[key]]);
      }
      for (const [oldKey] of renames) {
        delete stateMap[oldKey];
        ctx.unindexKey(oldKey);
      }
      for (const [, newKey, value] of renames) {
        stateMap[newKey] = value;
        ctx.indexKey(newKey);
      }
    };
    ctx.batch(() => {
      shiftMap(ctx.errors);
      shiftMap(ctx.touched);
      shiftMap(ctx.dirty);
      shiftMap(ctx.wasSet);
      // Re-key ctx.validatedPaths (Set) with the same sliding-window logic and the same
      // delete-all-then-write-all discipline as shiftMap above.
      const validatedRenames: Array<[string, string]> = [];
      for (const key of candidates) {
        if (!ctx.validatedPaths.has(key)) continue;
        if (!key.startsWith(prefix)) continue;
        const remaining = key.substring(prefix.length);
        const match = remaining.match(/^(\d+)(.*)$/);
        if (!match) continue;
        const index = parseInt(match[1], 10);
        const tail = match[2];
        const newIndex = computeNewIndex(index);
        if (newIndex === index) continue;
        validatedRenames.push([key, `${prefix}${newIndex}${tail}`]);
      }
      for (const [oldKey] of validatedRenames) {
        ctx.validatedPaths.delete(oldKey);
        ctx.unindexKey(oldKey);
      }
      for (const [, newKey] of validatedRenames) {
        ctx.validatedPaths.add(newKey);
        ctx.indexKey(newKey);
      }
    });
  };

  const isDirty = (): boolean => Object.keys(ctx.wasSet).length > 0;

  const isFieldValid = (path: string): boolean | null => {
    if (!ctx.validatedPaths.has(path)) return null;
    return !ctx.errors[path];
  };

  const isFieldDirty = (path: string): boolean => {
    if (ctx.wasSet[path]) return true;
    const prefix = `${path}.`;
    return Object.keys(ctx.wasSet).some((k) => k.startsWith(prefix));
  };

  const subscribeToPath = (path: Path<T> | '*' | string, fn: PathSubscriber) => {
    let pathSet = ctx.pathSubscribers.get(path);
    if (!pathSet) {
      pathSet = new Set();
      ctx.pathSubscribers.set(path, pathSet);
      ctx.indexKey(path);
    }
    pathSet.add(fn);
    const currentVal = path === '*' ? ctx.values : getNestedValue(ctx.values, path);
    try {
      fn(deepClone(currentVal), {
        error: ctx.errors[path],
        touched: ctx.touched[path],
        dirty: ctx.dirty[path],
      });
    } catch (err) {
      console.error('[NeutroForm] path subscriber threw on initial call:', err);
    }
    return () => {
      const listeners = ctx.pathSubscribers.get(path);
      if (listeners) {
        listeners.delete(fn);
        if (listeners.size === 0) {
          ctx.pathSubscribers.delete(path);
          ctx.unindexKey(path);
        }
      }
    };
  };

  const watch = (
    paths: Path<T> | string | Array<Path<T> | string>,
    callback: (values: Record<string, unknown>) => void
  ): (() => void) => {
    const pathArray = (Array.isArray(paths) ? paths : [paths]) as string[];
    const uniquePaths = [...new Set(pathArray)];

    if (uniquePaths.length === 0) return () => {};

    const fire = () => {
      const snapshot: Record<string, unknown> = {};
      uniquePaths.forEach((p) => {
        snapshot[p] = deepClone(getNestedValue(ctx.values, p));
      });
      try {
        callback(snapshot);
      } catch (err) {
        console.error('[NeutroForm] watch callback threw:', err);
      }
    };

    const teardowns: Array<() => void> = [];
    let tornDown = false;

    uniquePaths.forEach((p) => {
      let firstCall = true;
      const pathSubscriberFn: PathSubscriber = () => {
        if (firstCall) {
          firstCall = false;
          return;
        }
        fire();
      };
      const unsub = ctx.subscribeToPath(p as Path<T>, pathSubscriberFn);
      teardowns.push(unsub);
    });

    return () => {
      if (tornDown) return;
      tornDown = true;
      for (const u of teardowns) u();
    };
  };

  const submit = async (
    onSubmitCallback: (payload: Partial<T>) => void | Promise<void>
  ): Promise<boolean> => {
    ctx.dispatchAction({ type: 'SUBMIT' });
    if (ctx.isSubmitting) return false;

    ctx.isSubmitting = true;
    ctx.submissionAttempts++;
    extractAllPaths(ctx.values).forEach((p) => {
      const wasTouched = p in ctx.touched;
      ctx.touched[p] = true;
      if (!wasTouched) ctx.indexKey(p);
    });
    ctx.notify();

    try {
      const isValid = await ctx.runValidation();
      if (!isValid) {
        ctx.isSubmitting = false;
        ctx.notify();
        return false;
      }

      const callbackPayload = _getPayload(
        ctx.values,
        ctx.connectionRegistry,
        ctx.connectedPaths,
        ctx.persistedPaths
      );
      // Strip transient computed fields from the payload (consistent with submit() behavior).
      for (const path of ctx.transientPaths) {
        const parts = path.split('.');
        let obj: any = callbackPayload;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!obj || typeof obj !== 'object') {
            obj = null;
            break;
          }
          obj = obj[parts[i]];
        }
        if (obj && typeof obj === 'object') {
          delete obj[parts[parts.length - 1]];
        }
      }
      const valuesSnapshot = deepClone(ctx.values) as Partial<T>;
      for (const path of ctx.transientPaths) {
        const parts = path.split('.');
        let obj: any = valuesSnapshot;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!obj || typeof obj !== 'object') {
            obj = null;
            break;
          }
          obj = obj[parts[i]];
        }
        if (obj && typeof obj === 'object') {
          delete obj[parts[parts.length - 1]];
        }
      }

      try {
        await onSubmitCallback(callbackPayload);
        ctx.lastSubmittedValues = valuesSnapshot;
        try {
          await ctx.config.onSubmitSuccess?.(valuesSnapshot);
        } catch (hookErr) {
          console.error('[NeutroForm] onSubmitSuccess threw:', hookErr);
        }
        return true;
      } catch (submitErr) {
        if (ctx.config.onSubmitError) {
          try {
            await ctx.config.onSubmitError(submitErr, valuesSnapshot);
          } catch (hookErr) {
            console.error('[NeutroForm] onSubmitError threw:', hookErr);
          }
          throw submitErr;
        }
        console.error('[NeutroForm Submit Error]: ', submitErr);
        return false;
      }
    } finally {
      ctx.isSubmitting = false;
      ctx.notify();
    }
  };

  const handleSubmit = (
    onSubmitCallback: (payload: Partial<T>) => void | Promise<void>,
    onInvalidCallback?: (errors: Record<string, string>) => void
  ) => {
    return async (e?: Event) => {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      const isValid = await submit(onSubmitCallback);
      if (!isValid && onInvalidCallback) {
        onInvalidCallback({ ...ctx.errors });
      }
    };
  };

  const setErrors = (incoming: Partial<Record<string, string>>): void => {
    if (!incoming) return;
    const paths = Object.keys(incoming);
    if (paths.length === 0) return;
    for (const p of paths) {
      if (DANGEROUS_PATH_KEYS.has(p)) continue;
      const val = incoming[p];
      if (val !== undefined) {
        const hadError = p in ctx.errors;
        ctx.errors[p] = val;
        if (!hadError) ctx.indexKey(p);
      }
    }
    for (const p of paths) {
      const wasTouched = p in ctx.touched;
      ctx.touched[p] = true;
      if (!wasTouched) ctx.indexKey(p);
    }
    ctx.batch(() => {
      for (const p of paths) ctx.notify(p);
    });
    ctx.dispatchAction({ type: 'SET_ERRORS', errors: incoming as Record<string, string> });
  };

  const clearErrors = (): void => {
    const paths = Object.keys(ctx.errors);
    if (paths.length === 0) return;
    for (const p of paths) {
      delete ctx.errors[p];
      ctx.unindexKey(p);
    }
    ctx.batch(() => {
      for (const p of paths) ctx.notify(p);
    });
    ctx.dispatchAction({ type: 'CLEAR_ERRORS' });
  };

  // Task 8 deviation: the computed-fields seed pass used to run here (before
  // `ctx` exists), reading the bare `values`/`runComputedPass` closure
  // identifiers. Computed fields are now installed via `attachComputedFields`
  // (packages/core/src/features/computed-fields.ts), which requires a fully
  // constructed `ctx` — its real `ctx.runComputedPass` is wired in after the
  // `ctx` object literal below, and the seed call moved there too (see the
  // `attachComputedFields(ctx, config)` + `ctx.runComputedPass()` pair right
  // after the literal). One consequence: the dev path trie below is now built
  // from *unseeded* `values` instead of seeded ones as before. This only
  // matters if a computed fn writes to a path that does not already exist in
  // `initialValues` (an unsupported/undocumented pattern — every computed
  // path in the test suite and docs pre-exists in initialValues with a
  // placeholder value), so the trie's key structure is unaffected in every
  // realistic case; flagging this ordering change here for visibility.
  const __pathValidation = config.pathValidation ?? 'dev';
  const __shouldBuildTrie =
    __pathValidation !== 'off' && !(__pathValidation === 'dev' && __isProdLocal);
  // Runtime path validation: builds a trie from initialValues for unknown-path detection.
  const __devPathTrie = __shouldBuildTrie ? buildPathTrie(values) : null;

  const __warnUnknownPath = (path: string): void => {
    if (!__devPathTrie) return;
    if (!isKnownPath(__devPathTrie, path)) {
      console.warn(`[NeutroForm] Unknown path: "${path}". Check your initialValues schema.`);
    }
  };

  // Deviation from the Task 6 brief: the brief's Step 1 places this declaration
  // immediately after the ctx.transientPaths loop (~line 1135), but nearly every
  // function referenced below (ctx.runValidation, ctx.dispatchAction, ctx.notify, ctx.batch,
  // ctx.subscribe, ctx.indexKey, ctx.unindexKey, ctx.getState, ctx.resolveFieldMode, ctx.setFieldValue,
  // ctx.subscribeToPath, ctx.__warnUnknownPath, ctx.isFieldRequired) is declared LATER in
  // this closure body — a const there would reference them before their own
  // `const` declarations execute (TDZ ReferenceError at every createForm()
  // call). ctx must be declared after all of its referenced consts exist, so
  // it is placed here instead, immediately before the first hoisted method
  // that will read from it in Task 8+ and immediately before `return {...}`.
  // Data fields below are inlined directly (not shorthand aliases to a bare
  // `let`/`const` of the same name) and their original standalone declarations
  // deleted — per Task 6 Step 3, this forces tsc to flag any code that still
  // reads/writes the OLD bare name as an undefined-identifier error, since a
  // silently-surviving bare copy of a *reassigned* field (isSubmitting,
  // batchDepth, asyncEpoch, mutationObserver, persistenceUnsubscribe,
  // persistenceWriteTimer, lastSubmittedValues, etc.) would diverge from
  // ctx.X the moment either copy got reassigned independently. Functions
  // (runValidation, notify, batch, indexKey, …) and the four identifiers
  // documented below keep their standalone `const` — see the deviations
  // noted at their declarations for why they can't be inlined here.
  const ctx: FormEngineContext<T> = {
    values,
    initialValues,
    errors: {},
    touched: {},
    dirty: {},
    wasSet: {},
    validatedPaths: new Set<string>(),
    pathIndex: new Map<string, Map<string, number>>(),
    pathSubscribers: new Map<string, Set<PathSubscriber>>(),
    globalSubscribers: new Set<FormSubscriber<T>>(),
    connectionRegistry: new Map<string, WeakRef<HTMLElement>>(),
    connectedPaths: new Set<string>(),
    persistedPaths: new Set<string>(),
    mutationObserver: null,
    persistenceUnsubscribe: null,
    persistenceWriteTimer: null,
    batchDepth: 0,
    pendingPaths: new Set<string | undefined>(),
    pendingExactPaths: new Set<string>(),
    asyncEpoch: 0,
    activeAbortControllers: new Map<string, AbortController>(),
    isSubmitting: false,
    isValidating: false,
    hasValidated: false,
    isHydrating: false,
    submissionAttempts: 0,
    lastSubmittedValues: null,
    config,
    transientPaths: [], // populated by attachComputedFields, called right after this literal
    isComputedField: () => false, // no-op default; attachComputedFields installs the real override
    runComputedPass: () => [], // no-op default; attachComputedFields installs the real override
    hasComputedFields: () => false, // no-op default; attachComputedFields installs the real override
    onReset: () => {}, // no-op default; Task 8 (persistence extraction) installs the real override
    runValidation,
    dispatchAction,
    notify,
    notifyGlobalSubscribers,
    notifyPathSubscribers,
    batch,
    indexKey,
    unindexKey,
    getState,
    resolveFieldMode: (path: string, connectOverride?: ValidationMode): ValidationMode => {
      if (connectOverride) return connectOverride;
      if (ctx.config.validationMode) {
        if (typeof ctx.config.validationMode === 'string') return ctx.config.validationMode;
        const fieldMode = ctx.config.validationMode.fields?.[path];
        if (fieldMode) return fieldMode;
        if (ctx.config.validationMode.default) return ctx.config.validationMode.default;
      }
      return 'onTouched';
    },
    deepMerge: (base: any, override: any, seen = new WeakSet()): any => {
      if (override === null || override === undefined) return base;
      if (typeof override !== 'object' || Array.isArray(override)) return override;
      if (typeof base !== 'object' || base === null) return override;
      if (seen.has(override)) return base;
      seen.add(override);
      const result: any = { ...base };
      for (const key of Object.keys(override)) {
        if (DANGEROUS_PATH_KEYS.has(key)) continue; // prevent prototype pollution from adapter data
        result[key] = ctx.deepMerge(base[key], override[key], seen);
      }
      return result;
    },
    setFieldValue,
    subscribeToPath,
    __warnUnknownPath,
    isFieldRequired: () => false, // no-op default; attachDomBridge installs the real override
    subscribe,
  };

  // Wires the real isComputedField/runComputedPass/hasComputedFields/transientPaths
  // onto `ctx`, overriding the no-op defaults in the literal above. Must run
  // AFTER `ctx` is constructed (attachComputedFields mutates it in place) and
  // BEFORE the seed call directly below, or the seed would run against the
  // no-op `runComputedPass: () => []` default and silently fail to apply
  // computed fields to initial values.
  attachComputedFields(ctx, config);
  ctx.runComputedPass(); // seed computed values at init
  const { hydrate } = attachPersistence(ctx, config);
  const { connect, focus, focusFirstError, getAriaProps, getConnectedCount } = attachDomBridge(
    ctx,
    config
  );

  const subscribeToPathDynamic = (path: string, fn: (value: unknown) => void): (() => void) => {
    if (path == null || typeof path !== 'string') {
      if (!__isProdLocal)
        console.error('[NeutroForm] subscribeToPathDynamic requires a non-null string path.');
      return () => {};
    }
    if (path === '') {
      if (!__isProdLocal)
        console.warn('[NeutroForm] subscribeToPathDynamic called with empty path — ignoring.');
      return () => {};
    }
    ctx.__warnUnknownPath(path);
    if (!ctx.pathSubscribers.has(path)) {
      ctx.pathSubscribers.set(path, new Set());
      ctx.indexKey(path);
    }
    // PathSubscriber receives (value, fieldState) but fn only declares (value) — JS ignores extra args.
    const sub = fn as PathSubscriber;
    ctx.pathSubscribers.get(path)?.add(sub);
    // Fire immediately with deep-cloned value (consistent with ctx.subscribeToPath)
    try {
      fn(deepClone(getNestedValue(ctx.values, path)));
    } catch (err) {
      console.error('[NeutroForm] subscribeToPathDynamic subscriber threw on initial call:', err);
    }
    return () => {
      const listeners = ctx.pathSubscribers.get(path);
      if (listeners) {
        listeners.delete(sub);
        if (listeners.size === 0) {
          ctx.pathSubscribers.delete(path); // prune empty Set
          ctx.unindexKey(path);
        }
      }
    };
  };

  const get = (path: Path<T> | string | string[]) => {
    const targetPath = Array.isArray(path) ? path.join('.') : path;
    ctx.__warnUnknownPath(targetPath);
    return getNestedValue(ctx.values, targetPath);
  };

  const set = ((path: any, val: any, options?: SetOptions) => {
    const targetPath = Array.isArray(path) ? path.join('.') : path;
    ctx.__warnUnknownPath(targetPath);
    ctx.setFieldValue(targetPath, val, options);
    ctx.dispatchAction({ type: 'SET', path: targetPath, value: val, options });
  }) as FormInstance<T>['set'];

  const validate = (scopePaths?: Array<Path<T> | string[]>) => {
    const targets = scopePaths?.map((p) => (Array.isArray(p) ? p.join('.') : p));
    ctx.dispatchAction({ type: 'VALIDATE', paths: targets });
    return ctx.runValidation(targets);
  };

  const getPayload = () => {
    const payload = _getPayload(
      ctx.values,
      ctx.connectionRegistry,
      ctx.connectedPaths,
      ctx.persistedPaths
    );
    // Strip transient computed fields from the payload (consistent with submit() behavior).
    for (const path of ctx.transientPaths) {
      const parts = path.split('.');
      let obj: any = payload;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!obj || typeof obj !== 'object') {
          obj = null;
          break;
        }
        obj = obj[parts[i]];
      }
      if (obj && typeof obj === 'object') {
        delete obj[parts[parts.length - 1]];
      }
    }
    return payload;
  };

  const setDynamic = (path: string, value: unknown, options?: SetOptions): void => {
    if (path == null || typeof path !== 'string') {
      if (!__isProdLocal) console.error('[NeutroForm] setDynamic requires a non-null string path.');
      return;
    }
    if (path === '') {
      if (!__isProdLocal)
        console.warn('[NeutroForm] setDynamic called with empty path — ignoring.');
      return;
    }
    if (ctx.isComputedField(path)) {
      if (!__isProdLocal) {
        console.warn(`[NeutroForm] "${path}" is a computed field — setDynamic() is a no-op.`);
      }
      return;
    }
    ctx.__warnUnknownPath(path);
    ctx.setFieldValue(path, value, options);
    ctx.dispatchAction({ type: 'SET', path, value, options });
  };

  const getDynamic = <V = unknown>(path: string): V => {
    if (path == null || typeof path !== 'string') {
      if (!__isProdLocal) console.error('[NeutroForm] getDynamic requires a non-null string path.');
      return undefined as V;
    }
    if (path === '') {
      if (!__isProdLocal)
        console.warn('[NeutroForm] getDynamic called with empty path — returning undefined.');
      return undefined as V;
    }
    ctx.__warnUnknownPath(path);
    return getNestedValue(ctx.values, path) as V;
  };

  const getFieldMode = (path: string) => ctx.resolveFieldMode(path);

  // Distinct name from the internal `ctx.batch` primitive (see naming collision warning
  // in the Task 6 brief) — this is the public FormInstance method, wrapping the
  // internal ctx.batch() with BATCH_START/BATCH_END action dispatches.
  const batchPublic = (fn: () => void) => {
    ctx.dispatchAction({ type: 'BATCH_START' });
    try {
      ctx.batch(fn);
    } finally {
      ctx.dispatchAction({ type: 'BATCH_END' });
    }
  };

  const arrayAppend = ((path: any, item: any) => {
    const targetPath = Array.isArray(path) ? path.join('.') : path;
    const arr = getNestedValue(ctx.values, targetPath) || [];
    if (!Array.isArray(arr)) return;
    ctx.setFieldValue(targetPath, [...arr, item]);
    ctx.dispatchAction({ type: 'ARRAY_APPEND', path: targetPath, item });
  }) as FormInstance<T>['arrayAppend'];

  const arrayInsert = ((path: any, index: number, item: any) => {
    const targetPath = Array.isArray(path) ? path.join('.') : path;
    const arr = getNestedValue(ctx.values, targetPath) || [];
    if (!Array.isArray(arr) || index < 0 || index > arr.length) return;
    const wasAlreadySet = targetPath in ctx.wasSet;
    ctx.wasSet[targetPath] = true;
    if (!wasAlreadySet) ctx.indexKey(targetPath);
    const copy = [...arr];
    copy.splice(index, 0, item);
    ctx.batch(() => {
      setNestedValue(ctx.values, targetPath, copy);
      const shifted = shiftStateIndices(targetPath, index, 'insert', index);
      for (const k of shifted) ctx.notify(k);
      ctx.notify(`${targetPath}.${index}`);
      // Belt-and-braces: also reach an array-root subscriber explicitly via the
      // exact-only path (skips the descendant scan, so unaffected siblings aren't
      // re-notified). In practice ctx.notify(`${targetPath}.${index}`) above already walks
      // 'targetPath' as an ancestor, but this makes the root-subscriber guarantee
      // independent of that incidental path shape — see arrayRemove for the case where
      // it isn't incidental.
      ctx.notify(targetPath, { exact: true });
    });
    ctx.runValidation([targetPath]);
    ctx.dispatchAction({ type: 'ARRAY_INSERT', path: targetPath, index, item });
  }) as FormInstance<T>['arrayInsert'];

  const arrayRemove = (path: Path<T> | string | string[], index: number) => {
    const targetPath = Array.isArray(path) ? path.join('.') : path;
    const arr = getNestedValue(ctx.values, targetPath) || [];
    if (!Array.isArray(arr) || index < 0 || index >= arr.length) return;
    const wasAlreadySet = targetPath in ctx.wasSet;
    ctx.wasSet[targetPath] = true;
    if (!wasAlreadySet) ctx.indexKey(targetPath);
    const copy = [...arr];
    copy.splice(index, 1);
    ctx.batch(() => {
      setNestedValue(ctx.values, targetPath, copy);
      const shifted = shiftStateIndices(targetPath, index, 'remove');
      for (const k of shifted) ctx.notify(k);
      // Always reach a subscriber registered on the array path itself (e.g.
      // ctx.subscribeToPath('items', cb)), regardless of whether anything shifted below
      // it. Uses the exact-only ctx.notify — NOT a plain ctx.notify(targetPath) — so it does
      // NOT trigger ctx.notifyPathSubscribers' descendant scan, which would re-fire every
      // unaffected sibling item's per-field subscriber under the array root.
      ctx.notify(targetPath, { exact: true });
    });
    ctx.runValidation([targetPath]);
    ctx.dispatchAction({ type: 'ARRAY_REMOVE', path: targetPath, index });
  };

  const arrayMove = (path: Path<T> | string | string[], fromIndex: number, toIndex: number) => {
    const targetPath = Array.isArray(path) ? path.join('.') : path;
    const arr = getNestedValue(ctx.values, targetPath) || [];
    if (
      !Array.isArray(arr) ||
      fromIndex < 0 ||
      fromIndex >= arr.length ||
      toIndex < 0 ||
      toIndex >= arr.length
    )
      return;
    const wasAlreadySet = targetPath in ctx.wasSet;
    ctx.wasSet[targetPath] = true;
    if (!wasAlreadySet) ctx.indexKey(targetPath);
    const copy = [...arr];
    const [movedItem] = copy.splice(fromIndex, 1);
    copy.splice(toIndex, 0, movedItem);
    ctx.batch(() => {
      setNestedValue(ctx.values, targetPath, copy);
      rekeyArrayState(targetPath, fromIndex, toIndex);
      const start = Math.min(fromIndex, toIndex);
      const end = Math.max(fromIndex, toIndex);
      for (let i = start; i <= end; i++) ctx.notify(`${targetPath}.${i}`);
    });
    ctx.runValidation([targetPath]);
    ctx.dispatchAction({ type: 'ARRAY_MOVE', path: targetPath, from: fromIndex, to: toIndex });
  };

  const arraySwap = (path: Path<T> | string | string[], indexA: number, indexB: number) => {
    const targetPath = Array.isArray(path) ? path.join('.') : path;
    const arr = getNestedValue(ctx.values, targetPath) || [];
    if (
      !Array.isArray(arr) ||
      indexA < 0 ||
      indexA >= arr.length ||
      indexB < 0 ||
      indexB >= arr.length
    )
      return;
    const wasAlreadySet = targetPath in ctx.wasSet;
    ctx.wasSet[targetPath] = true;
    if (!wasAlreadySet) ctx.indexKey(targetPath);
    const copy = [...arr];
    [copy[indexA], copy[indexB]] = [copy[indexB], copy[indexA]];
    ctx.batch(() => {
      setNestedValue(ctx.values, targetPath, copy);
      const candidates = Array.from(ctx.pathIndex.get(targetPath)?.keys() ?? []);
      const swapKeys = (stateMap: Record<string, any>) => {
        const prefix = `${targetPath}.`;
        const prefixA = `${prefix}${indexA}`;
        const prefixB = `${prefix}${indexB}`;
        // Two-phase, same discipline as shiftStateIndices/rekeyArrayState: capture
        // every write's value (read from the pristine stateMap) and every key slated
        // for deletion FIRST, then apply all deletes before any write. Interleaving
        // reads/writes/deletes directly on stateMap in a single pass would risk a
        // later key's read of e.g. stateMap[bKey] observing an earlier iteration's
        // write instead of the original value.
        const writes: Array<[string, any]> = [];
        const toDelete: string[] = [];
        for (const key of candidates) {
          if (!(key in stateMap)) continue;
          // Use exact-or-dot-child match to avoid "items.1" matching "items.10", "items.11", etc.
          const matchesA = key === prefixA || key.startsWith(`${prefixA}.`);
          const matchesB = key === prefixB || key.startsWith(`${prefixB}.`);
          if (matchesA) {
            const tail = key.substring(prefixA.length);
            const bKey = `${prefixB}${tail}`;
            writes.push([bKey, stateMap[key]]);
            if (stateMap[bKey] === undefined) {
              // bKey had no prior state here, so it's genuinely gaining a new
              // claim at this key while `key` (A-side) loses its claim.
              ctx.indexKey(bKey);
              toDelete.push(key);
              ctx.unindexKey(key);
            }
            // else: bKey already held state here — the key identity stays put
            // (only the ctx.values swap), so its existing claim is unchanged.
          } else if (matchesB) {
            const tail = key.substring(prefixB.length);
            const aKey = `${prefixA}${tail}`;
            writes.push([aKey, stateMap[key]]);
            if (stateMap[aKey] === undefined) {
              ctx.indexKey(aKey);
              toDelete.push(key);
              ctx.unindexKey(key);
            }
          }
        }
        for (const key of toDelete) delete stateMap[key];
        for (const [key, value] of writes) stateMap[key] = value;
      };
      swapKeys(ctx.errors);
      swapKeys(ctx.touched);
      swapKeys(ctx.dirty);
      swapKeys(ctx.wasSet);
      // Swap ctx.validatedPaths entries for indexA ↔ indexB.
      // Two-phase, mirroring shiftStateIndices/rekeyArrayState above: computing
      // renames against the pristine `candidates` snapshot and only deleting all
      // source keys before adding any rename target avoids a later `.add(newKey)`
      // being re-matched by `ctx.validatedPaths.has(key)` later in this SAME pass
      // (Set/Map iteration order is insertion order, not guaranteed to visit both
      // members of a swap pair "atomically") — which would silently swap it AGAIN.
      const prefixA = `${targetPath}.${indexA}`;
      const prefixB = `${targetPath}.${indexB}`;
      const validatedRenames: Array<[string, string]> = [];
      for (const key of candidates) {
        if (!ctx.validatedPaths.has(key)) continue;
        const matchesA = key === prefixA || key.startsWith(`${prefixA}.`);
        const matchesB = key === prefixB || key.startsWith(`${prefixB}.`);
        if (matchesA) {
          const tail = key.substring(prefixA.length);
          validatedRenames.push([key, `${prefixB}${tail}`]);
        } else if (matchesB) {
          const tail = key.substring(prefixB.length);
          validatedRenames.push([key, `${prefixA}${tail}`]);
        }
      }
      for (const [oldKey] of validatedRenames) {
        ctx.validatedPaths.delete(oldKey);
        ctx.unindexKey(oldKey);
      }
      for (const [, newKey] of validatedRenames) {
        ctx.validatedPaths.add(newKey);
        ctx.indexKey(newKey);
      }
      ctx.notify(`${targetPath}.${indexA}`);
      ctx.notify(`${targetPath}.${indexB}`);
    });
    ctx.runValidation([targetPath]);
    ctx.dispatchAction({ type: 'ARRAY_SWAP', path: targetPath, i: indexA, j: indexB });
  };

  const reset = (newValues?: T) => {
    ctx.onReset(newValues);
    ctx.batch(() => {
      if (newValues) {
        const newInitial = deepClone(newValues);
        for (const key of Object.keys(ctx.initialValues)) delete (ctx.initialValues as any)[key];
        Object.assign(ctx.initialValues, newInitial);
      }
      const newVals = deepClone(ctx.initialValues);
      for (const key of Object.keys(ctx.values)) delete (ctx.values as any)[key];
      Object.assign(ctx.values, newVals);
      ctx.runComputedPass(); // re-derive computed fields from reset state
      for (const k of Object.keys(ctx.errors)) {
        ctx.unindexKey(k);
        delete ctx.errors[k];
      }
      for (const k of Object.keys(ctx.touched)) {
        ctx.unindexKey(k);
        delete ctx.touched[k];
      }
      for (const k of Object.keys(ctx.dirty)) {
        ctx.unindexKey(k);
        delete ctx.dirty[k];
      }
      for (const k of Object.keys(ctx.wasSet)) {
        ctx.unindexKey(k);
        delete ctx.wasSet[k];
      }
      for (const k of ctx.validatedPaths) ctx.unindexKey(k);
      ctx.validatedPaths.clear();
      ctx.isSubmitting = false;
      ctx.isValidating = false;
      ctx.hasValidated = false;
      ctx.submissionAttempts = 0;
      ctx.lastSubmittedValues = null;
    });
    ctx.connectionRegistry.forEach((ref, path) => {
      const el = ref.deref();
      if (!el || !('value' in el)) return;
      const fresh = getNestedValue(ctx.values, path);
      if (el instanceof HTMLInputElement && el.type === 'checkbox') {
        el.checked = el.hasAttribute('value')
          ? Array.isArray(fresh) && fresh.includes(el.value)
          : !!fresh;
      } else if (el instanceof HTMLInputElement && el.type === 'radio') {
        el.checked = el.value === fresh;
      } else if (el instanceof HTMLSelectElement && el.multiple) {
        const arr = Array.isArray(fresh) ? fresh : [];
        for (const opt of el.options) opt.selected = arr.includes(opt.value);
      } else if (el instanceof HTMLInputElement && el.type === 'date' && fresh instanceof Date) {
        el.value = fresh.toISOString().substring(0, 10);
      } else if (
        el instanceof HTMLInputElement &&
        el.type === 'datetime-local' &&
        fresh instanceof Date
      ) {
        el.value = fresh.toISOString().substring(0, 16);
      } else {
        (el as any).value = fresh !== undefined ? fresh : '';
      }
    });
    // Notify all subscribers with reset state.
    if (ctx.globalSubscribers.size > 0) {
      ctx.notifyGlobalSubscribers(ctx.getState());
    }
    ctx.notifyPathSubscribers([...ctx.pathSubscribers.keys()].filter((p) => p !== '*'));
    const wildcardListeners = ctx.pathSubscribers.get('*');
    if (wildcardListeners) {
      const allValues = deepClone(ctx.values);
      for (const cb of wildcardListeners) {
        try {
          cb(allValues, { error: undefined, touched: undefined, dirty: undefined });
        } catch (err) {
          console.error('[NeutroForm] path subscriber threw:', err);
        }
      }
    }
    ctx.dispatchAction({ type: 'RESET', newValues });
  };

  const resetField = (path: Path<T>, options?: ResetFieldOptions): void => {
    const targetPath = Array.isArray(path)
      ? (path as unknown as string[]).join('.')
      : (path as string);
    const initialVal = getNestedValue(ctx.initialValues, targetPath);
    const freshVal = deepClone(initialVal);

    ctx.batch(() => {
      setNestedValue(ctx.values, targetPath, freshVal);

      if (!options?.keepError) {
        for (const k of Object.keys(ctx.errors)) {
          if (k === targetPath || k.startsWith(`${targetPath}.`)) {
            delete ctx.errors[k];
            ctx.unindexKey(k);
          }
        }
      }
      if (!options?.keepTouched) {
        for (const k of Object.keys(ctx.touched)) {
          if (k === targetPath || k.startsWith(`${targetPath}.`)) {
            delete ctx.touched[k];
            ctx.unindexKey(k);
          }
        }
      }
      if (!options?.keepDirty) {
        for (const k of Object.keys(ctx.dirty)) {
          if (k === targetPath || k.startsWith(`${targetPath}.`)) {
            delete ctx.dirty[k];
            ctx.unindexKey(k);
          }
        }
        for (const k of Object.keys(ctx.wasSet)) {
          if (k === targetPath || k.startsWith(`${targetPath}.`)) {
            delete ctx.wasSet[k];
            ctx.unindexKey(k);
          }
        }
      }
      // Always clear ctx.validatedPaths for the target path and its children.
      const toDelete = [...ctx.validatedPaths].filter(
        (k) => k === targetPath || k.startsWith(`${targetPath}.`)
      );
      for (const k of toDelete) {
        ctx.validatedPaths.delete(k);
        ctx.unindexKey(k);
      }
    });

    // DOM sync: update the connected element if one exists for this path
    const ref = ctx.connectionRegistry.get(targetPath);
    if (ref) {
      const el = ref.deref();
      if (el) {
        if (el instanceof HTMLInputElement && el.type === 'checkbox') {
          el.checked = el.hasAttribute('value')
            ? Array.isArray(freshVal) && freshVal.includes(el.value)
            : !!freshVal;
        } else if (el instanceof HTMLInputElement && el.type === 'radio') {
          el.checked = el.value === freshVal;
        } else if (el instanceof HTMLSelectElement && el.multiple) {
          const arr = Array.isArray(freshVal) ? freshVal : [];
          for (const opt of el.options) opt.selected = arr.includes(opt.value);
        } else if (
          el instanceof HTMLInputElement &&
          el.type === 'date' &&
          freshVal instanceof Date
        ) {
          el.value = freshVal.toISOString().substring(0, 10);
        } else if (
          el instanceof HTMLInputElement &&
          el.type === 'datetime-local' &&
          freshVal instanceof Date
        ) {
          el.value = freshVal.toISOString().substring(0, 16);
        } else if ('value' in el) {
          (el as any).value = freshVal !== undefined ? freshVal : '';
        }
      }
    }

    ctx.notify(targetPath);
    ctx.dispatchAction({ type: 'RESET_FIELD', path: targetPath });
  };

  const _subscribeToActions = (fn: (action: FormAction, state: FormState<T>) => void) => {
    actionListeners.add(fn);
    return () => {
      actionListeners.delete(fn);
    };
  };

  const _debugPathIndex = () => {
    const snapshot = new Map<string, Set<string>>();
    for (const [prefix, counts] of ctx.pathIndex) {
      snapshot.set(prefix, new Set(counts.keys()));
    }
    return snapshot;
  };
  const _debugIndexKey = (key: string) => ctx.indexKey(key);
  const _debugUnindexKey = (key: string) => ctx.unindexKey(key);
  const _debugRawState = () => ({
    errors: { ...ctx.errors },
    touched: { ...ctx.touched },
    dirty: { ...ctx.dirty },
    wasSet: { ...ctx.wasSet },
    validatedPaths: [...ctx.validatedPaths],
    pathSubscriberKeys: [...ctx.pathSubscribers.keys()],
  });

  const destroy = () => {
    for (const ctrl of ctx.activeAbortControllers.values()) ctrl.abort();
    ctx.activeAbortControllers.clear();
    ctx.persistenceUnsubscribe?.();
    ctx.persistenceUnsubscribe = null;
    ctx.globalSubscribers.clear();
    for (const key of ctx.pathSubscribers.keys()) {
      if (key === '*') continue;
      ctx.unindexKey(key);
    }
    ctx.pathSubscribers.clear();
    actionListeners.clear();
    ctx.connectionRegistry.clear();
    ctx.connectedPaths.clear();
    ctx.persistedPaths.clear();
    if (ctx.mutationObserver) {
      ctx.mutationObserver.disconnect();
      ctx.mutationObserver = null;
    }
    if (ctx.persistenceWriteTimer !== null) {
      clearTimeout(ctx.persistenceWriteTimer);
      ctx.persistenceWriteTimer = null;
    }
  };

  return {
    subscribe,
    subscribeToPath,
    subscribeToPathDynamic,
    get,
    set,
    validate,
    connect,
    submit,
    handleSubmit,
    getState,
    getPayload,
    setDynamic,
    getDynamic,
    getAriaProps,
    batch: batchPublic,
    setErrors,
    clearErrors,
    getFieldMode,
    isDirty,
    isFieldDirty,
    isFieldValid,
    watch,
    arrayAppend,
    arrayInsert,
    arrayRemove,
    arrayMove,
    arraySwap,
    reset,
    resetField,
    hydrate,
    getConnectedCount,
    destroy,
    _subscribeToActions,
    _debugPathIndex,
    _debugIndexKey,
    _debugUnindexKey,
    _debugRawState,
    focus,
    focusFirstError,
  };
}
