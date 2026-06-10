/**
 * Agnostic Web Workspace Local Initializer.
 * Run "node init-workspace.js" in the root of your cloned agw-form repo to bootstrap!
 */
const fs = require('fs');
const path = require('path');

const write = (targetPath, content) => {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(targetPath, content.trim() + '\n', 'utf8');
  console.log(`[Generated File]: ${targetPath}`);
};

console.log('Initializing @agnostic-web Workspace under agw-form root...');

// --- 1. ROOT WORKSPACE FILES ---

write('pnpm-workspace.yaml', `
packages:
  - 'packages/core'
  - 'packages/adapters/*'
  - 'packages/alias'
`);

write('package.json', JSON.stringify({
  name: "agw-form",
  private: true,
  scripts: {
    "build": "pnpm --filter \"@agnostic-web/*\" run build",
    "test": "vitest run"
  },
  devDependencies: {
    "vitest": "^1.0.0",
    "typescript": "^5.0.0"
  }
}, null, 2));

write('tsconfig.json', JSON.stringify({
  compilerOptions: {
    target: "ES2022",
    module: "NodeNext",
    moduleResolution: "NodeNext",
    lib: ["DOM", "DOM.Iterable", "ES2022"],
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    forceConsistentCasingInFileNames: true,
    declaration: true,
    baseUrl: ".",
    paths: {
      "@agw/form/core": ["packages/core/src/index.ts"],
      "@agw/form/adapters/react": ["packages/adapters/react/src/index.ts"],
      "@agw/form/adapters/svelte": ["packages/adapters/svelte/src/index.ts"],
      "@agw/form/adapters/vue": ["packages/adapters/vue/src/index.ts"],
      "@agw/form/adapters/solid": ["packages/adapters/solid/src/index.ts"],
      "@agw/form/adapters/angular": ["packages/adapters/angular/src/index.ts"]
    }
  }
}, null, 2));

// --- 2. PACKAGES: CORE ENGINE ---

