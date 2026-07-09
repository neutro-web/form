/**
 * Computed / Derived Fields (v0.4.0 stable API).
 *
 * Extracted from `createForm`'s closure body (packages/core/src/index.ts) as
 * part of the modular-bundle-splitting effort. `attachComputedFields` is
 * called once, right after `createForm` constructs its `ctx` object, and
 * overrides the no-op `isComputedField`/`hasComputedFields`/`runComputedPass`
 * defaults installed in the `ctx` literal with real implementations, and
 * populates `ctx.transientPaths` in place.
 */
import {
  __isProduction,
  DANGEROUS_PATH_KEYS,
  type FormConfig,
  type FormEngineContext,
  getNestedValue,
  isDeepEqual,
  setNestedValue,
} from '../index.js';

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

export function attachComputedFields<T extends object>(
  ctx: FormEngineContext<T>,
  config: FormConfig<T>
): void {
  // Re-evaluate production flag per form instance so tests can toggle NODE_ENV between instances.
  const __isProdLocal = ((): boolean => {
    try {
      return (globalThis as any).process?.env?.NODE_ENV === 'production';
    } catch {
      return false;
    }
  })();

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
  ctx.transientPaths.length = 0;
  for (const [path, { transient }] of computedMap) {
    if (transient) ctx.transientPaths.push(path);
  }

  ctx.isComputedField = (path: string) => computedMap.has(path);
  ctx.hasComputedFields = () => computedMap.size > 0;

  /**
   * Re-evaluates all computed fields against current `ctx.values`.
   * Runs up to `computedPassLimit` passes (default 5) to resolve chained
   * dependencies. Fields are updated in-place per pass, so forward-declared chains
   * (b before c when c depends on b) resolve in a single pass. Reverse-declared
   * chains need one extra pass — with the default limit of 5 any acyclic chain up
   * to 5 levels deep resolves regardless of declaration order.
   * Emits a console.warn if the fields never stabilize (circular dependency).
   * Returns an array of unique paths whose ctx.values changed.
   */
  ctx.runComputedPass = (): string[] => {
    if (computedMap.size === 0) return [];
    const limit = computedPassLimit;
    const changedPathsSet = new Set<string>();
    let stabilized = false;
    for (let pass = 0; pass < limit; pass++) {
      let passChanged = false;
      for (const [path, { fn }] of computedMap) {
        let newVal: unknown;
        try {
          newVal = fn(ctx.values);
        } catch (err) {
          if (!__isProdLocal) {
            console.error(`[NeutroForm] computed fn for "${path}" threw an error:`, err);
          }
          continue;
        }
        if (!isDeepEqual(newVal, getNestedValue(ctx.values, path))) {
          setNestedValue(ctx.values, path, newVal);
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
          if (!isDeepEqual(fn(ctx.values), getNestedValue(ctx.values, path))) {
            stillChangingPaths.push(path);
          }
        } catch {
          // ignore ctx.errors in check-only pass
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
}
