/**
 * DOM bridge (connect/focus/aria/mutation-observer pruning + payload extraction).
 *
 * Extracted from `createForm`'s closure body (packages/core/src/index.ts) as
 * part of the modular-bundle-splitting effort. `attachDomBridge` is called
 * once, right after `createForm` constructs its `ctx` object, and returns
 * `connect`/`focus`/`focusFirstError`/`getAriaProps`/`getConnectedCount` for
 * the caller to assign onto the form instance.
 *
 * `_getPayload` is a free function (not a hook) that reads only its
 * parameters — it is exported here so `index.ts`'s `submit`/`getPayload`
 * methods, which remain engine-level and call it directly, can import it.
 */
import type { FormEngineContext } from '../engine.js';
import type { AriaProps, AriaPropsOptions, ConnectOptions, FormConfig, Path } from '../index.js';
import { deepClone, getNestedValue, setNestedValue } from '../index.js';

export function _getPayload<T>(
  values: T,
  registry: Map<string, WeakRef<HTMLElement>>,
  connected: Set<string>,
  persisted: Set<string>
): Partial<T> {
  if (connected.size === 0 && persisted.size === 0) {
    return deepClone(values) as Partial<T>;
  }
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

export function attachDomBridge<T extends object>(
  ctx: FormEngineContext<T>,
  _config: FormConfig<T>
) {
  ctx.isFieldRequired = (path: string): boolean => {
    // Only checks for the built-in 'required' rule; requiredIf/requiredUnless object rules are intentionally excluded.
    const fieldRules = ctx.config.rules?.[path];
    if (!fieldRules) return false;
    return Array.isArray(fieldRules)
      ? (fieldRules as (string | object)[]).includes('required')
      : fieldRules === 'required';
  };

  const initMutationObserver = () => {
    if (ctx.mutationObserver || typeof window === 'undefined' || typeof document === 'undefined')
      return;
    ctx.mutationObserver = new MutationObserver((mutations) => {
      const clearedPaths: string[] = [];
      mutations.forEach((mutation) => {
        mutation.removedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          ctx.connectionRegistry.forEach((ref, path) => {
            const el = ref.deref();
            if (!el || node.contains(el)) {
              ctx.connectionRegistry.delete(path);
              ctx.connectedPaths.delete(path);
              if (!ctx.persistedPaths.has(path)) {
                delete ctx.errors[path];
                ctx.unindexKey(path);
                delete ctx.touched[path];
                ctx.unindexKey(path);
                delete ctx.dirty[path];
                ctx.unindexKey(path);
                clearedPaths.push(path);
              }
            }
          });
        });
      });
      if (clearedPaths.length > 0) {
        if (ctx.globalSubscribers.size > 0) {
          ctx.notifyGlobalSubscribers(ctx.getState());
        }
        ctx.notifyPathSubscribers(clearedPaths);
      }
    });
    ctx.mutationObserver.observe(document.body, { childList: true, subtree: true });
  };

  const focus = (path: string): boolean => {
    const ref = ctx.connectionRegistry.get(path);
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
    const errorPaths = Object.keys(ctx.errors);
    if (errorPaths.length === 0) return false;

    const connected = errorPaths
      .map((p) => {
        const ref = ctx.connectionRegistry.get(p);
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
    ctx.__warnUnknownPath(stringPath);
    const mode = ctx.resolveFieldMode(stringPath, options.validateOn);
    initMutationObserver();
    ctx.connectionRegistry.set(stringPath, new WeakRef(element));
    ctx.connectedPaths.add(stringPath);
    if (options.persist) ctx.persistedPaths.add(stringPath);

    element.setAttribute('aria-invalid', ctx.errors[stringPath] ? 'true' : 'false');
    if (ctx.isFieldRequired(stringPath)) {
      element.setAttribute('aria-required', 'true');
    }

    const syncValueFromDOM = (e: Event) => {
      const target = e.target as HTMLInputElement | HTMLSelectElement;
      let rawVal: any;
      if (target.type === 'checkbox') {
        const checkbox = target as HTMLInputElement;
        if (checkbox.hasAttribute('value')) {
          const currentArray = (getNestedValue(ctx.values, stringPath) as any[]) || [];
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
        ctx.setFieldValue(stringPath, rawVal, { touch: true });
        ctx.runValidation([stringPath]);
      } else if (mode === 'onTouched' && ctx.touched[stringPath]) {
        ctx.setFieldValue(stringPath, rawVal);
        ctx.runValidation([stringPath]);
      } else {
        ctx.setFieldValue(stringPath, rawVal);
      }
    };

    const handleBlur = () => {
      const wasTouched = stringPath in ctx.touched;
      ctx.touched[stringPath] = true;
      if (!wasTouched) ctx.indexKey(stringPath);
      ctx.dispatchAction({ type: 'BLUR', path: stringPath });
      if (mode === 'onBlur' || mode === 'onTouched') {
        ctx.runValidation([stringPath]);
      } else {
        ctx.notify(stringPath);
      }
    };

    element.addEventListener('input', syncValueFromDOM);
    element.addEventListener('change', syncValueFromDOM);
    element.addEventListener('blur', handleBlur);

    const cachedValue = getNestedValue(ctx.values, stringPath);
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

    const unsubscribeA11y = ctx.subscribeToPath(stringPath, (_, fieldState) => {
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

    ctx.notify(stringPath);
    ctx.dispatchAction({ type: 'CONNECT', path: stringPath });
    return () => {
      element.removeEventListener('input', syncValueFromDOM);
      element.removeEventListener('change', syncValueFromDOM);
      element.removeEventListener('blur', handleBlur);
      unsubscribeA11y();
      ctx.connectionRegistry.delete(stringPath);
      ctx.connectedPaths.delete(stringPath);
      ctx.dispatchAction({ type: 'DISCONNECT', path: stringPath });
      ctx.notify(stringPath);
    };
  };

  const getAriaProps = (path: Path<T> | string, options?: AriaPropsOptions): AriaProps => {
    const stringPath = path as string;
    const hasError = Boolean(ctx.errors[stringPath]);
    const id = options?.errorId ?? `error-${stringPath.replace(/\./g, '-')}`;

    let ariaRequired: true | undefined;
    if (options?.required === true) {
      ariaRequired = true;
    } else if (options?.required !== false && ctx.isFieldRequired(stringPath)) {
      ariaRequired = true;
    }

    return {
      'aria-invalid': hasError ? 'true' : 'false',
      'aria-describedby': hasError ? id : undefined,
      'aria-required': ariaRequired,
    };
  };

  const getConnectedCount = (): number => ctx.connectionRegistry.size;

  return { connect, focus, focusFirstError, getAriaProps, getConnectedCount };
}
