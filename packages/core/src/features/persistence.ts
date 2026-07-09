/**
 * Persistence (hydrate/write-on-change/reset integration).
 *
 * Extracted from `createForm`'s closure body (packages/core/src/index.ts) as
 * part of the modular-bundle-splitting effort. `attachPersistence` is called
 * once, right after `createForm` constructs its `ctx` object, and overrides
 * the no-op `ctx.onReset` default installed in the `ctx` literal with a real
 * implementation that writes/clears the persistence adapter on reset. It
 * returns `hydrate`, which the caller assigns onto the form instance.
 */
import type { FormEngineContext } from '../engine.js';
import { deepClone, type FormConfig } from '../index.js';

export function attachPersistence<T extends object>(
  ctx: FormEngineContext<T>,
  config: FormConfig<T>
): { hydrate: () => Promise<void> } {
  ctx.onReset = (newValues?: T) => {
    const cfg = ctx.config.persistence;
    // Only write to the adapter if hydrate() has run — ctx.persistenceUnsubscribe is null until then.
    if (cfg && ctx.persistenceUnsubscribe !== null) {
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
  };

  const hydrate = async (): Promise<void> => {
    const cfg = ctx.config.persistence;
    if (!cfg) return;
    if (ctx.isHydrating) return;
    ctx.isHydrating = true;
    let stored: T | null | undefined;
    try {
      stored = await cfg.adapter.read();
    } catch (err) {
      console.error('[NeutroForm persistence] read() failed, using ctx.initialValues:', err);
      ctx.isHydrating = false;
      return;
    }
    if (stored != null) {
      const excludeSet = new Set((cfg.exclude ?? []) as string[]);
      const filteredStored: any = ctx.deepMerge({}, stored);
      for (const p of excludeSet) {
        const parts = (p as string).split('.');
        let obj = filteredStored;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!obj || typeof obj !== 'object') break;
          obj = obj[parts[i]];
        }
        if (obj && typeof obj === 'object') delete obj[parts[parts.length - 1]];
      }
      const merged = ctx.deepMerge(ctx.config.initialValues, filteredStored) as T;
      ctx.batch(() => {
        const newInitial = deepClone(merged);
        for (const key of Object.keys(ctx.initialValues)) delete (ctx.initialValues as any)[key];
        Object.assign(ctx.initialValues, newInitial);
        const newVals = deepClone(ctx.initialValues);
        for (const key of Object.keys(ctx.values)) delete (ctx.values as any)[key];
        Object.assign(ctx.values, newVals);
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
        ctx.isSubmitting = false;
        ctx.isValidating = false;
        ctx.hasValidated = false;
      });
      if (ctx.globalSubscribers.size > 0) {
        ctx.notifyGlobalSubscribers(ctx.getState());
      }
      ctx.notifyPathSubscribers([...ctx.pathSubscribers.keys()].filter((p) => p !== '*'));
    }
    // Install write subscription AFTER hydration completes.
    // Cancel any prior subscription first (guards against double-hydrate).
    ctx.persistenceUnsubscribe?.();
    ctx.persistenceUnsubscribe = null;

    const buildToWrite = (state: ReturnType<typeof ctx.getState>): T => {
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
      // ctx.subscribe() calls the callback synchronously on registration; skip that initial invocation.
      let skipFirst = true;
      ctx.persistenceUnsubscribe = ctx.subscribe((state) => {
        if (skipFirst) {
          skipFirst = false;
          return;
        }
        const toWrite = buildToWrite(state);
        if (ctx.persistenceWriteTimer !== null) clearTimeout(ctx.persistenceWriteTimer);
        ctx.persistenceWriteTimer = setTimeout(() => {
          ctx.persistenceWriteTimer = null;
          Promise.resolve(cfg.adapter.write(toWrite)).catch((err: unknown) => {
            console.error('[NeutroForm persistence] write() failed:', err);
          });
        }, cfg.debounceMs ?? 300);
      });
    } else {
      // ctx.subscribe() calls the callback synchronously on registration; skip that initial invocation.
      let skipFirst = true;
      ctx.persistenceUnsubscribe = ctx.subscribe((state) => {
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
    ctx.isHydrating = false;
  };

  return { hydrate };
}
