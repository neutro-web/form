/**
 * Engine core (Task 12 of the modular-bundle-splitting effort).
 *
 * `createCoreForm` is the shared full+minimal engine: the six tracked
 * structures, notification/batching machinery, async validation,
 * submit/reset/destroy, and the `_debug*` accessors. It deliberately does
 * NOT wire up computed fields (`attachComputedFields`) — that stays
 * full-tier-only and is attached by `index.ts`'s `createForm` wrapper AFTER
 * `createCoreForm` returns. `ctx.isComputedField`/`hasComputedFields`/
 * `runComputedPass` are left at their no-op defaults here.
 *
 * `minimal.ts` calls `createCoreForm` directly and returns `instance`
 * unchanged — no computed fields, array-ops, dom-bridge, or persistence.
 */
import { _getPayload } from './features/dom-bridge.js';
import {
  applyBuiltInRules,
  type BuiltInRule,
  compileDependencyScopes,
  DANGEROUS_PATH_KEYS,
  deepClone,
  extractAllPaths,
  type FormAction,
  type FormConfig,
  type FormState,
  type FormSubscriber,
  getNestedValue,
  isDeepEqual,
  type MinimalFormInstance,
  type Path,
  type PathSubscriber,
  type ResetFieldOptions,
  type SetOptions,
  setNestedValue,
  type ValidationMode,
} from './index.js';
import { buildPathTrie, isKnownPath } from './path-trie.js';

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

// ---------------------------------------------------------------------------
// Wildcard dependency helpers (private to runValidation)
// ---------------------------------------------------------------------------

interface WildcardDependency {
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

// Sentinel key for a full-form (unscoped) validation's AbortController in
// ctx.activeAbortControllers, which is otherwise keyed by real field paths.
// No real field path can equal '*' (it's not a valid dot-path segment), so
// this can't collide with a scoped entry.
const FULL_VALIDATION_KEY = '*';

// ---------------------------------------------------------------------------
// createCoreForm
// ---------------------------------------------------------------------------

export function createCoreForm<T extends object>(
  config: FormConfig<T>
): { ctx: FormEngineContext<T>; instance: MinimalFormInstance<T> } {
  // `values`/`initialValues` are the sole two documented exceptions kept as
  // standalone `const` (not inlined into ctx below, not deleted): several
  // top-level statements between here and `ctx`'s declaration (the
  // compileDependencyScopes call, the dev path-trie build) read them
  // immediately, before `ctx` exists — see the comments at those call sites.
  const initialValues = deepClone(config.initialValues);
  const values = deepClone(initialValues);

  // The four tracked state records are declared as standalone `const`s (like
  // `values`/`initialValues` above) rather than inlined as `{}` literals in the
  // `ctx` object below. This is a hot-path optimization, NOT a change to the
  // mutation invariant: these bindings are never reassigned (reset() and every
  // array op mutate them in place), so `ctx.errors === errors` holds for the
  // life of the form. Hot closures (`setFieldValue`) can therefore read the
  // record via a direct lexical variable instead of a `ctx.<prop>` lookup on
  // the ~60-property ctx object — restoring the pre-modular-split access shape.
  const errors: Record<string, string> = {};
  const touched: Record<string, boolean> = {};
  const dirty: Record<string, boolean> = {};
  const wasSet: Record<string, boolean> = {};

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
      } else {
        // Full-form (unscoped) validation: abort any prior full-form run so its
        // in-flight async work (e.g. a network call) is actually cancelled, not
        // just superseded via the activeEpoch check below. Previously this
        // sentinel was never populated, so a superseded full run's validator
        // kept running to completion for nothing -- its result was correctly
        // discarded by the epoch check, but the work itself was never aborted.
        ctx.activeAbortControllers.get(FULL_VALIDATION_KEY)?.abort();
        ctx.activeAbortControllers.delete(FULL_VALIDATION_KEY);
      }
      abortController = new AbortController();
      if (expandedScope) {
        for (const path of expandedScope) ctx.activeAbortControllers.set(path, abortController);
      } else {
        ctx.activeAbortControllers.set(FULL_VALIDATION_KEY, abortController);
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
      } else {
        ctx.activeAbortControllers.delete(FULL_VALIDATION_KEY);
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
    const hasComputed = ctx.hasComputedFields();
    if (hasComputed && ctx.isComputedField(path)) {
      if (!__isProdLocal) {
        console.warn(`[NeutroForm] "${path}" is a computed field — set() is a no-op.`);
      }
      return;
    }
    // Hot path: read tracked state (`values`/`initialValues`/`wasSet`/`dirty`/
    // `touched`) and cross-cluster primitives (`indexKey`/`unindexKey`/`batch`)
    // via direct lexical bindings rather than `ctx.<prop>`. Every one of these
    // is the SAME object/function stored on `ctx` (never reassigned), so this is
    // purely an access-path change that restores the pre-modular-split closure-
    // variable shape. The 4 hook slots (isComputedField/hasComputedFields/
    // runComputedPass and, below, runValidation/notify*) stay on `ctx` because
    // attachComputedFields overrides them after createCoreForm returns.
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
    if (hasComputed) {
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
        notifyPathSubscribers([path, ...changedComputedPaths]);
        if (ctx.globalSubscribers.size > 0) {
          notifyGlobalSubscribers(getState());
        }
      }
    } else {
      notify(path);
    }
    if (options.validate === true) ctx.runValidation([path]);
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

