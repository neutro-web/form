/**
 * @agnostic-web/form-core
 * High-Performance, Zero-Dependency, Framework-Agnostic Reactive Form Engine.
 */

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
    ? K | `${K}.${number}` | (U extends object ? `${K}.${number}.${PathImpl<U, keyof U, Prev[Depth]>}` : never)
    : T[K] extends object
    ? K | `${K}.${PathImpl<T[K], keyof T[K], Prev[Depth]>}`
    : K
  : never;

export type Path<T> = PathImpl<T, keyof T> & string;

type _GetPathValue<T, P extends string> =
  P extends `${infer K}.${infer Rest}`
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

export interface FormState<T> {
  values: T;
  errors: Record<string, string>;
  touched: Record<string, boolean>;
  dirty: Record<string, boolean>;
  isSubmitting: boolean;
  isValidating: boolean;
}

export type FormSubscriber<T> = (state: FormState<T>) => void;
export type PathSubscriber = (value: any, fieldState: { error?: string; touched?: boolean; dirty?: boolean }) => void;

export type BuiltInRule =
  // Presence
  | 'required'                                               // non-empty value
  | 'accepted'                                               // must be true (checkboxes, terms)
  // Format
  | 'email'                                                  // valid email
  | 'url'                                                    // valid URL
  | 'numeric'                                                // is a number
  | 'integer'                                                // whole number only
  | 'positive'                                               // number > 0
  | 'nonNegative'                                            // number >= 0
  | 'alpha'                                                  // letters only
  | 'alphanumeric'                                           // letters and numbers
  | 'date'                                                   // parseable date string
  // Length / size
  | { minLength: number; message?: string }                  // string length >= n
  | { maxLength: number; message?: string }                  // string length <= n
  | { min: number; message?: string }                        // number >= n
  | { max: number; message?: string }                        // number <= n
  // String content
  | { startsWith: string; message?: string }
  | { endsWith: string; message?: string }
  | { includes: string; message?: string }                   // string contains substring
  | { pattern: string | RegExp; message?: string }           // matches regex
  // Array
  | { minItems: number; message?: string }                   // array.length >= n
  | { maxItems: number; message?: string }                   // array.length <= n
  | 'unique'                                                 // all array items distinct
  | { contains: unknown; message?: string }                  // array includes value (deep equal)
  // Enum
  | { oneOf: unknown[]; message?: string }                   // value is in the list
  | { notOneOf: unknown[]; message?: string }                // value is not in the list
  // Cross-field comparisons (all accept a dot-path string)
  | { matches: string; message?: string }                    // deep-equals value at path
  | { doesNotMatch: string; message?: string }               // does NOT deep-equal value at path
  | { greaterThan: string; message?: string }                // numeric > value at path
  | { lessThan: string; message?: string }                   // numeric < value at path
  | { after: string; message?: string }                      // date/time after value at path
  | { before: string; message?: string }                     // date/time before value at path
  // Conditional presence
  | { requiredIf: string; message?: string }                 // required when field at path is truthy
  | { requiredUnless: string; message?: string };            // required unless field at path is truthy

export interface FormConfig<T> {
  initialValues: T;
  rules?: Partial<Record<string, BuiltInRule | BuiltInRule[]>>;
  validator?: (
    values: T,
    scopePaths?: string[],
    signal?: AbortSignal
  ) => Record<string, string> | Promise<Record<string, string>>;
  dependencies?: Record<string, string[]>;
  asyncDebounceMs?: number;
}

export interface ConnectOptions {
  persist?: boolean;
  format?: (val: string) => string;
}

