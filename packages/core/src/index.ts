/**
 * @neutro/form-core
 * High-Performance, Zero-Dependency, Framework-Agnostic Reactive Form Engine.
 */

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

const DANGEROUS_PATH_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

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

const __isProduction = ((): boolean => {
  try {
    return (globalThis as any).process?.env?.NODE_ENV === 'production';
  } catch {
    return false;
  }
})();

// ---------------------------------------------------------------------------
// flattenComputedConfig
// ---------------------------------------------------------------------------

// Flattens a nested ComputedConfig into a flat Map<dot-path, {fn, transient}>.
// Leaf detection: a node is a leaf if it has a `fn` property that is a function.
// Any other object is treated as a nested config namespace.
function flattenComputedConfig<T>(
  node: Record<string, unknown>,
  map: Map<string, { fn: (values: T) => unknown; transient: boolean }>,
  prefix = '',
  visited = new WeakSet<object>()
): void {
  if (visited.has(node)) return; // guard against circular JS object references
  visited.add(node);
  for (const key of Object.keys(node)) {
    if (DANGEROUS_PATH_KEYS.has(key)) continue; // guard prototype pollution keys
    const val = node[key];
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof val === 'function') {
      // Bare function — user forgot { fn: ... } wrapper
      if (!__isProduction) {
        console.warn(
          `[NeutroForm] computed["${path}"] is a bare function — wrap it in { fn: ... }.`
        );
      }
      continue;
    }
    if (!val || typeof val !== 'object') continue;
    const v = val as Record<string, unknown>;
    if (typeof v.fn === 'function') {
      // Leaf: ComputedLeaf<TRoot, V> — { fn, transient? }
      map.set(path, { fn: v.fn as (values: T) => unknown, transient: Boolean(v.transient) });
    } else {
      // Nested namespace — recurse
      flattenComputedConfig<T>(v as Record<string, unknown>, map, path, visited);
    }
  }
}

// ---------------------------------------------------------------------------
// createForm
// ---------------------------------------------------------------------------