  // ctx must be declared after all of its referenced consts exist (runValidation,
  // dispatchAction, notify, batch, subscribe, indexKey, unindexKey, getState,
  // resolveFieldMode, setFieldValue, subscribeToPath, __warnUnknownPath,
  // isFieldRequired) — a const here referencing them earlier would hit TDZ.
  // Data fields below are inlined directly (not shorthand aliases to a bare
  // `let`/`const` of the same name); the isComputedField/hasComputedFields/
  // runComputedPass/onReset/isFieldRequired hooks are left at their no-op
  // defaults — attachComputedFields/attachPersistence/attachDomBridge install
  // the real overrides from index.ts, AFTER createCoreForm returns.
  const ctx: FormEngineContext<T> = {
    values,
    initialValues,
    errors,
    touched,
    dirty,
    wasSet,
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
    transientPaths: [], // populated by attachComputedFields (full-tier only, see index.ts)
    isComputedField: () => false, // no-op default; attachComputedFields installs the real override
    runComputedPass: () => [], // no-op default; attachComputedFields installs the real override
    hasComputedFields: () => false, // no-op default; attachComputedFields installs the real override
    onReset: () => {}, // no-op default; attachPersistence installs the real override
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

  const get = (path: Path<T> | string | string[]) => {
    const targetPath = Array.isArray(path) ? path.join('.') : path;
    __warnUnknownPath(targetPath);
    return getNestedValue(values, targetPath);
  };

  const set = ((path: any, val: any, options?: SetOptions) => {
    const targetPath = Array.isArray(path) ? path.join('.') : path;
    __warnUnknownPath(targetPath);
    setFieldValue(targetPath, val, options);
    dispatchAction({ type: 'SET', path: targetPath, value: val, options });
  }) as MinimalFormInstance<T>['set'];

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
  // in the Task 6 brief) — this is the public FormInstance/MinimalFormInstance method,
  // wrapping the internal ctx.batch() with BATCH_START/BATCH_END action dispatches.
  const batchPublic = (fn: () => void) => {
    ctx.dispatchAction({ type: 'BATCH_START' });
    try {
      ctx.batch(fn);
    } finally {
      ctx.dispatchAction({ type: 'BATCH_END' });
    }
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

  const instance: MinimalFormInstance<T> = {
    subscribe,
    subscribeToPath,
    subscribeToPathDynamic,
    get,
    set,
    validate,
    submit,
    handleSubmit,
    getState,
    getPayload,
    setDynamic,
    getDynamic,
    batch: batchPublic,
    reset,
    resetField,
    destroy,
    setErrors,
    clearErrors,
    getFieldMode,
    isDirty,
    isFieldDirty,
    isFieldValid,
    watch,
    _subscribeToActions,
    _debugPathIndex,
    _debugIndexKey,
    _debugUnindexKey,
    _debugRawState,
  };

  return { ctx, instance };
}