export interface FormInstance<T extends object> {
  subscribe: (fn: FormSubscriber<T>) => () => void;
  subscribeToPath: (path: Path<T> | string, fn: PathSubscriber) => () => void;
  get: (path: Path<T> | string | string[]) => any;
  set: (path: Path<T> | string | string[], val: any, options?: { touch?: boolean; validate?: boolean }) => void;
  validate: (scopePaths?: Path<T>[] | string[] | string[][]) => Promise<boolean>;
  connect: (path: Path<T> | string, el: HTMLElement, options?: ConnectOptions) => () => void;
  submit: (onValid: (payload: Partial<T>) => void | Promise<void>) => Promise<boolean>;
  handleSubmit: (
    onValid: (payload: Partial<T>) => void | Promise<void>,
    onInvalid?: (errors: Record<string, string>) => void
  ) => (e?: Event) => void;
  getState: () => FormState<T>;
  getPayload: () => Partial<T>;
  batch: (fn: () => void) => void;
  arrayAppend: (path: Path<T> | string | string[], item: any) => void;
  arrayInsert: (path: Path<T> | string | string[], index: number, item: any) => void;
  arrayRemove: (path: Path<T> | string | string[], index: number) => void;
  arrayMove: (path: Path<T> | string | string[], fromIndex: number, toIndex: number) => void;
  arraySwap: (path: Path<T> | string | string[], indexA: number, indexB: number) => void;
  reset: (newValues?: T) => void;
  getConnectedCount: () => number;
  destroy: () => void;
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

export function classValidatorAdapter<T extends object>(
  cls: new () => T,
  validate: (obj: T) => Promise<Array<{ property: string; constraints?: Record<string, string> }>>
) {
  return async (values: T): Promise<Record<string, string>> => {
    const instance = Object.assign(new cls(), values);
    const validationErrors = await validate(instance);
    const errors: Record<string, string> = {};
    validationErrors.forEach((error) => {
      const messages = error.constraints ? Object.values(error.constraints) : [];
      if (messages.length > 0) errors[error.property] = messages[0];
    });
    return errors;
  };
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

export function deepClone<T>(val: T, hash = new WeakMap()): T {
  if (val === null || val === undefined || typeof val !== 'object') return val;
  if (val instanceof Date) return new Date(val.getTime()) as any;
  if (val instanceof RegExp) return new RegExp(val.source, val.flags) as any;
  if (val instanceof File) return val;
  if (hash.has(val)) return hash.get(val);
  if (val instanceof Set) {
    const cloneSet = new Set();
    hash.set(val, cloneSet);
    val.forEach(item => cloneSet.add(deepClone(item, hash)));
    return cloneSet as any;
  }
  if (val instanceof Map) {
    const cloneMap = new Map();
    hash.set(val, cloneMap);
    val.forEach((value, key) => cloneMap.set(key, deepClone(value, hash)));
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
    if (desc) Object.defineProperty(cloneObj, key, { ...desc, value: deepClone((val as any)[key], hash) });
  }
  return cloneObj;
}

export function getNestedValue(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

export function setNestedValue(obj: any, path: string, value: any): void {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const nextPart = parts[i + 1];
    if (!(part in current) || current[part] === null || typeof current[part] !== 'object') {
      current[part] = !isNaN(Number(nextPart)) ? [] : {};
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

export function extractAllPaths(obj: any, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object' || obj instanceof Date || obj instanceof File) {
    return prefix ? [prefix] : [];
  }
  const paths: string[] = [];
  if (prefix) paths.push(prefix);
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const currentPath = prefix ? `${prefix}.${key}` : key;
      if (Array.isArray(obj[key])) {
        paths.push(currentPath);
        obj[key].forEach((item: any, index: number) => {
          paths.push(...extractAllPaths(item, `${currentPath}.${index}`));
        });
      } else {
        paths.push(...extractAllPaths(obj[key], currentPath));
      }
    }
  }
  return paths;
}

// Bug #12: register wildcard dependency keys directly so empty-array deps are pre-compiled.
export function compileDependencyScopes(
  dependencies: Record<string, string[]>,
  initialValues: any
): Record<string, string[]> {
  const resolvedScopes: Record<string, string[]> = {};
  const allFieldPaths = extractAllPaths(initialValues);

  const resolveTransitiveClosure = (currentPath: string, visited: Set<string>) => {
    if (visited.has(currentPath)) return;
    visited.add(currentPath);
    const directDependents = dependencies[currentPath];
    if (directDependents) {
      directDependents.forEach((dep) => resolveTransitiveClosure(dep, visited));
    }
  };

  allFieldPaths.forEach((path) => {
    const visited = new Set<string>();
    resolveTransitiveClosure(path, visited);
    resolvedScopes[path] = Array.from(visited);
  });

  // Register dependency keys not present in initialValues (e.g. wildcard paths on empty arrays)
  Object.keys(dependencies).forEach((path) => {
    if (!resolvedScopes[path]) {
      const visited = new Set<string>();
      resolveTransitiveClosure(path, visited);
      resolvedScopes[path] = Array.from(visited);
    }
  });

  return resolvedScopes;
}

// ---------------------------------------------------------------------------
// Built-in rule runner
// ---------------------------------------------------------------------------

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === '' ||
    (typeof v === 'string' && !v.trim()) ||
    (Array.isArray(v) && v.length === 0);
}

function toDate(v: unknown): Date | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
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
        if (!present) error = 'This field is required';

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
          try { new URL(str); }
          catch { error = 'Must be a valid URL'; }
        }
      } else if (rule === 'numeric') {
        if (present && isNaN(Number(value))) error = 'Must be a number';
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
            error = rule.message ?? `Must be at least ${rule.minLength} character${rule.minLength === 1 ? '' : 's'}`;
        } else if ('maxLength' in rule) {
          if (present && str.length > rule.maxLength)
            error = rule.message ?? `Must be at most ${rule.maxLength} character${rule.maxLength === 1 ? '' : 's'}`;
        } else if ('min' in rule) {
          if (present && Number(value) < (rule as { min: number; message?: string }).min)
            error = rule.message ?? `Must be at least ${(rule as { min: number }).min}`;
        } else if ('max' in rule) {
          if (present && Number(value) > (rule as { max: number; message?: string }).max)
            error = rule.message ?? `Must be at most ${(rule as { max: number }).max}`;

        // ── String content ────────────────────────────────────────────────
        } else if ('startsWith' in rule) {
          if (present && !str.startsWith((rule as { startsWith: string }).startsWith))
            error = rule.message ?? `Must start with "${(rule as { startsWith: string }).startsWith}"`;
        } else if ('endsWith' in rule) {
          if (present && !str.endsWith((rule as { endsWith: string }).endsWith))
            error = rule.message ?? `Must end with "${(rule as { endsWith: string }).endsWith}"`;
        } else if ('includes' in rule) {
          if (present && !str.includes((rule as { includes: string }).includes))
            error = rule.message ?? `Must contain "${(rule as { includes: string }).includes}"`;
        } else if ('pattern' in rule) {
          const re = typeof rule.pattern === 'string' ? new RegExp(rule.pattern) : rule.pattern as RegExp;
          if (present && !re.test(str)) error = rule.message ?? 'Invalid format';

        // ── Array ─────────────────────────────────────────────────────────
        } else if ('minItems' in rule) {
          const len = arr ? arr.length : 0;
          if (len < (rule as { minItems: number }).minItems)
            error = rule.message ?? `Must have at least ${(rule as { minItems: number }).minItems} item${(rule as { minItems: number }).minItems === 1 ? '' : 's'}`;
        } else if ('maxItems' in rule) {
          const len = arr ? arr.length : 0;
          if (len > (rule as { maxItems: number }).maxItems)
            error = rule.message ?? `Must have at most ${(rule as { maxItems: number }).maxItems} item${(rule as { maxItems: number }).maxItems === 1 ? '' : 's'}`;
        } else if ('contains' in rule) {
          if (!arr || !arr.some((item) => isDeepEqual(item, (rule as { contains: unknown }).contains)))
            error = rule.message ?? 'Must contain the required value';

        // ── Enum ──────────────────────────────────────────────────────────
        } else if ('oneOf' in rule) {
          if (present && !(rule as { oneOf: unknown[] }).oneOf.some((opt) => isDeepEqual(value, opt)))
            error = rule.message ?? `Must be one of: ${(rule as { oneOf: unknown[] }).oneOf.join(', ')}`;
        } else if ('notOneOf' in rule) {
          if ((rule as { notOneOf: unknown[] }).notOneOf.some((opt) => isDeepEqual(value, opt)))
            error = rule.message ?? `Must not be one of: ${(rule as { notOneOf: unknown[] }).notOneOf.join(', ')}`;

        // ── Cross-field comparisons ───────────────────────────────────────
        } else if ('matches' in rule) {
          const other = getNestedValue(values, (rule as { matches: string }).matches);
          if (!isDeepEqual(value, other)) error = rule.message ?? 'Values do not match';
        } else if ('doesNotMatch' in rule) {
          const other = getNestedValue(values, (rule as { doesNotMatch: string }).doesNotMatch);
          if (isDeepEqual(value, other)) error = rule.message ?? 'Values must not match';
        } else if ('greaterThan' in rule) {
          const other = Number(getNestedValue(values, (rule as { greaterThan: string }).greaterThan));
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
          if (trigger && !present) error = rule.message ?? 'This field is required';
        } else if ('requiredUnless' in rule) {
          const trigger = getNestedValue(values, (rule as { requiredUnless: string }).requiredUnless);
          if (!trigger && !present) error = rule.message ?? 'This field is required';
        }
      }

      if (error !== null) { errors[path] = error; break; }
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// createForm
// ---------------------------------------------------------------------------