export function createForm<T extends object>(config: FormConfig<T>): FormInstance<T> {
  const deepMerge = (base: any, override: any, seen = new WeakSet()): any => {
    if (override === null || override === undefined) return base;
    if (typeof override !== 'object' || Array.isArray(override)) return override;
    if (typeof base !== 'object' || base === null) return override;
    if (seen.has(override)) return base;
    seen.add(override);
    const result: any = { ...base };
    for (const key of Object.keys(override)) {
      if (DANGEROUS_PATH_KEYS.has(key)) continue; // prevent prototype pollution from adapter data
      result[key] = deepMerge(base[key], override[key], seen);
    }
    return result;
  };

  let initialValues = deepClone(config.initialValues);
  let values = deepClone(initialValues);
  let errors: Record<string, string> = {};
  let touched: Record<string, boolean> = {};
  let dirty: Record<string, boolean> = {};
  let wasSet: Record<string, boolean> = {};
  const validatedPaths = new Set<string>();
  // Refcounted shadow index: maps every ancestor prefix of a tracked key (from
  // errors/touched/dirty/wasSet/validatedPaths/pathSubscribers) to a Map of
  // (full key -> number of those six structures currently holding that key).
  // Lets shiftStateIndices/rekeyArrayState/arraySwap look up "what state exists
  // under this array" in O(state under the array) instead of scanning all
  // tracked state. See docs/superpowers/specs/2026-07-03-shift-state-indices-prefix-index-design.md.
  const pathIndex = new Map<string, Map<string, number>>();
  let isSubmitting = false;
  let isValidating = false;
  let hasValidated = false;
  let isHydrating = false;
  let submissionAttempts = 0;
  let lastSubmittedValues: Partial<T> | null = null;
  let persistenceWriteTimer: ReturnType<typeof setTimeout> | null = null;
  let persistenceUnsubscribe: (() => void) | null = null;

  const globalSubscribers = new Set<FormSubscriber<T>>();
  const pathSubscribers = new Map<string, Set<PathSubscriber>>();
  const connectionRegistry = new Map<string, WeakRef<HTMLElement>>();
  const connectedPaths = new Set<string>();
  const persistedPaths = new Set<string>();

  // Bug #7: depth counter instead of boolean so nested batch() calls don't flush early.
  let batchDepth = 0;
  const pendingPaths = new Set<string | undefined>();
  // Paths queued via notify(path, { exact: true }) — see notifyPathSubscribers: these
  // still walk ancestors (so a subscriber on the path itself, or any ancestor, fires)
  // but skip the descendant scan, so sibling entries under the same parent are not
  // re-notified. Used by arrayRemove to reach an array-root subscriber without
  // re-triggering every unaffected item's per-field subscriber.
  const pendingExactPaths = new Set<string>();

  let asyncEpoch = 0;
  // Bug #8: no shared asyncDebounceTimer — each runValidation invocation manages its own.
  const activeAbortControllers = new Map<string, AbortController>();
  let mutationObserver: MutationObserver | null = null;

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

  // ---------------------------------------------------------------------------
  // Computed / Derived Fields (v0.4.0 stable API)
  // ---------------------------------------------------------------------------
  const computedMap = new Map<string, { fn: (values: T) => unknown; transient: boolean }>();
  flattenComputedConfig<T>((config.computed ?? {}) as Record<string, unknown>, computedMap);

  // Clamp computedPassLimit: must be a finite integer >= 1, max 50.
  // Guards against Infinity (infinite hang), 0/negative (computed fields never update), NaN.
  const computedPassLimit =
    typeof config.computedPassLimit === 'number' &&
    Number.isFinite(config.computedPassLimit) &&
    config.computedPassLimit >= 1
      ? Math.min(Math.floor(config.computedPassLimit), 50)
      : 5;

  // Precomputed list of computed paths marked as transient: true.
  // Used in submit() to strip transient fields from valuesSnapshot without scanning computedMap.
  const transientPaths: string[] = [];
  for (const [path, { transient }] of computedMap) {
    if (transient) transientPaths.push(path);
  }

  /**
   * Re-evaluates all computed fields against current `values`.
   * Runs up to `computedPassLimit` passes (default 5) to resolve chained
   * dependencies. Fields are updated in-place per pass, so forward-declared chains
   * (b before c when c depends on b) resolve in a single pass. Reverse-declared
   * chains need one extra pass — with the default limit of 5 any acyclic chain up
   * to 5 levels deep resolves regardless of declaration order.
   * Emits a console.warn if the fields never stabilize (circular dependency).
   * Returns an array of unique paths whose values changed.
   */
  const runComputedPass = (): string[] => {
    if (computedMap.size === 0) return [];
    const limit = computedPassLimit;
    const changedPathsSet = new Set<string>();
    let stabilized = false;
    for (let pass = 0; pass < limit; pass++) {
      let passChanged = false;
      for (const [path, { fn }] of computedMap) {
        let newVal: unknown;
        try {
          newVal = fn(values);
        } catch (err) {
          if (!__isProdLocal) {
            console.error(`[NeutroForm] computed fn for "${path}" threw an error:`, err);
          }
          continue;
        }
        if (!isDeepEqual(newVal, getNestedValue(values, path))) {
          setNestedValue(values, path, newVal);
          changedPathsSet.add(path);
          passChanged = true;
        }
      }
      if (!passChanged) {
        stabilized = true;
        break;
      }
    }
    // If the loop exhausted all passes without an early-exit, run one final check-only
    // pass (no updates) to distinguish genuine instability from "last pass happened to
    // do real work". A flat field with computedPassLimit: 1 is stable after 1 pass even
    // though the loop never saw a no-change pass.
    const stillChangingPaths: string[] = [];
    if (!stabilized) {
      for (const [path, { fn }] of computedMap) {
        try {
          if (!isDeepEqual(fn(values), getNestedValue(values, path))) {
            stillChangingPaths.push(path);
          }
        } catch {
          // ignore errors in check-only pass
        }
      }
      if (stillChangingPaths.length === 0) stabilized = true;
    }
    if (!stabilized) {
      console.warn(
        `[NeutroForm] Computed fields did not stabilize after ${limit} passes. ` +
          `Check for circular dependencies. Still changing: ${stillChangingPaths.join(', ')}`
      );
    }
    return [...changedPathsSet];
  };

  runComputedPass(); // seed computed values at init
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

  const getState = (): FormState<T> => ({
    values: deepClone(values),
    errors: { ...errors },
    touched: { ...touched },
    dirty: { ...dirty },
    isSubmitting,
    isValidating,
    isValid: hasValidated ? Object.keys(errors).length === 0 : null,
    submissionAttempts,
    lastSubmittedValues: lastSubmittedValues ? deepClone(lastSubmittedValues) : null,
  });

  const actionListeners = new Set<(action: FormAction, state: FormState<T>) => void>();
  const dispatchAction = (action: FormAction): void => {
    if (actionListeners.size === 0) return;
    const snapshot = getState();
    actionListeners.forEach((fn) => {
      try {
        fn(action, snapshot);
      } catch (err) {
        console.error('[NeutroForm] _subscribeToActions listener threw:', err);
      }
    });
  };

  const notifyGlobalSubscribers = (snapshot: FormState<T>) => {
    for (const fn of globalSubscribers) {
      try {
        fn(snapshot);
      } catch (err) {
        console.error('[NeutroForm] subscriber threw:', err);
      }
    }
  };

  // Shared path fan-out logic used by notify(), _flushNotifications(), and reset().
  //
  // Walks both directions from each mutated path: upward to ancestors (so a
  // subscriber on 'items' fires when 'items.0.v' changes) and downward to
  // registered descendants (so a subscriber on 'items.0.v' fires when 'items.0'
  // or 'items' is replaced wholesale). The descendant scan only runs when the
  // mutated value is itself an object/array — primitive leaf sets (the
  // set-get/subscriptions benchmark hot path) skip the O(n) descendant scan entirely.
  //
  // All paths-to-notify across the whole flush are collected into one Set before
  // firing, so a subscriber reachable via two different mutated paths in the same
  // batch (e.g. arrayRemove's shifted-key notify plus its whole-array notify)
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
      const currentVal = getNestedValue(values, mutatedPath);
      if (currentVal !== null && typeof currentVal === 'object') {
        const descendantPrefix = `${mutatedPath}.`;
        for (const registered of pathSubscribers.keys()) {
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
      const listeners = pathSubscribers.get(p);
      if (!listeners) continue;
      const val = p === '*' ? deepClone(values) : deepClone(getNestedValue(values, p));
      for (const cb of listeners) {
        try {
          cb(val, { error: errors[p], touched: touched[p], dirty: dirty[p] });
        } catch (err) {
          console.error('[NeutroForm] path subscriber threw:', err);
        }
      }
    }
  };

  // Called when a batch flushes: notifies global subscribers once, then replays each path.
  const _flushNotifications = (paths: Array<string | undefined>, exactPaths: string[] = []) => {
    if (globalSubscribers.size > 0) {
      notifyGlobalSubscribers(getState());
    }
    const unique = [...new Set(paths.filter((p): p is string => p !== undefined))];
    const uniqueExact = [...new Set(exactPaths)];
    notifyPathSubscribers(unique, uniqueExact);
  };

  // Bug #9: guard getState() behind globalSubscribers.size > 0.
  // Rule: notify(path) for field-data mutations; notify() with no arg for flag-only changes.
  // Pass { exact: true } to notify a subscriber registered on mutatedPath itself (and its
  // ancestors) WITHOUT the descendant scan — i.e. without re-notifying sibling entries
  // registered under the same path. See arrayRemove.
  const notify = (mutatedPath?: string, options?: { exact?: boolean }) => {
    const exact = options?.exact ?? false;
    if (batchDepth > 0) {
      if (exact && mutatedPath) {
        pendingExactPaths.add(mutatedPath);
      } else {
        pendingPaths.add(mutatedPath);
      }
      return;
    }
    if (globalSubscribers.size > 0) {
      notifyGlobalSubscribers(getState());
    }
    if (mutatedPath) {
      if (exact) notifyPathSubscribers([], [mutatedPath]);
      else notifyPathSubscribers([mutatedPath]);
    }
  };

  const batch = (fn: () => void) => {
    batchDepth++;
    try {
      fn();
    } finally {
      batchDepth--;
      if (batchDepth === 0 && (pendingPaths.size > 0 || pendingExactPaths.size > 0)) {
        const paths = [...pendingPaths];
        const exactPaths = [...pendingExactPaths];
        pendingPaths.clear();
        pendingExactPaths.clear();
        _flushNotifications(paths, exactPaths);
      }
    }
  };

  const subscribe = (fn: FormSubscriber<T>) => {
    globalSubscribers.add(fn);
    try {
      fn(getState());
    } catch (err) {
      console.error('[NeutroForm] subscriber threw on initial call:', err);
    }
    return () => {
      globalSubscribers.delete(fn);
    };
  };

  const runValidation = async (scopePaths?: string[]): Promise<boolean> => {
    if (!config.validator && !config.rules) {
      if (!scopePaths) {
        hasValidated = true;
        for (const p of extractAllPaths(values)) {
          if (!validatedPaths.has(p)) {
            validatedPaths.add(p);
            indexKey(p);
          }
        }
      } else {
        for (const path of scopePaths) {
          if (!validatedPaths.has(path)) {
            validatedPaths.add(path);
            indexKey(path);
          }
        }
      }
      return true;
    }
    isValidating = true;
    // isValidating is a global flag — only global subscribers need this notification.
    if (globalSubscribers.size > 0) {
      notifyGlobalSubscribers(getState());
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

    const activeEpoch = ++asyncEpoch;
    let abortController: AbortController | undefined;

    try {
      if (expandedScope) {
        for (const path of expandedScope) {
          activeAbortControllers.get(path)?.abort();
          activeAbortControllers.delete(path);
        }
      }
      abortController = new AbortController();
      if (expandedScope) {
        for (const path of expandedScope) activeAbortControllers.set(path, abortController);
      }

      // Built-in rules run synchronously first; custom validator errors override on conflict.
      const builtInErrors: Record<string, string> = config.rules
        ? applyBuiltInRules(
            values,
            config.rules as Record<string, BuiltInRule | BuiltInRule[]>,
            expandedScope
          )
        : {};

      if (config.validator) {
        // Bug #13: pass snapshot so mid-await mutations can't corrupt validation state.
        const valuesSnapshot = deepClone(values);
        const validationResult = config.validator(
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
                resolve(errors);
                return;
              }
              runValidator();
            } else {
              let localTimer: any;
              const onAbort = () => {
                clearTimeout(localTimer);
                resolve(errors);
              };
              abortController?.signal.addEventListener('abort', onAbort, { once: true });
              localTimer = setTimeout(() => {
                abortController?.signal.removeEventListener('abort', onAbort);
                if (abortController?.signal.aborted) {
                  resolve(errors);
                  return;
                }
                runValidator();
              }, asyncDebounceMs);
            }
          });

          if (activeEpoch === asyncEpoch && !abortController?.signal.aborted) {
            const combined = { ...builtInErrors, ...resolvedErrors };
            applyRecordDiff(
              errors,
              expandedScope ? mergeScopedErrors(errors, combined, expandedScope) : combined
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
            errors,
            expandedScope ? mergeScopedErrors(errors, combined, expandedScope) : combined
          );
        }
      } else {
        applyRecordDiff(
          errors,
          expandedScope ? mergeScopedErrors(errors, builtInErrors, expandedScope) : builtInErrors
        );
      }
    } finally {
      if (expandedScope) {
        for (const path of expandedScope) activeAbortControllers.delete(path);
      }
      isValidating = false;
      if (!expandedScope && activeEpoch === asyncEpoch) hasValidated = true;
      // Populate validatedPaths: for a scoped run reuse expandedScope; for a full run
      // walk current values. (extractAllPaths is not called for scoped runs.)
      if (expandedScope) {
        if (activeEpoch === asyncEpoch && !abortController?.signal.aborted) {
          for (const path of expandedScope) {
            if (!validatedPaths.has(path)) {
              validatedPaths.add(path);
              indexKey(path);
            }
          }
        }
      } else if (activeEpoch === asyncEpoch) {
        for (const p of extractAllPaths(values)) {
          if (!validatedPaths.has(p)) {
            validatedPaths.add(p);
            indexKey(p);
          }
        }
      }
      if (globalSubscribers.size > 0) {
        notifyGlobalSubscribers(getState());
      }
      // Notify path subscribers so they see updated error state.
      const pathsToNotify = expandedScope ?? [...pathSubscribers.keys()].filter((p) => p !== '*');
      notifyPathSubscribers(pathsToNotify);
    }

    return Object.keys(errors).length === 0;
  };

  const indexKey = (key: string) => {
    const segments = key.split('.');
    let prefix = segments[0];
    for (let i = 1; i < segments.length; i++) {
      let counts = pathIndex.get(prefix);
      if (!counts) {
        counts = new Map();
        pathIndex.set(prefix, counts);
      }
      counts.set(key, (counts.get(key) ?? 0) + 1);
      prefix = `${prefix}.${segments[i]}`;
    }
  };

  const unindexKey = (key: string) => {
    const segments = key.split('.');
    let prefix = segments[0];
    for (let i = 1; i < segments.length; i++) {
      const counts = pathIndex.get(prefix);
      if (counts) {
        const next = (counts.get(key) ?? 1) - 1;
        if (next <= 0) counts.delete(key);
        else counts.set(key, next);
        if (counts.size === 0) pathIndex.delete(prefix);
      }
      prefix = `${prefix}.${segments[i]}`;
    }
  };

  // In-place diff applier for `errors`, which runValidation updates via a computed
  // next-value map rather than mutating key-by-key. Clears keys absent from `next`,
  // assigns/updates keys present in `next`, keeping pathIndex in sync via
  // indexKey/unindexKey — without reassigning `target`'s identity.
  const applyRecordDiff = (target: Record<string, string>, next: Record<string, string>): void => {
    for (const key of Object.keys(target)) {
      if (!(key in next)) {
        delete target[key];
        unindexKey(key);
      }
    }
    for (const key of Object.keys(next)) {
      if (!(key in target)) indexKey(key);
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
    if (computedMap.has(path)) {
      if (!__isProdLocal) {
        console.warn(`[NeutroForm] "${path}" is a computed field — set() is a no-op.`);
      }
      return;
    }
    const wasAlreadySet = path in wasSet;
    wasSet[path] = true;
    if (!wasAlreadySet) indexKey(path);
    const currentVal = getNestedValue(values, path);
    if (isDeepEqual(currentVal, val)) return;
    batch(() => {
      setNestedValue(values, path, val);
      const initialVal = getNestedValue(initialValues, path);
      const dirtyAlreadySet = path in dirty;
      dirty[path] = !isDeepEqual(initialVal, val);
      if (!dirty[path]) {
        delete dirty[path];
        if (dirtyAlreadySet) unindexKey(path);
      } else if (!dirtyAlreadySet) {
        indexKey(path);
      }
      if (options.touch) {
        const touchedAlreadySet = path in touched;
        touched[path] = true;
        if (!touchedAlreadySet) indexKey(path);
      }
    });
    if (computedMap.size > 0) {
      if (batchDepth > 0) {
        // Inside an outer batch: run computed pass to keep values consistent,
        // but defer all notifications until the batch flushes.
        const changedComputedPaths = runComputedPass();
        pendingPaths.add(path);
        for (const cp of changedComputedPaths) pendingPaths.add(cp);
      } else {
        // Outside any batch: run the computed pass first, then notify path and computed
        // subscribers in one call. A single call means notifyPathSubscribers' dedup Set
        // covers both — a descendant subscriber under `path` (e.g. a computed field nested
        // inside an object-valued set() target) fires exactly once, with the post-computed
        // value, instead of once (stale, pre-computed) from a `[path]`-only call and again
        // (fresh) from a separate `changedComputedPaths` call.
        const changedComputedPaths = runComputedPass();
        notifyPathSubscribers([path, ...changedComputedPaths]);
        if (globalSubscribers.size > 0) {
          notifyGlobalSubscribers(getState());
        }
      }
    } else {
      notify(path);
    }
    if (options.validate === true) runValidation([path]);
  };

  const initMutationObserver = () => {
    if (mutationObserver || typeof window === 'undefined' || typeof document === 'undefined')
      return;
    mutationObserver = new MutationObserver((mutations) => {
      const clearedPaths: string[] = [];
      mutations.forEach((mutation) => {
        mutation.removedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          connectionRegistry.forEach((ref, path) => {
            const el = ref.deref();
            if (!el || node.contains(el)) {
              connectionRegistry.delete(path);
              connectedPaths.delete(path);
              if (!persistedPaths.has(path)) {
                delete errors[path];
                unindexKey(path);
                delete touched[path];
                unindexKey(path);
                delete dirty[path];
                unindexKey(path);
                clearedPaths.push(path);
              }
            }
          });
        });
      });
      if (clearedPaths.length > 0) {
        if (globalSubscribers.size > 0) {
          notifyGlobalSubscribers(getState());
        }
        notifyPathSubscribers(clearedPaths);
      }
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });
  };

  const shiftStateIndices = (
    basePath: string,
    fromIndex: number,
    action: 'remove' | 'insert',
    targetIndex?: number
  ): string[] => {
    const shiftedKeys: string[] = [];
    const candidates = Array.from(pathIndex.get(basePath)?.keys() ?? []);
    // Two-phase per map: compute every drop/rename against the ORIGINAL stateMap
    // first, then delete every affected candidate key, and only after all deletes
    // have landed write the renamed values back in. Doing delete-and-write in a
    // single interleaved pass (in `candidates` iteration order) is unsafe: e.g.
    // removing index 0 from a 5-item array renames index 1's key down to index 0's
    // key while ALSO needing to drop the original index-0 key — if the candidate
    // order processes the rename before the drop, the drop (keyed only by string,
    // not by "was this a rename target") silently wipes out the just-renamed value.
    const shiftMap = (stateMap: Record<string, any>) => {
      const updated: Record<string, any> = { ...stateMap };
      const prefix = `${basePath}.`;
      const renames: Array<[string, string]> = [];
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
            delete updated[key];
            unindexKey(key);
          } else if (index > fromIndex) {
            delete updated[key];
            unindexKey(key);
            renames.push([key, `${prefix}${index - 1}${tail}`]);
          }
        } else if (action === 'insert' && targetIndex !== undefined) {
          if (index >= targetIndex) {
            delete updated[key];
            unindexKey(key);
            renames.push([key, `${prefix}${index + 1}${tail}`]);
          }
        }
      }
      for (const [oldKey, newKey] of renames) {
        updated[newKey] = stateMap[oldKey];
        indexKey(newKey);
        shiftedKeys.push(newKey);
      }
      return updated;
    };
    batch(() => {
      errors = shiftMap(errors);
      touched = shiftMap(touched);
      dirty = shiftMap(dirty);
      wasSet = shiftMap(wasSet) as Record<string, boolean>;
      // Update validatedPaths for the structural change.
      // For insert: shift existing indices ≥ targetIndex up by 1 so tracking follows items.
      // For remove: drop the removed index, renumber survivors above it.
      const arrPrefix = `${basePath}.`;
      const validatedRenames: string[] = [];
      for (const key of candidates) {
        if (!validatedPaths.has(key)) continue;
        if (!key.startsWith(arrPrefix)) continue;
        const remaining = key.substring(arrPrefix.length);
        const match = remaining.match(/^(\d+)(.*)$/);
        if (!match) continue;
        const index = parseInt(match[1], 10);
        const tail = match[2];
        if (action === 'remove') {
          if (index === fromIndex) {
            validatedPaths.delete(key);
            unindexKey(key);
          } else if (index > fromIndex) {
            validatedPaths.delete(key);
            unindexKey(key);
            validatedRenames.push(`${arrPrefix}${index - 1}${tail}`);
          }
        } else if (action === 'insert' && targetIndex !== undefined) {
          if (index >= targetIndex) {
            validatedPaths.delete(key);
            unindexKey(key);
            validatedRenames.push(`${arrPrefix}${index + 1}${tail}`);
          }
        }
      }
      // Add renamed validatedPaths entries only after every drop/delete above has
      // landed — same collision hazard as shiftMap above (a rename target can
      // coincide with a key that's also being dropped this same pass).
      for (const newKey of validatedRenames) {
        validatedPaths.add(newKey);
        indexKey(newKey);
      }
      // Also notify any actively-registered subscriber path under this array index whose
      // slot content shifted, even when no error/touched/dirty/wasSet state exists there -
      // otherwise arrayRemove/arrayInsert would have no way to reach a per-item VALUE
      // subscriber except by falling back to notifying the whole array (which, since
      // notify() cascades to descendants, re-fires every unaffected sibling too, not just
      // the shifted items). Unlike the state maps above (which relocate data to a new key),
      // subscriptions are registered against a fixed slot path - by the time this runs,
      // `values` has already been mutated (splice happened before this call), so re-running
      // notify() on the *same* key re-reads the new content that shifted into that slot.
      // Note: pathSubscribers itself is NOT renamed here (subscriptions stay registered at
      // their original path — only the notify-list is computed), so no indexKey/unindexKey
      // calls are needed for this loop; it only reads pathSubscribers, never writes it.
      for (const key of candidates) {
        if (!pathSubscribers.has(key) || key === '*') continue;
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
    const candidates = Array.from(pathIndex.get(basePath)?.keys() ?? []);
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
    // affected source keys, then writes all renamed values - deletes-before-writes
    // guarantees a write can never be clobbered by a later delete of the same key.
    const shiftMap = (stateMap: Record<string, any>) => {
      const updated: Record<string, any> = { ...stateMap };
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
        delete updated[oldKey];
        unindexKey(oldKey);
      }
      for (const [, newKey, value] of renames) {
        updated[newKey] = value;
        indexKey(newKey);
      }
      return updated;
    };
    batch(() => {
      errors = shiftMap(errors);
      touched = shiftMap(touched);
      dirty = shiftMap(dirty);
      wasSet = shiftMap(wasSet) as Record<string, boolean>;
      // Re-key validatedPaths (Set) with the same sliding-window logic and the same
      // delete-all-then-write-all discipline as shiftMap above.
      const validatedRenames: Array<[string, string]> = [];
      for (const key of candidates) {
        if (!validatedPaths.has(key)) continue;
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
        validatedPaths.delete(oldKey);
        unindexKey(oldKey);
      }
      for (const [, newKey] of validatedRenames) {
        validatedPaths.add(newKey);
        indexKey(newKey);
      }
    });
  };

  const resolveFieldMode = (path: string, connectOverride?: ValidationMode): ValidationMode => {
    if (connectOverride) return connectOverride;
    if (config.validationMode) {
      if (typeof config.validationMode === 'string') return config.validationMode;
      const fieldMode = config.validationMode.fields?.[path];
      if (fieldMode) return fieldMode;
      if (config.validationMode.default) return config.validationMode.default;
    }
    return 'onTouched';
  };

  const isDirty = (): boolean => Object.keys(wasSet).length > 0;

  const isFieldValid = (path: string): boolean | null => {
    if (!validatedPaths.has(path)) return null;
    return !errors[path];
  };

  const isFieldDirty = (path: string): boolean => {
    if (wasSet[path]) return true;
    const prefix = `${path}.`;
    return Object.keys(wasSet).some((k) => k.startsWith(prefix));
  };

  const subscribeToPath = (path: Path<T> | '*' | string, fn: PathSubscriber) => {
    let pathSet = pathSubscribers.get(path);
    if (!pathSet) {
      pathSet = new Set();
      pathSubscribers.set(path, pathSet);
      indexKey(path);
    }
    pathSet.add(fn);
    const currentVal = path === '*' ? values : getNestedValue(values, path);
    try {
      fn(deepClone(currentVal), {
        error: errors[path],
        touched: touched[path],
        dirty: dirty[path],
      });
    } catch (err) {
      console.error('[NeutroForm] path subscriber threw on initial call:', err);
    }
    return () => {
      const listeners = pathSubscribers.get(path);
      if (listeners) {
        listeners.delete(fn);
        if (listeners.size === 0) {
          pathSubscribers.delete(path);
          unindexKey(path);
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
        snapshot[p] = deepClone(getNestedValue(values, p));
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
      const unsub = subscribeToPath(p as Path<T>, pathSubscriberFn);
      teardowns.push(unsub);
    });

    return () => {
      if (tornDown) return;
      tornDown = true;
      for (const u of teardowns) u();
    };
  };

  const focus = (path: string): boolean => {
    const ref = connectionRegistry.get(path);
    if (!ref) return false;
    const el = ref.deref();
    if (!el?.isConnected) return false;
    try {
      el.focus();
    } catch (err) {
      console.error('[NeutroForm] focus() threw:', err);
      return false;
    }
    return true;
  };

  const focusFirstError = (): boolean => {
    const errorPaths = Object.keys(errors);
    if (errorPaths.length === 0) return false;

    const connected = errorPaths
      .map((p) => {
        const ref = connectionRegistry.get(p);
        if (!ref) return null;
        const el = ref.deref();
        if (!el?.isConnected) return null;
        return { path: p, el };
      })
      .filter((e): e is { path: string; el: HTMLElement } => e !== null);

    if (connected.length === 0) return false;

    connected.sort((a, b) =>
      a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
    );

    try {
      connected[0].el.focus();
    } catch (err) {
      console.error('[NeutroForm] focusFirstError() threw on focus:', err);
      return false;
    }
    return true;
  };

  const connect = (
    path: Path<T> | string | string[],
    element: HTMLElement,
    options: ConnectOptions = {}
  ) => {
    if (!element || typeof window === 'undefined') return () => {};
    const stringPath = Array.isArray(path) ? path.join('.') : path;
    __warnUnknownPath(stringPath);
    const mode = resolveFieldMode(stringPath, options.validateOn);
    initMutationObserver();
    connectionRegistry.set(stringPath, new WeakRef(element));
    connectedPaths.add(stringPath);
    if (options.persist) persistedPaths.add(stringPath);

    element.setAttribute('aria-invalid', errors[stringPath] ? 'true' : 'false');
    if (isFieldRequired(stringPath)) {
      element.setAttribute('aria-required', 'true');
    }

    const syncValueFromDOM = (e: Event) => {
      const target = e.target as HTMLInputElement | HTMLSelectElement;
      let rawVal: any;
      if (target.type === 'checkbox') {
        const checkbox = target as HTMLInputElement;
        if (checkbox.hasAttribute('value')) {
          const currentArray = (getNestedValue(values, stringPath) as any[]) || [];
          rawVal = checkbox.checked
            ? [...currentArray, checkbox.value]
            : currentArray.filter((v) => v !== checkbox.value);
        } else {
          rawVal = checkbox.checked;
        }
      } else if (target.type === 'radio') {
        const radio = target as HTMLInputElement;
        if (radio.checked) rawVal = radio.value;
        else return;
      } else if (target.tagName === 'SELECT' && (target as HTMLSelectElement).multiple) {
        rawVal = Array.from((target as HTMLSelectElement).selectedOptions).map((opt) => opt.value);
      } else {
        const inputType = target.type;
        if (inputType === 'number')
          rawVal = target.value === '' ? undefined : parseFloat(target.value);
        else if (inputType === 'range') rawVal = parseFloat(target.value);
        else if (inputType === 'date' || inputType === 'datetime-local')
          rawVal = target.value === '' ? undefined : new Date(target.value);
        else rawVal = target.value;
      }

      if (options.format && typeof rawVal === 'string' && target instanceof HTMLInputElement) {
        const supportsSelection = ['text', 'search', 'tel', 'url', 'password'].includes(
          target.type
        );
        let start = 0,
          end = 0;
        if (supportsSelection) {
          start = target.selectionStart || 0;
          end = target.selectionEnd || 0;
        }
        let formatted = rawVal;
        try {
          formatted = options.format(rawVal);
        } catch (err) {
          console.error('[NeutroForm] format() threw:', err);
        }
        target.value = formatted;
        const diff = formatted.length - rawVal.length;
        if (supportsSelection && document.activeElement === target) {
          target.setSelectionRange(start + diff, end + diff);
        }
        rawVal = formatted;
      }
      if (mode === 'onChange') {
        setFieldValue(stringPath, rawVal, { touch: true });
        runValidation([stringPath]);
      } else if (mode === 'onTouched' && touched[stringPath]) {
        setFieldValue(stringPath, rawVal);
        runValidation([stringPath]);
      } else {
        setFieldValue(stringPath, rawVal);
      }
    };

    const handleBlur = () => {
      const wasTouched = stringPath in touched;
      touched[stringPath] = true;
      if (!wasTouched) indexKey(stringPath);
      dispatchAction({ type: 'BLUR', path: stringPath });
      if (mode === 'onBlur' || mode === 'onTouched') {
        runValidation([stringPath]);
      } else {
        notify(stringPath);
      }
    };

    element.addEventListener('input', syncValueFromDOM);
    element.addEventListener('change', syncValueFromDOM);
    element.addEventListener('blur', handleBlur);

    const cachedValue = getNestedValue(values, stringPath);
    if (cachedValue !== undefined) {
      if (element instanceof HTMLInputElement && element.type === 'checkbox') {
        element.checked = element.hasAttribute('value')
          ? Array.isArray(cachedValue) && cachedValue.includes(element.value)
          : !!cachedValue;
      } else if (element instanceof HTMLInputElement && element.type === 'radio') {
        element.checked = element.value === cachedValue;
      } else if (element instanceof HTMLSelectElement && element.multiple) {
        const arr = Array.isArray(cachedValue) ? cachedValue : [];
        for (const opt of element.options) opt.selected = arr.includes(opt.value);
      } else if (
        element instanceof HTMLInputElement &&
        (element.type === 'date' || element.type === 'datetime-local') &&
        cachedValue instanceof Date
      ) {
        element.value = cachedValue.toISOString().substring(0, 10);
      } else if ('value' in element) {
        (element as any).value = cachedValue;
      }
    }

    const unsubscribeA11y = subscribeToPath(stringPath, (_, fieldState) => {
      element.setAttribute('aria-invalid', fieldState.error ? 'true' : 'false');
      let errorContainer: Element | null = null;
      try {
        const escaped = stringPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        errorContainer = document.querySelector(`[data-error="${escaped}"]`);
      } catch {
        // path contains characters invalid in a CSS selector
      }
      if (errorContainer) {
        if (!errorContainer.id) errorContainer.id = `error-desc-${stringPath.replace(/\./g, '-')}`;
        element.setAttribute('aria-describedby', errorContainer.id);
      }
    });

    notify(stringPath);
    dispatchAction({ type: 'CONNECT', path: stringPath });
    return () => {
      element.removeEventListener('input', syncValueFromDOM);
      element.removeEventListener('change', syncValueFromDOM);
      element.removeEventListener('blur', handleBlur);
      unsubscribeA11y();
      connectionRegistry.delete(stringPath);
      connectedPaths.delete(stringPath);
      dispatchAction({ type: 'DISCONNECT', path: stringPath });
      notify(stringPath);
    };
  };

  const submit = async (
    onSubmitCallback: (payload: Partial<T>) => void | Promise<void>
  ): Promise<boolean> => {
    dispatchAction({ type: 'SUBMIT' });
    if (isSubmitting) return false;

    isSubmitting = true;
    submissionAttempts++;
    extractAllPaths(values).forEach((p) => {
      const wasTouched = p in touched;
      touched[p] = true;
      if (!wasTouched) indexKey(p);
    });
    notify();

    try {
      const isValid = await runValidation();
      if (!isValid) {
        isSubmitting = false;
        notify();
        return false;
      }

      const callbackPayload = _getPayload(
        values,
        connectionRegistry,
        connectedPaths,
        persistedPaths
      );
      // Strip transient computed fields from the payload (consistent with submit() behavior).
      for (const path of transientPaths) {
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
      const valuesSnapshot = deepClone(values) as Partial<T>;
      for (const path of transientPaths) {
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
        lastSubmittedValues = valuesSnapshot;
        try {
          await config.onSubmitSuccess?.(valuesSnapshot);
        } catch (hookErr) {
          console.error('[NeutroForm] onSubmitSuccess threw:', hookErr);
        }
        return true;
      } catch (submitErr) {
        if (config.onSubmitError) {
          try {
            await config.onSubmitError(submitErr, valuesSnapshot);
          } catch (hookErr) {
            console.error('[NeutroForm] onSubmitError threw:', hookErr);
          }
          throw submitErr;
        }
        console.error('[NeutroForm Submit Error]: ', submitErr);
        return false;
      }
    } finally {
      isSubmitting = false;
      notify();
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
        onInvalidCallback({ ...errors });
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
        const hadError = p in errors;
        errors[p] = val;
        if (!hadError) indexKey(p);
      }
    }
    for (const p of paths) {
      const wasTouched = p in touched;
      touched[p] = true;
      if (!wasTouched) indexKey(p);
    }
    batch(() => {
      for (const p of paths) notify(p);
    });
    dispatchAction({ type: 'SET_ERRORS', errors: incoming as Record<string, string> });
  };

  const clearErrors = (): void => {
    const paths = Object.keys(errors);
    if (paths.length === 0) return;
    for (const p of paths) {
      delete errors[p];
      unindexKey(p);
    }
    batch(() => {
      for (const p of paths) notify(p);
    });
    dispatchAction({ type: 'CLEAR_ERRORS' });
  };

  function isFieldRequired(path: string): boolean {
    // Only checks for the built-in 'required' rule; requiredIf/requiredUnless object rules are intentionally excluded.
    const fieldRules = config.rules?.[path];
    if (!fieldRules) return false;
    return Array.isArray(fieldRules)
      ? (fieldRules as (string | object)[]).includes('required')
      : fieldRules === 'required';
  }

  return {
    subscribe,
    subscribeToPath,

    subscribeToPathDynamic: (path: string, fn: (value: unknown) => void): (() => void) => {
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
      __warnUnknownPath(path);
      if (!pathSubscribers.has(path)) {
        pathSubscribers.set(path, new Set());
        indexKey(path);
      }
      // PathSubscriber receives (value, fieldState) but fn only declares (value) — JS ignores extra args.
      const sub = fn as PathSubscriber;
      pathSubscribers.get(path)?.add(sub);
      // Fire immediately with deep-cloned value (consistent with subscribeToPath)
      try {
        fn(deepClone(getNestedValue(values, path)));
      } catch (err) {
        console.error('[NeutroForm] subscribeToPathDynamic subscriber threw on initial call:', err);
      }
      return () => {
        const listeners = pathSubscribers.get(path);
        if (listeners) {
          listeners.delete(sub);
          if (listeners.size === 0) {
            pathSubscribers.delete(path); // prune empty Set
            unindexKey(path);
          }
        }
      };
    },

    get: (path: Path<T> | string | string[]) => {
      const targetPath = Array.isArray(path) ? path.join('.') : path;
      __warnUnknownPath(targetPath);
      return getNestedValue(values, targetPath);
    },

    set: ((path: any, val: any, options?: SetOptions) => {
      const targetPath = Array.isArray(path) ? path.join('.') : path;
      __warnUnknownPath(targetPath);
      setFieldValue(targetPath, val, options);
      dispatchAction({ type: 'SET', path: targetPath, value: val, options });
    }) as FormInstance<T>['set'],

    validate: (scopePaths?: Array<Path<T> | string[]>) => {
      const targets = scopePaths?.map((p) => (Array.isArray(p) ? p.join('.') : p));
      dispatchAction({ type: 'VALIDATE', paths: targets });
      return runValidation(targets);
    },

    connect,
    submit,
    handleSubmit,
    getState,
    getPayload: () => {
      const payload = _getPayload(values, connectionRegistry, connectedPaths, persistedPaths);
      // Strip transient computed fields from the payload (consistent with submit() behavior).
      for (const path of transientPaths) {
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
    },

    setDynamic: (path: string, value: unknown, options?: SetOptions): void => {
      if (path == null || typeof path !== 'string') {
        if (!__isProdLocal)
          console.error('[NeutroForm] setDynamic requires a non-null string path.');
        return;
      }
      if (path === '') {
        if (!__isProdLocal)
          console.warn('[NeutroForm] setDynamic called with empty path — ignoring.');
        return;
      }
      if (computedMap.has(path)) {
        if (!__isProdLocal) {
          console.warn(`[NeutroForm] "${path}" is a computed field — setDynamic() is a no-op.`);
        }
        return;
      }
      __warnUnknownPath(path);
      setFieldValue(path, value, options);
      dispatchAction({ type: 'SET', path, value, options });
    },
    getDynamic: <V = unknown>(path: string): V => {
      if (path == null || typeof path !== 'string') {
        if (!__isProdLocal)
          console.error('[NeutroForm] getDynamic requires a non-null string path.');
        return undefined as V;
      }
      if (path === '') {
        if (!__isProdLocal)
          console.warn('[NeutroForm] getDynamic called with empty path — returning undefined.');
        return undefined as V;
      }
      __warnUnknownPath(path);
      return getNestedValue(values, path) as V;
    },

    getAriaProps: (path: Path<T> | string, options?: AriaPropsOptions): AriaProps => {
      const stringPath = path as string;
      const hasError = Boolean(errors[stringPath]);
      const id = options?.errorId ?? `error-${stringPath.replace(/\./g, '-')}`;

      let ariaRequired: true | undefined;
      if (options?.required === true) {
        ariaRequired = true;
      } else if (options?.required !== false && isFieldRequired(stringPath)) {
        ariaRequired = true;
      }

      return {
        'aria-invalid': hasError ? 'true' : 'false',
        'aria-describedby': hasError ? id : undefined,
        'aria-required': ariaRequired,
      };
    },

    batch: (fn: () => void) => {
      dispatchAction({ type: 'BATCH_START' });
      try {
        batch(fn);
      } finally {
        dispatchAction({ type: 'BATCH_END' });
      }
    },
    setErrors,
    clearErrors,
    getFieldMode: (path: string) => resolveFieldMode(path),
    isDirty,
    isFieldDirty,
    isFieldValid,
    watch,

    arrayAppend: ((path: any, item: any) => {
      const targetPath = Array.isArray(path) ? path.join('.') : path;
      const arr = getNestedValue(values, targetPath) || [];
      if (!Array.isArray(arr)) return;
      setFieldValue(targetPath, [...arr, item]);
      dispatchAction({ type: 'ARRAY_APPEND', path: targetPath, item });
    }) as FormInstance<T>['arrayAppend'],

    arrayInsert: ((path: any, index: number, item: any) => {
      const targetPath = Array.isArray(path) ? path.join('.') : path;
      const arr = getNestedValue(values, targetPath) || [];
      if (!Array.isArray(arr) || index < 0 || index > arr.length) return;
      const wasAlreadySet = targetPath in wasSet;
      wasSet[targetPath] = true;
      if (!wasAlreadySet) indexKey(targetPath);
      const copy = [...arr];
      copy.splice(index, 0, item);
      batch(() => {
        setNestedValue(values, targetPath, copy);
        const shifted = shiftStateIndices(targetPath, index, 'insert', index);
        for (const k of shifted) notify(k);
        notify(`${targetPath}.${index}`);
        // Belt-and-braces: also reach an array-root subscriber explicitly via the
        // exact-only path (skips the descendant scan, so unaffected siblings aren't
        // re-notified). In practice notify(`${targetPath}.${index}`) above already walks
        // 'targetPath' as an ancestor, but this makes the root-subscriber guarantee
        // independent of that incidental path shape — see arrayRemove for the case where
        // it isn't incidental.
        notify(targetPath, { exact: true });
      });
      runValidation([targetPath]);
      dispatchAction({ type: 'ARRAY_INSERT', path: targetPath, index, item });
    }) as FormInstance<T>['arrayInsert'],

    arrayRemove: (path: Path<T> | string | string[], index: number) => {
      const targetPath = Array.isArray(path) ? path.join('.') : path;
      const arr = getNestedValue(values, targetPath) || [];
      if (!Array.isArray(arr) || index < 0 || index >= arr.length) return;
      const wasAlreadySet = targetPath in wasSet;
      wasSet[targetPath] = true;
      if (!wasAlreadySet) indexKey(targetPath);
      const copy = [...arr];
      copy.splice(index, 1);
      batch(() => {
        setNestedValue(values, targetPath, copy);
        const shifted = shiftStateIndices(targetPath, index, 'remove');
        for (const k of shifted) notify(k);
        // Always reach a subscriber registered on the array path itself (e.g.
        // subscribeToPath('items', cb)), regardless of whether anything shifted below
        // it. Uses the exact-only notify — NOT a plain notify(targetPath) — so it does
        // NOT trigger notifyPathSubscribers' descendant scan, which would re-fire every
        // unaffected sibling item's per-field subscriber under the array root.
        notify(targetPath, { exact: true });
      });
      runValidation([targetPath]);
      dispatchAction({ type: 'ARRAY_REMOVE', path: targetPath, index });
    },

    arrayMove: (path: Path<T> | string | string[], fromIndex: number, toIndex: number) => {
      const targetPath = Array.isArray(path) ? path.join('.') : path;
      const arr = getNestedValue(values, targetPath) || [];
      if (
        !Array.isArray(arr) ||
        fromIndex < 0 ||
        fromIndex >= arr.length ||
        toIndex < 0 ||
        toIndex >= arr.length
      )
        return;
      const wasAlreadySet = targetPath in wasSet;
      wasSet[targetPath] = true;
      if (!wasAlreadySet) indexKey(targetPath);
      const copy = [...arr];
      const [movedItem] = copy.splice(fromIndex, 1);
      copy.splice(toIndex, 0, movedItem);
      batch(() => {
        setNestedValue(values, targetPath, copy);
        rekeyArrayState(targetPath, fromIndex, toIndex);
        const start = Math.min(fromIndex, toIndex);
        const end = Math.max(fromIndex, toIndex);
        for (let i = start; i <= end; i++) notify(`${targetPath}.${i}`);
      });
      runValidation([targetPath]);
      dispatchAction({ type: 'ARRAY_MOVE', path: targetPath, from: fromIndex, to: toIndex });
    },

    arraySwap: (path: Path<T> | string | string[], indexA: number, indexB: number) => {
      const targetPath = Array.isArray(path) ? path.join('.') : path;
      const arr = getNestedValue(values, targetPath) || [];
      if (
        !Array.isArray(arr) ||
        indexA < 0 ||
        indexA >= arr.length ||
        indexB < 0 ||
        indexB >= arr.length
      )
        return;
      const wasAlreadySet = targetPath in wasSet;
      wasSet[targetPath] = true;
      if (!wasAlreadySet) indexKey(targetPath);
      const copy = [...arr];
      [copy[indexA], copy[indexB]] = [copy[indexB], copy[indexA]];
      batch(() => {
        setNestedValue(values, targetPath, copy);
        const candidates = Array.from(pathIndex.get(targetPath)?.keys() ?? []);
        const swapKeys = (stateMap: Record<string, any>) => {
          const prefix = `${targetPath}.`;
          const updated = { ...stateMap };
          const prefixA = `${prefix}${indexA}`;
          const prefixB = `${prefix}${indexB}`;
          for (const key of candidates) {
            if (!(key in stateMap)) continue;
            // Use exact-or-dot-child match to avoid "items.1" matching "items.10", "items.11", etc.
            const matchesA = key === prefixA || key.startsWith(`${prefixA}.`);
            const matchesB = key === prefixB || key.startsWith(`${prefixB}.`);
            if (matchesA) {
              const tail = key.substring(prefixA.length);
              const bKey = `${prefixB}${tail}`;
              updated[bKey] = stateMap[key];
              if (stateMap[bKey] === undefined) {
                // bKey had no prior state here, so it's genuinely gaining a new
                // claim at this key while `key` (A-side) loses its claim.
                indexKey(bKey);
                delete updated[key];
                unindexKey(key);
              }
              // else: bKey already held state here — the key identity stays put
              // (only the values swap), so its existing claim is unchanged.
            } else if (matchesB) {
              const tail = key.substring(prefixB.length);
              const aKey = `${prefixA}${tail}`;
              updated[aKey] = stateMap[key];
              if (stateMap[aKey] === undefined) {
                indexKey(aKey);
                delete updated[key];
                unindexKey(key);
              }
            }
          }
          return updated;
        };
        errors = swapKeys(errors);
        touched = swapKeys(touched);
        dirty = swapKeys(dirty);
        wasSet = swapKeys(wasSet) as Record<string, boolean>;
        // Swap validatedPaths entries for indexA ↔ indexB.
        // Two-phase, mirroring shiftStateIndices/rekeyArrayState above: computing
        // renames against the pristine `candidates` snapshot and only deleting all
        // source keys before adding any rename target avoids a later `.add(newKey)`
        // being re-matched by `validatedPaths.has(key)` later in this SAME pass
        // (Set/Map iteration order is insertion order, not guaranteed to visit both
        // members of a swap pair "atomically") — which would silently swap it AGAIN.
        const prefixA = `${targetPath}.${indexA}`;
        const prefixB = `${targetPath}.${indexB}`;
        const validatedRenames: Array<[string, string]> = [];
        for (const key of candidates) {
          if (!validatedPaths.has(key)) continue;
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
          validatedPaths.delete(oldKey);
          unindexKey(oldKey);
        }
        for (const [, newKey] of validatedRenames) {
          validatedPaths.add(newKey);
          indexKey(newKey);
        }
        notify(`${targetPath}.${indexA}`);
        notify(`${targetPath}.${indexB}`);
      });
      runValidation([targetPath]);
      dispatchAction({ type: 'ARRAY_SWAP', path: targetPath, i: indexA, j: indexB });
    },

    reset: (newValues?: T) => {
      const cfg = config.persistence;
      // Only write to the adapter if hydrate() has run — persistenceUnsubscribe is null until then.
      if (cfg && persistenceUnsubscribe !== null) {
        if (newValues) {
          // Apply exclude filter before writing — same logic as buildToWrite in hydrate()
          const excludeSet = new Set((cfg.exclude ?? []) as string[]);
          const toWrite = deepClone(newValues) as any;
          for (const p of excludeSet) {
            const parts = (p as string).split('.');
            let obj = toWrite;
            for (let i = 0; i < parts.length - 1; i++) {
              if (!obj || typeof obj !== 'object') break;
              obj = obj[parts[i]];
            }
            if (obj && typeof obj === 'object') delete obj[parts[parts.length - 1]];
          }
          Promise.resolve(cfg.adapter.write(toWrite as T)).catch((err: unknown) => {
            console.error('[NeutroForm persistence] write() on reset failed:', err);
          });
        } else {
          Promise.resolve(cfg.adapter.clear()).catch((err: unknown) => {
            console.error('[NeutroForm persistence] clear() failed:', err);
          });
        }
      }
      batch(() => {
        if (newValues) initialValues = deepClone(newValues);
        values = deepClone(initialValues);
        runComputedPass(); // re-derive computed fields from reset state
        for (const k of Object.keys(errors)) unindexKey(k);
        errors = {};
        for (const k of Object.keys(touched)) unindexKey(k);
        touched = {};
        for (const k of Object.keys(dirty)) unindexKey(k);
        dirty = {};
        for (const k of Object.keys(wasSet)) unindexKey(k);
        wasSet = {};
        for (const k of validatedPaths) unindexKey(k);
        validatedPaths.clear();
        isSubmitting = false;
        isValidating = false;
        hasValidated = false;
        submissionAttempts = 0;
        lastSubmittedValues = null;
      });
      connectionRegistry.forEach((ref, path) => {
        const el = ref.deref();
        if (!el || !('value' in el)) return;
        const fresh = getNestedValue(values, path);
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
      if (globalSubscribers.size > 0) {
        notifyGlobalSubscribers(getState());
      }
      notifyPathSubscribers([...pathSubscribers.keys()].filter((p) => p !== '*'));
      const wildcardListeners = pathSubscribers.get('*');
      if (wildcardListeners) {
        const allValues = deepClone(values);
        for (const cb of wildcardListeners) {
          try {
            cb(allValues, { error: undefined, touched: undefined, dirty: undefined });
          } catch (err) {
            console.error('[NeutroForm] path subscriber threw:', err);
          }
        }
      }
      dispatchAction({ type: 'RESET', newValues });
    },

    resetField: (path: Path<T>, options?: ResetFieldOptions): void => {
      const targetPath = Array.isArray(path)
        ? (path as unknown as string[]).join('.')
        : (path as string);
      const initialVal = getNestedValue(initialValues, targetPath);
      const freshVal = deepClone(initialVal);

      batch(() => {
        setNestedValue(values, targetPath, freshVal);

        if (!options?.keepError) {
          for (const k of Object.keys(errors)) {
            if (k === targetPath || k.startsWith(`${targetPath}.`)) {
              delete errors[k];
              unindexKey(k);
            }
          }
        }
        if (!options?.keepTouched) {
          for (const k of Object.keys(touched)) {
            if (k === targetPath || k.startsWith(`${targetPath}.`)) {
              delete touched[k];
              unindexKey(k);
            }
          }
        }
        if (!options?.keepDirty) {
          for (const k of Object.keys(dirty)) {
            if (k === targetPath || k.startsWith(`${targetPath}.`)) {
              delete dirty[k];
              unindexKey(k);
            }
          }
          for (const k of Object.keys(wasSet)) {
            if (k === targetPath || k.startsWith(`${targetPath}.`)) {
              delete wasSet[k];
              unindexKey(k);
            }
          }
        }
        // Always clear validatedPaths for the target path and its children.
        const toDelete = [...validatedPaths].filter(
          (k) => k === targetPath || k.startsWith(`${targetPath}.`)
        );
        for (const k of toDelete) {
          validatedPaths.delete(k);
          unindexKey(k);
        }
      });

      // DOM sync: update the connected element if one exists for this path
      const ref = connectionRegistry.get(targetPath);
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

      notify(targetPath);
      dispatchAction({ type: 'RESET_FIELD', path: targetPath });
    },

    hydrate: async (): Promise<void> => {
      const cfg = config.persistence;
      if (!cfg) return;
      if (isHydrating) return;
      isHydrating = true;
      let stored: T | null | undefined;
      try {
        stored = await cfg.adapter.read();
      } catch (err) {
        console.error('[NeutroForm persistence] read() failed, using initialValues:', err);
        isHydrating = false;
        return;
      }
      if (stored != null) {
        const excludeSet = new Set((cfg.exclude ?? []) as string[]);
        const filteredStored: any = deepMerge({}, stored);
        for (const p of excludeSet) {
          const parts = (p as string).split('.');
          let obj = filteredStored;
          for (let i = 0; i < parts.length - 1; i++) {
            if (!obj || typeof obj !== 'object') break;
            obj = obj[parts[i]];
          }
          if (obj && typeof obj === 'object') delete obj[parts[parts.length - 1]];
        }
        const merged = deepMerge(config.initialValues, filteredStored) as T;
        batch(() => {
          initialValues = deepClone(merged);
          values = deepClone(initialValues);
          for (const k of Object.keys(errors)) unindexKey(k);
          errors = {};
          for (const k of Object.keys(touched)) unindexKey(k);
          touched = {};
          for (const k of Object.keys(dirty)) unindexKey(k);
          dirty = {};
          isSubmitting = false;
          isValidating = false;
          hasValidated = false;
        });
        if (globalSubscribers.size > 0) {
          notifyGlobalSubscribers(getState());
        }
        notifyPathSubscribers([...pathSubscribers.keys()].filter((p) => p !== '*'));
      }
      // Install write subscription AFTER hydration completes.
      // Cancel any prior subscription first (guards against double-hydrate).
      persistenceUnsubscribe?.();
      persistenceUnsubscribe = null;

      const buildToWrite = (state: ReturnType<typeof getState>): T => {
        const excludeSet = new Set((cfg.exclude ?? []) as string[]);
        const toWrite = deepClone(state.values) as any;
        for (const p of excludeSet) {
          const parts = (p as string).split('.');
          let obj = toWrite;
          for (let i = 0; i < parts.length - 1; i++) {
            if (!obj || typeof obj !== 'object') break;
            obj = obj[parts[i]];
          }
          if (obj && typeof obj === 'object') delete obj[parts[parts.length - 1]];
        }
        return toWrite as T;
      };

      if (cfg.debounceMs !== 0) {
        // subscribe() calls the callback synchronously on registration; skip that initial invocation.
        let skipFirst = true;
        persistenceUnsubscribe = subscribe((state) => {
          if (skipFirst) {
            skipFirst = false;
            return;
          }
          const toWrite = buildToWrite(state);
          if (persistenceWriteTimer !== null) clearTimeout(persistenceWriteTimer);
          persistenceWriteTimer = setTimeout(() => {
            persistenceWriteTimer = null;
            Promise.resolve(cfg.adapter.write(toWrite)).catch((err: unknown) => {
              console.error('[NeutroForm persistence] write() failed:', err);
            });
          }, cfg.debounceMs ?? 300);
        });
      } else {
        // subscribe() calls the callback synchronously on registration; skip that initial invocation.
        let skipFirst = true;
        persistenceUnsubscribe = subscribe((state) => {
          if (skipFirst) {
            skipFirst = false;
            return;
          }
          const toWrite = buildToWrite(state);
          Promise.resolve(cfg.adapter.write(toWrite)).catch((err: unknown) => {
            console.error('[NeutroForm persistence] write() failed:', err);
          });
        });
      }
      isHydrating = false;
    },

    _subscribeToActions: (fn) => {
      actionListeners.add(fn);
      return () => {
        actionListeners.delete(fn);
      };
    },

    _debugPathIndex: () => {
      const snapshot = new Map<string, Set<string>>();
      for (const [prefix, counts] of pathIndex) {
        snapshot.set(prefix, new Set(counts.keys()));
      }
      return snapshot;
    },
    _debugIndexKey: (key: string) => indexKey(key),
    _debugUnindexKey: (key: string) => unindexKey(key),
    _debugRawState: () => ({
      errors: { ...errors },
      touched: { ...touched },
      dirty: { ...dirty },
      wasSet: { ...wasSet },
      validatedPaths: [...validatedPaths],
      pathSubscriberKeys: [...pathSubscribers.keys()],
    }),

    focus,
    focusFirstError,
    getConnectedCount: () => connectionRegistry.size,

    destroy: () => {
      for (const ctrl of activeAbortControllers.values()) ctrl.abort();
      activeAbortControllers.clear();
      persistenceUnsubscribe?.();
      persistenceUnsubscribe = null;
      globalSubscribers.clear();
      for (const key of pathSubscribers.keys()) {
        if (key === '*') continue;
        unindexKey(key);
      }
      pathSubscribers.clear();
      actionListeners.clear();
      connectionRegistry.clear();
      connectedPaths.clear();
      persistedPaths.clear();
      if (mutationObserver) {
        mutationObserver.disconnect();
        mutationObserver = null;
      }
      if (persistenceWriteTimer !== null) {
        clearTimeout(persistenceWriteTimer);
        persistenceWriteTimer = null;
      }
    },
  };
}

function _getPayload<T>(
  values: T,
  registry: Map<string, WeakRef<HTMLElement>>,
  connected: Set<string>,
  persisted: Set<string>
): Partial<T> {
  const payload = {} as any;
  registry.forEach((ref, path) => {
    if (connected.has(path) || persisted.has(path)) {
      const el = ref.deref();
      if (el) {
        const val = getNestedValue(values, path);
        if (val !== undefined) setNestedValue(payload, path, val);
      }
    }
  });
  return payload;
}