write('packages/core/package.json', JSON.stringify({
  name: "@agnostic-web/form-core",
  version: "1.0.0",
  type: "module",
  main: "./dist/index.cjs",
  module: "./dist/index.js",
  types: "./dist/index.d.ts",
  exports: {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  files: ["dist"],
  scripts: {
    "build": "tsup src/index.ts --format esm,cjs --dts --clean"
  },
  devDependencies: {
    "tsup": "^8.0.0"
  }
}, null, 2));

write('packages/core/tsconfig.json', JSON.stringify({
  extends: "../../tsconfig.json",
  compilerOptions: {
    outDir: "./dist"
  },
  include: ["src/**/*"]
}, null, 2));

write('packages/core/tsup.config.ts', `
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: true,
  treeshake: true
});
`);

// CORE ENGINE SOURCE
write('packages/core/src/index.ts', `
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
    ? K | \`\${K}.\${number}\` | (U extends object ? \`\${K}.\${number}.\${PathImpl<U, keyof U, Prev[Depth]>}\` : never)
    : T[K] extends object
    ? K | \`\${K}.\${PathImpl<T[K], keyof T[K], Prev[Depth]>}\`
    : K
  : never;

export type Path<T> = (PathImpl<T, keyof T> & string);

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

export interface FormConfig<T> {
  initialValues: T;
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

export function zodAdapter<T>(schema: { safeParse: (values: T) => any }) {
  return (values: T): Record<string, string> => {
    const result = schema.safeParse(values);
    if (result.success) return {};
    const errors: Record<string, string> = {};
    result.error.issues.forEach((issue: any) => {
      const path = issue.path.join('.');
      errors[path] = issue.message;
    });
    return errors;
  };
}

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
    for (let i = 0; i < val.length; i++) {
      cloneArr[i] = deepClone(val[i], hash);
    }
    return cloneArr as any;
  }
  const cloneObj = Object.create(Object.getPrototypeOf(val));
  hash.set(val, cloneObj);
  for (const key of Reflect.ownKeys(val)) {
    const desc = Object.getOwnPropertyDescriptor(val, key);
    if (desc) {
      Object.defineProperty(cloneObj, key, {
        ...desc,
        value: deepClone((val as any)[key], hash)
      });
    }
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
  const lastKey = parts[parts.length - 1];
  current[lastKey] = value;
}

export function isDeepEqual(a: any, b: any, hash = new Map()): boolean {
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
  const keysB = Reflect.ownKeys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!keysB.includes(key) || !isDeepEqual(a[key], b[key], hash)) return false;
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
      const currentPath = prefix ? \`\${prefix}.\${key}\` : key;
      if (Array.isArray(obj[key])) {
        paths.push(currentPath);
        obj[key].forEach((item: any, index: number) => {
          paths.push(...extractAllPaths(item, \`\${currentPath}.\${index}\`));
        });
      } else {
        paths.push(...extractAllPaths(obj[key], currentPath));
      }
    }
  }
  return paths;
}

export function compileDependencyScopes(dependencies: Record<string, string[]>, initialValues: any): Record<string, string[]> {
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
  return resolvedScopes;
}

export function createForm<T extends object>(config: FormConfig<T>) {
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

  let isBatching = false;
  let hasPendingNotification = false;
  let asyncEpoch = 0;
  let asyncDebounceTimer: any = null;
  const activeAbortControllers = new Map<string, AbortController>();
  let mutationObserver: MutationObserver | null = null;

  const preComputedScopes = config.dependencies ? compileDependencyScopes(config.dependencies, initialValues) : {};

  const getState = (): FormState<T> => ({
    values: deepClone(values),
    errors: { ...errors },
    touched: { ...touched },
    dirty: { ...dirty },
    isSubmitting,
    isValidating
  });

  const notify = (mutatedPath?: string) => {
    if (isBatching) {
      hasPendingNotification = true;
      return;
    }
    const stateSnapshot = getState();
    globalSubscribers.forEach((fn) => fn(stateSnapshot));
    if (mutatedPath) {
      const parts = mutatedPath.split('.');
      const candidatePaths: string[] = ['*'];
      let accum = '';
      for (const part of parts) {
        accum = accum ? \`\${accum}.\${part}\` : part;
        candidatePaths.push(accum);
      }
      candidatePaths.forEach((path) => {
        const listeners = pathSubscribers.get(path);
        if (listeners) {
          listeners.forEach((cb) => {
            const val = path === '*' ? stateSnapshot.values : getNestedValue(values, path);
            cb(val, {
              error: errors[path],
              touched: touched[path],
              dirty: dirty[path]
            });
          });
        }
      });
    }
  };

  const batch = (fn: () => void) => {
    isBatching = true;
    try { fn(); } finally {
      isBatching = false;
      if (hasPendingNotification) {
        hasPendingNotification = false;
        notify();
      }
    }
  };

  const subscribe = (fn: FormSubscriber<T>) => {
    globalSubscribers.add(fn);
    fn(getState());
    return () => { globalSubscribers.delete(fn); };
  };

  const runValidation = async (scopePaths?: string[]): Promise<boolean> => {
    if (!config.validator) return true;
    isValidating = true;
    notify();

    let expandedScope: string[] | undefined = undefined;
    if (scopePaths && preComputedScopes) {
      const expandedSet = new Set<string>();
      scopePaths.forEach((path) => {
        let resolved = preComputedScopes[path];
        if (!resolved && /\\.(\\d+)\\./.test(path)) {
          const wildcardPath = path.replace(/\\.(\\d+)\\./g, '.*.');
          const wildcardDependents = preComputedScopes[wildcardPath];
          if (wildcardDependents) {
            const activeIndexMatch = path.match(/\\.(\\d+)\\./);
            const activeIndex = activeIndexMatch ? activeIndexMatch[1] : '';
            resolved = wildcardDependents.map(dep => dep.replace(/\\.\\*\\./g, \`.\${activeIndex}.\`));
          }
        }
        if (resolved) {
          resolved.forEach((p) => expandedSet.add(p));
        } else {
          expandedSet.add(path); 
        }
      });
      expandedScope = Array.from(expandedSet);
    } else if (scopePaths) {
      expandedScope = scopePaths;
    }

    try {
      const activeEpoch = ++asyncEpoch;
      if (expandedScope) {
        expandedScope.forEach((path) => {
          const controller = activeAbortControllers.get(path);
          if (controller) {
            controller.abort();
            activeAbortControllers.delete(path);
          }
        });
      }
      const abortController = new AbortController();
      if (expandedScope) {
        expandedScope.forEach((path) => activeAbortControllers.set(path, abortController));
      }

      const validationResult = config.validator(values, expandedScope, abortController.signal);
      if (validationResult instanceof Promise) {
        if (asyncDebounceTimer) clearTimeout(asyncDebounceTimer);
        const resolvedErrors = await new Promise<Record<string, string>>((resolve) => {
          asyncDebounceTimer = setTimeout(async () => {
            try {
              if (abortController.signal.aborted) {
                resolve(errors);
                return;
              }
              const res = await validationResult;
              resolve(res);
            } catch (err) {
              resolve({ _global: 'Asynchronous validation transaction failed.' });
            }
          }, config.asyncDebounceMs || 300);
        });

        if (activeEpoch === asyncEpoch && !abortController.signal.aborted) {
          errors = expandedScope ? mergeScopedErrors(errors, resolvedErrors, expandedScope) : resolvedErrors;
        }
      } else {
        errors = expandedScope ? mergeScopedErrors(errors, validationResult, expandedScope) : validationResult;
      }
    } finally {
      if (expandedScope) {
        expandedScope.forEach((path) => activeAbortControllers.delete(path));
      }
      isValidating = false;
      notify();
    }
    return Object.keys(errors).length === 0;
  };

  const mergeScopedErrors = (currentErrors: Record<string, string>, nextErrors: Record<string, string>, scopePaths: string[]): Record<string, string> => {
    const updated = { ...currentErrors };
    scopePaths.forEach((path) => {
      Object.keys(updated).forEach((key) => {
        if (key === path || key.startsWith(path + '.')) delete updated[key];
      });
    });
    Object.keys(nextErrors).forEach((key) => {
      if (scopePaths.some((scope) => key === scope || key.startsWith(scope + '.'))) updated[key] = nextErrors[key];
    });
    return updated;
  };

  const setFieldValue = (path: string, val: any, options: { touch?: boolean; validate?: boolean } = {}) => {
    const currentVal = getNestedValue(values, path);
    if (isDeepEqual(currentVal, val)) return;
    batch(() => {
      setNestedValue(values, path, val);
      const initialVal = getNestedValue(initialValues, path);
      if (isDeepEqual(initialVal, val)) {
        delete dirty[path];
      } else {
        dirty[path] = true;
      }
      if (options.touch) touched[path] = true;
    });
    if (options.validate !== false) runValidation([path]);
    else notify(path);
  };

  const initMutationObserver = () => {
    if (mutationObserver || typeof window === 'undefined' || typeof document === 'undefined') return;
    mutationObserver = new MutationObserver((mutations) => {
      let stateChanged = false;
      mutations.forEach((mutation) => {
        mutation.removedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            connectionRegistry.forEach((ref, path) => {
              const el = ref.deref();
              if (!el || node.contains(el)) {
                connectionRegistry.delete(path);
                connectedPaths.delete(path);
                if (!persistedPaths.has(path)) {
                  delete errors[path];
                  delete touched[path];
                  delete dirty[path];
                }
                stateChanged = true;
              }
            });
          }
        });
      });
      if (stateChanged) notify();
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });
  };

  const shiftStateIndices = (basePath: string, fromIndex: number, action: 'remove' | 'insert', targetIndex?: number): string[] => {
    const shiftedKeys: string[] = [];
    const shiftMap = (stateMap: Record<string, any>) => {
      const updated: Record<string, any> = {};
      const prefix = \`\${basePath}.\`;
      Object.keys(stateMap).forEach((key) => {
        if (!key.startsWith(prefix)) {
          updated[key] = stateMap[key];
          return;
        }
        const remaining = key.substring(prefix.length);
        const match = remaining.match(/^(\\d+)(.*)$/);
        if (!match) {
          updated[key] = stateMap[key];
          return;
        }
        const index = parseInt(match[1], 10);
        const tail = match[2];
        if (action === 'remove') {
          if (index === fromIndex) return;
          if (index > fromIndex) {
            const newKey = \`\${prefix}\${index - 1}\${tail}\`;
            updated[newKey] = stateMap[key];
            shiftedKeys.push(newKey);
          } else {
            updated[key] = stateMap[key];
          }
        } else if (action === 'insert' && targetIndex !== undefined) {
          if (index >= targetIndex) {
            const newKey = \`\${prefix}\${index + 1}\${tail}\`;
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
    const prefix = \`\${basePath}.\`;
    const shiftMap = (stateMap: Record<string, any>) => {
      const updated: Record<string, any> = {};
      const affectedKeys: { index: number; tail: string; key: string }[] = [];
      Object.keys(stateMap).forEach((key) => {
        if (!key.startsWith(prefix)) {
          updated[key] = stateMap[key];
          return;
        }
        const remaining = key.substring(prefix.length);
        const match = remaining.match(/^(\\d+)(.*)$/);
        if (!match) {
          updated[key] = stateMap[key];
          return;
        }
        affectedKeys.push({ index: parseInt(match[1], 10), tail: match[2], key });
      });
      affectedKeys.forEach(({ index, tail, key }) => {
        let newIndex = index;
        if (index === fromIndex) newIndex = toIndex;
        else if (fromIndex < toIndex) {
          if (index > fromIndex && index <= toIndex) newIndex = index - 1;
        } else if (fromIndex > toIndex) {
          if (index >= toIndex && index < fromIndex) newIndex = index + 1;
        }
        updated[\`\${prefix}\${newIndex}\${tail}\`] = stateMap[key];
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
    fn(deepClone(currentVal), {
      error: errors[path],
      touched: touched[path],
      dirty: dirty[path]
    });
    return () => {
      const listeners = pathSubscribers.get(path);
      if (listeners) {
        listeners.delete(fn);
        if (listeners.size === 0) pathSubscribers.delete(path);
      }
    };
  };

  const connect = (path: Path<T> | string | string[], element: HTMLElement, options: ConnectOptions = {}) => {
    if (!element || typeof window === 'undefined') return () => {};
    const stringPath = Array.isArray(path) ? path.join('.') : path;
    initMutationObserver();
    connectionRegistry.set(stringPath, new WeakRef(element));
    connectedPaths.add(stringPath);
    if (options.persist) persistedPaths.add(stringPath);

    const errorContainer = document.querySelector(\`[data-error="\${stringPath}"]\`);
    if (errorContainer) {
      if (!errorContainer.id) errorContainer.id = \`error-desc-\${stringPath.replace(/\\./g, '-')}\`;
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
          rawVal = checkbox.checked ? [...currentArray, checkbox.value] : currentArray.filter((v) => v !== checkbox.value);
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
        else if (inputType === 'date' || inputType === 'datetime-local') rawVal = target.value === '' ? undefined : new Date(target.value);
        else rawVal = target.value;
      }

      if (options.format && typeof rawVal === 'string' && target instanceof HTMLInputElement) {
        const supportsSelection = ['text', 'search', 'tel', 'url', 'password'].includes(target.type);
        let start = 0, end = 0;
        if (supportsSelection) {
          start = target.selectionStart || 0;
          end = target.selectionEnd || 0;
        }
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
        if (element.hasAttribute('value')) element.checked = Array.isArray(cachedValue) && cachedValue.includes(element.value);
        else element.checked = !!cachedValue;
      } else if (element instanceof HTMLInputElement && element.type === 'radio') {
        element.checked = element.value === cachedValue;
      } else if (element instanceof HTMLSelectElement && element.multiple) {
        const arr = Array.isArray(cachedValue) ? cachedValue : [];
        Array.from(element.options).forEach((opt) => opt.selected = arr.includes(opt.value));
      } else if (element instanceof HTMLInputElement && (element.type === 'date' || element.type === 'datetime-local') && cachedValue instanceof Date) {
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
      if (!Array.isArray(arr) || fromIndex < 0 || fromIndex >= arr.length || toIndex < 0 || toIndex >= arr.length) return;
      const copy = [...arr];
      const [movedItem] = copy.splice(fromIndex, 1);
      copy.splice(toIndex, 0, movedItem);
      batch(() => {
        setNestedValue(values, targetPath, copy);
        rekeyArrayState(targetPath, fromIndex, toIndex);
        const start = Math.min(fromIndex, toIndex);
        const end = Math.max(fromIndex, toIndex);
        for (let i = start; i <= end; i++) notify(\`\${targetPath}.\${i}\`);
      });
      runValidation([targetPath]);
    },

    arraySwap: (path: Path<T> | string | string[], indexA: number, indexB: number) => {
      const targetPath = Array.isArray(path) ? path.join('.') : path;
      const arr = getNestedValue(values, targetPath) || [];
      if (!Array.isArray(arr) || indexA < 0 || indexA >= arr.length || indexB < 0 || indexB >= arr.length) return;
      const copy = [...arr];
      const temp = copy[indexA];
      copy[indexA] = copy[indexB];
      copy[indexB] = temp;
      batch(() => {
        setNestedValue(values, targetPath, copy);
        const swapKeys = (stateMap: Record<string, any>) => {
          const prefix = \`\${targetPath}.\`;
          const updated = { ...stateMap };
          const prefixA = \`\${prefix}\${indexA}\`;
          const prefixB = \`\${prefix}\${indexB}\`;
          Object.keys(stateMap).forEach((key) => {
            if (key.startsWith(prefixA)) {
              const tail = key.substring(prefixA.length);
              const targetKey = \`\${prefixB}\${tail}\`;
              updated[targetKey] = stateMap[key];
              if (stateMap[targetKey] === undefined) delete updated[key];
            } else if (key.startsWith(prefixB)) {
              const tail = key.substring(prefixB.length);
              const targetKey = \`\${prefixA}\${tail}\`;
              updated[targetKey] = stateMap[key];
              if (stateMap[targetKey] === undefined) delete updated[key];
            }
          });
          return updated;
        };
        errors = swapKeys(errors);
        touched = swapKeys(touched);
        dirty = swapKeys(dirty);
        notify(\`\${targetPath}.\${indexA}\`);
        notify(\`\${targetPath}.\${indexB}\`);
      });
      runValidation([targetPath]);
    },

    reset: (newValues?: T) => {
      batch(() => {
        if (newValues) initialValues = deepClone(newValues);
        values = deepClone(initialValues);
        errors = {}; touched = {}; dirty = {};
        isSubmitting = false; isValidating = false;
      });
      connectionRegistry.forEach((ref, path) => {
        const el = ref.deref();
        if (el && 'value' in el) {
          const fresh = getNestedValue(values, path);
          if (el instanceof HTMLInputElement && el.type === 'checkbox') {
            if (el.hasAttribute('value')) el.checked = Array.isArray(fresh) && fresh.includes(el.value);
            else el.checked = !!fresh;
          } else if (el instanceof HTMLInputElement && el.type === 'radio') {
            el.checked = el.value === fresh;
          } else if (el instanceof HTMLSelectElement && el.multiple) {
            const arr = Array.isArray(fresh) ? fresh : [];
            Array.from(el.options).forEach((opt) => opt.selected = arr.includes(opt.value));
          } else if (el instanceof HTMLInputElement && (el.type === 'date' || el.type === 'datetime-local') && fresh instanceof Date) {
            el.value = fresh.toISOString().substring(0, 10);
          } else {
            (el as any).value = fresh !== undefined ? fresh : '';
          }
        }
      });
      notify();
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
    }
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
        if (val !== undefined) {
          setNestedValue(payload, path, val);
        }
      }
    }
  });
  return payload;
}
`);

// --- 3. HARNESS TESTS ---
write('packages/core/test/form.test.ts', `
import { describe, it, expect, vi } from 'vitest';
import { createForm } from '../src/index';

describe('@agnostic-web/form-core Engine Verification', () => {
  it('should initialize with deep-cloned values with no reference leak', () => {
    const initial = { profile: { name: 'Alice' } };
    const form = createForm({ initialValues: initial });
    form.set('profile.name', 'Bob');
    expect(form.get('profile.name')).toBe('Bob');
    expect(initial.profile.name).toBe('Alice');
  });

  it('should resolve transitive dependencies on single-keystroke inputs', async () => {
    const form = createForm({
      initialValues: { password: '', confirmPassword: '' },
      dependencies: { 'password': ['confirmPassword'] },
      validator: (values) => {
        const errors: Record<string, string> = {};
        if (values.password !== values.confirmPassword) errors['confirmPassword'] = 'Mismatch';
        return errors;
      }
    });
    form.set('password', 'secured123');
    await form.validate(['password']);
    expect(form.getState().errors['confirmPassword']).toBe('Mismatch');
  });
});
`);

// --- 4. ADAPTERS ---

// REACT ADAPTER
write('packages/adapters/react/package.json', JSON.stringify({
  name: "@agnostic-web/form-adapters-react",
  version: "1.0.0",
  type: "module",
  peerDependencies: {
    "react": "^18.0.0 || ^19.0.0"
  }
}, null, 2));

write('packages/adapters/react/src/index.ts', `
import { useSyncExternalStore, useCallback } from 'react';

export function useForm<T extends object>(form: any) {
  const state = useSyncExternalStore(form.subscribe, form.getState, form.getState);
  return {
    state,
    get: form.get,
    set: form.set,
    connect: form.connect,
    submit: form.submit,
    handleSubmit: form.handleSubmit,
    reset: form.reset
  };
}

export function useFormPath<T extends object>(form: any, path: string) {
  const subscribeToPath = useCallback((callback: () => void) => form.subscribeToPath(path, callback), [form, path]);
  const getPathValue = useCallback(() => form.get(path), [form, path]);
  return useSyncExternalStore(subscribeToPath, getPathValue, getPathValue);
}
`);

// SVELTE ADAPTER
write('packages/adapters/svelte/package.json', JSON.stringify({
  name: "@agnostic-web/form-adapters-svelte",
  version: "1.0.0",
  type: "module",
  peerDependencies: {
    "svelte": "^5.0.0"
  }
}, null, 2));

write('packages/adapters/svelte/src/index.ts', `
import { onDestroy } from 'svelte';

export function useSvelteForm<T extends object>(form: any) {
  let state = $state(form.getState());
  const unsubscribe = form.subscribe((s: any) => { state = s; });
  onDestroy(unsubscribe);
  return {
    get state() { return state; },
    get: form.get,
    set: form.set,
    connect: form.connect,
    submit: form.submit,
    handleSubmit: form.handleSubmit,
    reset: form.reset
  };
}
`);

// VUE ADAPTER
write('packages/adapters/vue/package.json', JSON.stringify({
  name: "@agnostic-web/form-adapters-vue",
  version: "1.0.0",
  type: "module",
  peerDependencies: {
    "vue": "^3.0.0"
  }
}, null, 2));

write('packages/adapters/vue/src/index.ts', `
import { shallowRef, onUnmounted } from 'vue';

export function useVueForm<T extends object>(form: any) {
  const state = shallowRef(form.getState());
  const unsubscribe = form.subscribe((s: any) => { state.value = s; });
  onUnmounted(unsubscribe);
  return {
    state,
    get: form.get,
    set: form.set,
    connect: form.connect,
    submit: form.submit,
    handleSubmit: form.handleSubmit,
    reset: form.reset
  };
}
`);

// SOLID ADAPTER
write('packages/adapters/solid/package.json', JSON.stringify({
  name: "@agnostic-web/form-adapters-solid",
  version: "1.0.0",
  type: "module",
  peerDependencies: {
    "solid-js": "^1.0.0"
  }
}, null, 2));

write('packages/adapters/solid/src/index.ts', `
import { createSignal, onCleanup } from 'solid-js';

export function useSolidForm<T extends object>(form: any) {
  const [state, setState] = createSignal(form.getState());
  const unsubscribe = form.subscribe((s: any) => { setState(s); });
  onCleanup(unsubscribe);
  return [
    state,
    {
      get: form.get,
      set: form.set,
      connect: form.connect,
      submit: form.submit,
      handleSubmit: form.handleSubmit,
      reset: form.reset
    }
  ] as const;
}
`);

// ANGULAR ADAPTER
write('packages/adapters/angular/package.json', JSON.stringify({
  name: "@agnostic-web/form-adapters-angular",
  version: "1.0.0",
  type: "module",
  peerDependencies: {
    "@angular/core": "^16.0.0 || ^17.0.0 || ^18.0.0"
  }
}, null, 2));

write('packages/adapters/angular/src/index.ts', `
import { signal, DestroyRef, inject } from '@angular/core';

export function useAngularForm<T extends object>(form: any) {
  const formSignal = signal(form.getState());
  const unsubscribe = form.subscribe((s: any) => { formSignal.set(s); });
  inject(DestroyRef).onDestroy(() => { unsubscribe(); });
  return {
    state: formSignal.asReadonly(),
    get: form.get,
    set: form.set,
    connect: form.connect,
    submit: form.submit,
    handleSubmit: form.handleSubmit,
    reset: form.reset
  };
}
`);

// --- 6. @agw/form ALIAS / WRAPPER PACKAGE ---

write('packages/alias/package.json', JSON.stringify({
  name: "@agw/form",
  version: "1.0.0",
  type: "module",
  exports: {
    "./core": {
      "types": "@agnostic-web/form-core",
      "import": "@agnostic-web/form-core"
    },
    "./adapters/react": {
      "types": "@agnostic-web/form-adapters-react",
      "import": "@agnostic-web/form-adapters-react"
    },
    "./adapters/svelte": {
      "types": "@agnostic-web/form-adapters-svelte",
      "import": "@agnostic-web/form-adapters-svelte"
    },
    "./adapters/vue": {
      "types": "@agnostic-web/form-adapters-vue",
      "import": "@agnostic-web/form-adapters-vue"
    },
    "./adapters/solid": {
      "types": "@agnostic-web/form-adapters-solid",
      "import": "@agnostic-web/form-adapters-solid"
    },
    "./adapters/angular": {
      "types": "@agnostic-web/form-adapters-angular",
      "import": "@agnostic-web/form-adapters-angular"
    }
  },
  dependencies: {
    "@agnostic-web/form-core": "workspace:^1.0.0",
    "@agnostic-web/form-adapters-react": "workspace:^1.0.0",
    "@agnostic-web/form-adapters-svelte": "workspace:^1.0.0",
    "@agnostic-web/form-adapters-vue": "workspace:^1.0.0",
    "@agnostic-web/form-adapters-solid": "workspace:^1.0.0",
    "@agnostic-web/form-adapters-angular": "workspace:^1.0.0"
  }
}, null, 2));

console.log('Workspace initialized successfully! Run "pnpm install" inside the root directory to download dependencies and configure package mapping links.');