export function createForm<T extends object>(config: FormConfig<T>): FormInstance<T> {
  let initialValues = deepClone(config.initialValues);
  let values = deepClone(initialValues);
  let errors: Record<string, string> = {};
  let touched: Record<string, boolean> = {};
  let dirty: Record<string, boolean> = {};
  let isSubmitting = false;
  let isValidating = false;

  const globalSubscribers = new Set<FormSubscriber<T>>();
  const pathSubscribers = new Map<string, Set<PathSubscriber>>();
  const connectionRegistry = new Map<string, WeakRef<HTMLElement>>();
  const connectedPaths = new Set<string>();
  const persistedPaths = new Set<string>();

  // Bug #7: depth counter instead of boolean so nested batch() calls don't flush early.
  let batchDepth = 0;
  const pendingPaths = new Set<string | undefined>();

  let asyncEpoch = 0;
  // Bug #8: no shared asyncDebounceTimer — each runValidation invocation manages its own.
  const activeAbortControllers = new Map<string, AbortController>();
  let mutationObserver: MutationObserver | null = null;

  const preComputedScopes = config.dependencies
    ? compileDependencyScopes(config.dependencies, initialValues)
    : {};

  const getState = (): FormState<T> => ({
    values: deepClone(values),
    errors: { ...errors },
    touched: { ...touched },
    dirty: { ...dirty },
    isSubmitting,
    isValidating,
  });

  // Shared path fan-out logic used by notify(), _flushNotifications(), and reset().
  const notifyPathSubscribers = (paths: string[]) => {
    paths.forEach((mutatedPath) => {
      const parts = mutatedPath.split('.');
      const candidatePaths: string[] = ['*'];
      let accum = '';
      for (const part of parts) {
        accum = accum ? `${accum}.${part}` : part;
        candidatePaths.push(accum);
      }
      candidatePaths.forEach((p) => {
        const listeners = pathSubscribers.get(p);
        if (!listeners) return;
        const val = p === '*' ? deepClone(values) : deepClone(getNestedValue(values, p));
        listeners.forEach((cb) => cb(val, { error: errors[p], touched: touched[p], dirty: dirty[p] }));
      });
    });
  };

  // Called when a batch flushes: notifies global subscribers once, then replays each path.
  const _flushNotifications = (paths: Array<string | undefined>) => {
    if (globalSubscribers.size > 0) {
      const snapshot = getState();
      globalSubscribers.forEach((fn) => fn(snapshot));
    }
    const unique = [...new Set(paths.filter((p): p is string => p !== undefined))];
    notifyPathSubscribers(unique);
  };

  // Bug #9: guard getState() behind globalSubscribers.size > 0.
  // Rule: notify(path) for field-data mutations; notify() with no arg for flag-only changes.
  const notify = (mutatedPath?: string) => {
    if (batchDepth > 0) {
      pendingPaths.add(mutatedPath);
      return;
    }
    if (globalSubscribers.size > 0) {
      const snapshot = getState();
      globalSubscribers.forEach((fn) => fn(snapshot));
    }
    if (mutatedPath) notifyPathSubscribers([mutatedPath]);
  };

  const batch = (fn: () => void) => {
    batchDepth++;
    try { fn(); } finally {
      batchDepth--;
      if (batchDepth === 0 && pendingPaths.size > 0) {
        const paths = [...pendingPaths];
        pendingPaths.clear();
        _flushNotifications(paths);
      }
    }
  };

  const subscribe = (fn: FormSubscriber<T>) => {
    globalSubscribers.add(fn);
    fn(getState());
    return () => { globalSubscribers.delete(fn); };
  };

  const runValidation = async (scopePaths?: string[]): Promise<boolean> => {
    if (!config.validator && !config.rules) return true;
    isValidating = true;
    // isValidating is a global flag — only global subscribers need this notification.
    if (globalSubscribers.size > 0) globalSubscribers.forEach((fn) => fn(getState()));

    let expandedScope: string[] | undefined;
    if (scopePaths && Object.keys(preComputedScopes).length > 0) {
      const expandedSet = new Set<string>();
      scopePaths.forEach((path) => {
        let resolved = preComputedScopes[path];
        if (!resolved && /\.(\d+)\./.test(path)) {
          const wildcardPath = path.replace(/\.(\d+)\./g, '.*.');
          const wildcardDependents = preComputedScopes[wildcardPath];
          if (wildcardDependents) {
            const match = path.match(/\.(\d+)\./);
            const idx = match ? match[1] : '';
            resolved = wildcardDependents.map(dep => dep.replace(/\.\*\./g, `.${idx}.`));
          }
        }
        if (resolved) resolved.forEach((p) => expandedSet.add(p));
        else expandedSet.add(path);
      });
      expandedScope = Array.from(expandedSet);
    } else if (scopePaths) {
      expandedScope = scopePaths;
    }

    try {
      const activeEpoch = ++asyncEpoch;

      if (expandedScope) {
        expandedScope.forEach((path) => {
          activeAbortControllers.get(path)?.abort();
          activeAbortControllers.delete(path);
        });
      }
      const abortController = new AbortController();
      if (expandedScope) {
        expandedScope.forEach((path) => activeAbortControllers.set(path, abortController));
      }

      // Built-in rules run synchronously first; custom validator errors override on conflict.
      const builtInErrors: Record<string, string> = config.rules
        ? applyBuiltInRules(values, config.rules as Record<string, BuiltInRule | BuiltInRule[]>, expandedScope)
        : {};

      if (config.validator) {
        // Bug #13: pass snapshot so mid-await mutations can't corrupt validation state.
        const valuesSnapshot = deepClone(values);
        const validationResult = config.validator(valuesSnapshot, expandedScope, abortController.signal);

        if (validationResult instanceof Promise) {
          // Bug #8: per-invocation debounce — uses a local timer, not a shared one.
          const resolvedErrors = await new Promise<Record<string, string>>((resolve) => {
            let localTimer: any;
            const onAbort = () => { clearTimeout(localTimer); resolve(errors); };
            abortController.signal.addEventListener('abort', onAbort, { once: true });
            localTimer = setTimeout(async () => {
              abortController.signal.removeEventListener('abort', onAbort);
              if (abortController.signal.aborted) { resolve(errors); return; }
              try { resolve(await validationResult); }
              catch { resolve({ _global: 'Asynchronous validation transaction failed.' }); }
            }, config.asyncDebounceMs ?? 300);
          });

          if (activeEpoch === asyncEpoch && !abortController.signal.aborted) {
            const combined = { ...builtInErrors, ...resolvedErrors };
            errors = expandedScope
              ? mergeScopedErrors(errors, combined, expandedScope)
              : combined;
          }
        } else {
          const combined = { ...builtInErrors, ...validationResult };
          errors = expandedScope
            ? mergeScopedErrors(errors, combined, expandedScope)
            : combined;
        }
      } else {
        errors = expandedScope
          ? mergeScopedErrors(errors, builtInErrors, expandedScope)
          : builtInErrors;
      }
    } finally {
      if (expandedScope) expandedScope.forEach((path) => activeAbortControllers.delete(path));
      isValidating = false;
      if (globalSubscribers.size > 0) globalSubscribers.forEach((fn) => fn(getState()));
      // Notify path subscribers so they see updated error state.
      const pathsToNotify = expandedScope
        ?? [...pathSubscribers.keys()].filter(p => p !== '*');
      notifyPathSubscribers(pathsToNotify);
    }

    return Object.keys(errors).length === 0;
  };

  const mergeScopedErrors = (
    currentErrors: Record<string, string>,
    nextErrors: Record<string, string>,
    scopePaths: string[]
  ): Record<string, string> => {
    const updated = { ...currentErrors };
    scopePaths.forEach((path) => {
      Object.keys(updated).forEach((key) => {
        if (key === path || key.startsWith(path + '.')) delete updated[key];
      });
    });
    Object.keys(nextErrors).forEach((key) => {
      if (scopePaths.some((scope) => key === scope || key.startsWith(scope + '.')))
        updated[key] = nextErrors[key];
    });
    return updated;
  };

  const setFieldValue = (
    path: string,
    val: any,
    options: { touch?: boolean; validate?: boolean } = {}
  ) => {
    const currentVal = getNestedValue(values, path);
    if (isDeepEqual(currentVal, val)) return;
    batch(() => {
      setNestedValue(values, path, val);
      const initialVal = getNestedValue(initialValues, path);
      dirty[path] = !isDeepEqual(initialVal, val);
      if (!dirty[path]) delete dirty[path];
      if (options.touch) touched[path] = true;
    });
    // Always notify path subscribers immediately so controlled inputs see the new value
    // before async validation completes.
    notify(path);
    if (options.validate !== false) runValidation([path]);
  };

  const initMutationObserver = () => {
    if (mutationObserver || typeof window === 'undefined' || typeof document === 'undefined') return;
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
                delete touched[path];
                delete dirty[path];
                clearedPaths.push(path);
              }
            }
          });
        });
      });
      if (clearedPaths.length > 0) {
        if (globalSubscribers.size > 0) globalSubscribers.forEach((fn) => fn(getState()));
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
    const shiftMap = (stateMap: Record<string, any>) => {
      const updated: Record<string, any> = {};
      const prefix = `${basePath}.`;
      Object.keys(stateMap).forEach((key) => {
        if (!key.startsWith(prefix)) { updated[key] = stateMap[key]; return; }
        const remaining = key.substring(prefix.length);
        const match = remaining.match(/^(\d+)(.*)$/);
        if (!match) { updated[key] = stateMap[key]; return; }
        const index = parseInt(match[1], 10);
        const tail = match[2];
        if (action === 'remove') {
          if (index === fromIndex) return;
          if (index > fromIndex) {
            const newKey = `${prefix}${index - 1}${tail}`;
            updated[newKey] = stateMap[key];
            shiftedKeys.push(newKey);
          } else {
            updated[key] = stateMap[key];
          }
        } else if (action === 'insert' && targetIndex !== undefined) {
          if (index >= targetIndex) {
            const newKey = `${prefix}${index + 1}${tail}`;
            updated[newKey] = stateMap[key];
            shiftedKeys.push(newKey);
          } else {
            updated[key] = stateMap[key];
          }
        }
      });
      return updated;
    };
    batch(() => {
      errors = shiftMap(errors);
      touched = shiftMap(touched);
      dirty = shiftMap(dirty);
    });
    return shiftedKeys;
  };

  const rekeyArrayState = (basePath: string, fromIndex: number, toIndex: number) => {
    const prefix = `${basePath}.`;
    const shiftMap = (stateMap: Record<string, any>) => {
      const updated: Record<string, any> = {};
      const affectedKeys: { index: number; tail: string; key: string }[] = [];
      Object.keys(stateMap).forEach((key) => {
        if (!key.startsWith(prefix)) { updated[key] = stateMap[key]; return; }
        const remaining = key.substring(prefix.length);
        const match = remaining.match(/^(\d+)(.*)$/);
        if (!match) { updated[key] = stateMap[key]; return; }
        affectedKeys.push({ index: parseInt(match[1], 10), tail: match[2], key });
      });
      affectedKeys.forEach(({ index, tail, key }) => {
        let newIndex = index;
        if (index === fromIndex) newIndex = toIndex;
        else if (fromIndex < toIndex && index > fromIndex && index <= toIndex) newIndex = index - 1;
        else if (fromIndex > toIndex && index >= toIndex && index < fromIndex) newIndex = index + 1;
        updated[`${prefix}${newIndex}${tail}`] = stateMap[key];
      });
      return updated;
    };
    batch(() => {
      errors = shiftMap(errors);
      touched = shiftMap(touched);
      dirty = shiftMap(dirty);
    });
  };

  const subscribeToPath = (path: Path<T> | '*' | string, fn: PathSubscriber) => {
    if (!pathSubscribers.has(path)) pathSubscribers.set(path, new Set());
    pathSubscribers.get(path)!.add(fn);
    const currentVal = path === '*' ? values : getNestedValue(values, path);
    fn(deepClone(currentVal), { error: errors[path], touched: touched[path], dirty: dirty[path] });
    return () => {
      const listeners = pathSubscribers.get(path);
      if (listeners) {
        listeners.delete(fn);
        if (listeners.size === 0) pathSubscribers.delete(path);
      }
    };
  };

  const connect = (
    path: Path<T> | string | string[],
    element: HTMLElement,
    options: ConnectOptions = {}
  ) => {
    if (!element || typeof window === 'undefined') return () => {};
    const stringPath = Array.isArray(path) ? path.join('.') : path;
    initMutationObserver();
    connectionRegistry.set(stringPath, new WeakRef(element));
    connectedPaths.add(stringPath);
    if (options.persist) persistedPaths.add(stringPath);

    const errorContainer = document.querySelector(`[data-error="${stringPath}"]`);
    if (errorContainer) {
      if (!errorContainer.id) errorContainer.id = `error-desc-${stringPath.replace(/\./g, '-')}`;
      element.setAttribute('aria-describedby', errorContainer.id);
    }
    element.setAttribute('aria-invalid', errors[stringPath] ? 'true' : 'false');

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
        if (inputType === 'number') rawVal = target.value === '' ? undefined : parseFloat(target.value);
        else if (inputType === 'range') rawVal = parseFloat(target.value);
        else if (inputType === 'date' || inputType === 'datetime-local')
          rawVal = target.value === '' ? undefined : new Date(target.value);
        else rawVal = target.value;
      }

      if (options.format && typeof rawVal === 'string' && target instanceof HTMLInputElement) {
        const supportsSelection = ['text', 'search', 'tel', 'url', 'password'].includes(target.type);
        let start = 0, end = 0;
        if (supportsSelection) { start = target.selectionStart || 0; end = target.selectionEnd || 0; }
        const formatted = options.format(rawVal);
        target.value = formatted;
        const diff = formatted.length - rawVal.length;
        if (supportsSelection && document.activeElement === target) {
          target.setSelectionRange(start + diff, end + diff);
        }
        rawVal = formatted;
      }
      setFieldValue(stringPath, rawVal, { touch: true });
    };

    const handleBlur = () => {
      touched[stringPath] = true;
      runValidation([stringPath]);
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
        Array.from(element.options).forEach((opt) => (opt.selected = arr.includes(opt.value)));
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
    });

    notify(stringPath);
    return () => {
      element.removeEventListener('input', syncValueFromDOM);
      element.removeEventListener('change', syncValueFromDOM);
      element.removeEventListener('blur', handleBlur);
      unsubscribeA11y();
      connectionRegistry.delete(stringPath);
      connectedPaths.delete(stringPath);
      notify(stringPath);
    };
  };

  const submit = async (onSubmitCallback: (payload: Partial<T>) => void | Promise<void>): Promise<boolean> => {
    if (isSubmitting) return false;
    isSubmitting = true;
    notify();
    try {
      const isValid = await runValidation();
      if (isValid) {
        const payload = _getPayload(values, connectionRegistry, connectedPaths, persistedPaths);
        await onSubmitCallback(payload);
        return true;
      }
      return false;
    } catch (err) {
      console.error('[Agnostic Form Submit Error]: ', err);
      return false;
    } finally {
      isSubmitting = false;
      notify();
    }
  };

  const handleSubmit = (onSubmitCallback: (payload: Partial<T>) => void | Promise<void>) => {
    return async (e?: Event) => {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      await submit(onSubmitCallback);
    };
  };

  return {
    subscribe,
    subscribeToPath,

    get: (path: Path<T> | string | string[]) => {
      const targetPath = Array.isArray(path) ? path.join('.') : path;
      return getNestedValue(values, targetPath);
    },

    set: (path: Path<T> | string | string[], val: any, options?: { touch?: boolean; validate?: boolean }) => {
      const targetPath = Array.isArray(path) ? path.join('.') : path;
      setFieldValue(targetPath, val, options);
    },

    validate: (scopePaths?: Path<T>[] | string[] | string[][]) => {
      const targets = scopePaths?.map(p => Array.isArray(p) ? p.join('.') : p);
      return runValidation(targets);
    },

    connect,
    submit,
    handleSubmit,
    getState,
    getPayload: () => _getPayload(values, connectionRegistry, connectedPaths, persistedPaths),
    batch,

    arrayAppend: (path: Path<T> | string | string[], item: any) => {
      const targetPath = Array.isArray(path) ? path.join('.') : path;
      const arr = getNestedValue(values, targetPath) || [];
      if (!Array.isArray(arr)) return;
      setFieldValue(targetPath, [...arr, item]);
    },

    arrayInsert: (path: Path<T> | string | string[], index: number, item: any) => {
      const targetPath = Array.isArray(path) ? path.join('.') : path;
      const arr = getNestedValue(values, targetPath) || [];
      if (!Array.isArray(arr) || index < 0 || index > arr.length) return;
      const copy = [...arr];
      copy.splice(index, 0, item);
      batch(() => {
        setNestedValue(values, targetPath, copy);
        const shifted = shiftStateIndices(targetPath, index, 'insert', index);
        shifted.forEach((k) => notify(k));
        notify(`${targetPath}.${index}`);
      });
      runValidation([targetPath]);
    },

    arrayRemove: (path: Path<T> | string | string[], index: number) => {
      const targetPath = Array.isArray(path) ? path.join('.') : path;
      const arr = getNestedValue(values, targetPath) || [];
      if (!Array.isArray(arr) || index < 0 || index >= arr.length) return;
      const copy = [...arr];
      copy.splice(index, 1);
      batch(() => {
        setNestedValue(values, targetPath, copy);
        const shifted = shiftStateIndices(targetPath, index, 'remove');
        shifted.forEach((k) => notify(k));
      });
      runValidation([targetPath]);
    },

    arrayMove: (path: Path<T> | string | string[], fromIndex: number, toIndex: number) => {
      const targetPath = Array.isArray(path) ? path.join('.') : path;
      const arr = getNestedValue(values, targetPath) || [];
      if (
        !Array.isArray(arr) ||
        fromIndex < 0 || fromIndex >= arr.length ||
        toIndex < 0 || toIndex >= arr.length
      ) return;
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
    },

    arraySwap: (path: Path<T> | string | string[], indexA: number, indexB: number) => {
      const targetPath = Array.isArray(path) ? path.join('.') : path;
      const arr = getNestedValue(values, targetPath) || [];
      if (
        !Array.isArray(arr) ||
        indexA < 0 || indexA >= arr.length ||
        indexB < 0 || indexB >= arr.length
      ) return;
      const copy = [...arr];
      [copy[indexA], copy[indexB]] = [copy[indexB], copy[indexA]];
      batch(() => {
        setNestedValue(values, targetPath, copy);
        const swapKeys = (stateMap: Record<string, any>) => {
          const prefix = `${targetPath}.`;
          const updated = { ...stateMap };
          const prefixA = `${prefix}${indexA}`;
          const prefixB = `${prefix}${indexB}`;
          Object.keys(stateMap).forEach((key) => {
            // Use exact-or-dot-child match to avoid "items.1" matching "items.10", "items.11", etc.
            const matchesA = key === prefixA || key.startsWith(prefixA + '.');
            const matchesB = key === prefixB || key.startsWith(prefixB + '.');
            if (matchesA) {
              const tail = key.substring(prefixA.length);
              const bKey = `${prefixB}${tail}`;
              updated[bKey] = stateMap[key];
              if (stateMap[bKey] === undefined) delete updated[key];
            } else if (matchesB) {
              const tail = key.substring(prefixB.length);
              const aKey = `${prefixA}${tail}`;
              updated[aKey] = stateMap[key];
              if (stateMap[aKey] === undefined) delete updated[key];
            }
          });
          return updated;
        };
        errors = swapKeys(errors);
        touched = swapKeys(touched);
        dirty = swapKeys(dirty);
        notify(`${targetPath}.${indexA}`);
        notify(`${targetPath}.${indexB}`);
      });
      runValidation([targetPath]);
    },

    reset: (newValues?: T) => {
      batch(() => {
        if (newValues) initialValues = deepClone(newValues);
        values = deepClone(initialValues);
        errors = {};
        touched = {};
        dirty = {};
        isSubmitting = false;
        isValidating = false;
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
          Array.from(el.options).forEach((opt) => (opt.selected = arr.includes(opt.value)));
        } else if (
          el instanceof HTMLInputElement &&
          (el.type === 'date' || el.type === 'datetime-local') &&
          fresh instanceof Date
        ) {
          el.value = fresh.toISOString().substring(0, 10);
        } else {
          (el as any).value = fresh !== undefined ? fresh : '';
        }
      });
      // Notify all subscribers with reset state.
      if (globalSubscribers.size > 0) globalSubscribers.forEach((fn) => fn(getState()));
      notifyPathSubscribers([...pathSubscribers.keys()].filter(p => p !== '*'));
      const wildcardListeners = pathSubscribers.get('*');
      if (wildcardListeners) {
        const allValues = deepClone(values);
        wildcardListeners.forEach((cb) => cb(allValues, { error: undefined, touched: undefined, dirty: undefined }));
      }
    },

    getConnectedCount: () => connectionRegistry.size,

    destroy: () => {
      globalSubscribers.clear();
      pathSubscribers.clear();
      connectionRegistry.clear();
      connectedPaths.clear();
      persistedPaths.clear();
      if (mutationObserver) {
        mutationObserver.disconnect();
        mutationObserver = null;
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
