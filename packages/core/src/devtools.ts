import type { FormInstance, FormAction, FormState } from './index.js';
import { isDeepEqual } from './index.js';

export interface DevtoolsOptions {
  name?: string;
  collapsed?: boolean;
}

const BADGE_STYLE = 'background:#6366f1;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold;font-size:11px;';
const DIM_STYLE = 'color:#888;font-weight:normal;';
const ACTION_STYLE = 'color:#f59e0b;font-weight:bold;';
const RESET_STYLE = 'color:inherit;font-weight:normal;';

function formatElapsed(ms: number): string {
  return ms < 1000 ? `+${ms}ms` : `+${(ms / 1000).toFixed(1)}s`;
}

function describeAction(action: FormAction): string {
  switch (action.type) {
    case 'SET': return `SET ${action.path}`;
    case 'VALIDATE': return action.paths ? `VALIDATE [${action.paths.join(', ')}]` : 'VALIDATE';
    case 'SUBMIT': return 'SUBMIT';
    case 'RESET': return 'RESET';
    case 'SET_ERRORS': return `SET_ERRORS [${Object.keys(action.errors).join(', ')}]`;
    case 'CONNECT': return `CONNECT ${action.path}`;
    case 'DISCONNECT': return `DISCONNECT ${action.path}`;
    case 'BLUR': return `BLUR ${action.path}`;
    case 'BATCH_START': return 'BATCH_START';
    case 'BATCH_END': return 'BATCH_END';
    case 'ARRAY_APPEND': return `ARRAY_APPEND ${action.path}`;
    case 'ARRAY_INSERT': return `ARRAY_INSERT ${action.path}[${action.index}]`;
    case 'ARRAY_REMOVE': return `ARRAY_REMOVE ${action.path}[${action.index}]`;
    case 'ARRAY_MOVE': return `ARRAY_MOVE ${action.path} ${action.from}→${action.to}`;
    case 'ARRAY_SWAP': return `ARRAY_SWAP ${action.path} [${action.i}↔${action.j}]`;
    default: return (action as any).type;
  }
}

function computeDiff(
  prev: FormState<any>,
  next: FormState<any>
): Array<{ slice: string; key: string; prev: unknown; next: unknown }> {
  const rows: Array<{ slice: string; key: string; prev: unknown; next: unknown }> = [];
  const slices = ['values', 'errors', 'touched', 'dirty'] as const;
  for (const slice of slices) {
    const prevSlice = prev[slice] as Record<string, unknown>;
    const nextSlice = next[slice] as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(prevSlice), ...Object.keys(nextSlice)]);
    for (const key of allKeys) {
      const p = prevSlice[key];
      const n = nextSlice[key];
      const equal = slice === 'values' ? isDeepEqual(p, n) : p === n;
      if (!equal) rows.push({ slice, key, prev: p, next: n });
    }
  }
  if (prev.isSubmitting !== next.isSubmitting) {
    rows.push({ slice: 'meta', key: 'isSubmitting', prev: prev.isSubmitting, next: next.isSubmitting });
  }
  if (prev.isValidating !== next.isValidating) {
    rows.push({ slice: 'meta', key: 'isValidating', prev: prev.isValidating, next: next.isValidating });
  }
  return rows;
}

function logAction(
  action: FormAction,
  state: FormState<any>,
  prev: FormState<any>,
  name: string,
  groupFn: typeof console.group,
  lastTimeRef: { value: number }
): void {
  const now = Date.now();
  const elapsed = now - lastTimeRef.value;
  lastTimeRef.value = now;
  const label = describeAction(action);
  const timestamp = new Date(now).toLocaleTimeString('en', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  } as Intl.DateTimeFormatOptions);

  groupFn(
    '%c NeutroForm: %s %c %s %c %s  %s',
    BADGE_STYLE, name, RESET_STYLE, label, DIM_STYLE, timestamp, formatElapsed(elapsed)
  );
  console.log('%c action', ACTION_STYLE, action);
  const diff = computeDiff(prev, state);
  if (diff.length > 0) {
    console.table(diff);
  } else {
    console.log('%c no state change', DIM_STYLE);
  }
  console.groupCollapsed('%c full state', DIM_STYLE);
  console.log('%o', state);
  console.groupEnd();
  console.groupEnd();
}

export function devtools<T extends object>(
  form: FormInstance<T>,
  options: DevtoolsOptions = {}
): () => void {
  const name = options.name ?? 'Form';
  const collapsed = options.collapsed ?? true;
  const groupFn = collapsed ? console.groupCollapsed.bind(console) : console.group.bind(console);

  let prevState = form.getState();
  const lastTimeRef = { value: Date.now() };
  let inBatch = false;
  let batchActions: Array<{ action: FormAction; state: FormState<T>; prev: FormState<T> }> = [];

  // Initialization log
  groupFn('%c NeutroForm: %s %c init', BADGE_STYLE, name, RESET_STYLE);
  console.log('%c initial state', DIM_STYLE, form.getState());
  console.groupEnd();

  return form._subscribeToActions((action, state) => {
    if (action.type === 'BATCH_START') {
      inBatch = true;
      batchActions = [];
      return;
    }

    if (action.type === 'BATCH_END') {
      inBatch = false;
      const count = batchActions.length;
      if (count === 0) {
        batchActions = [];
        return;
      }
      const now = Date.now();
      const elapsed = now - lastTimeRef.value;
      lastTimeRef.value = now;
      const timestamp = new Date(now).toLocaleTimeString('en', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      } as Intl.DateTimeFormatOptions);

      groupFn(
        '%c NeutroForm: %s %c BATCH (%d mutations) %c %s  %s',
        BADGE_STYLE, name, RESET_STYLE, count, DIM_STYLE, timestamp, formatElapsed(elapsed)
      );
      const frozenTimeRef = { value: lastTimeRef.value };
      batchActions.forEach(({ action: a, state: s, prev }: { action: FormAction; state: FormState<T>; prev: FormState<T> }) =>
        logAction(a, s, prev, name, groupFn, frozenTimeRef)
      );
      console.groupEnd();
      batchActions = [];
      return;
    }

    if (inBatch) {
      batchActions.push({ action, state, prev: prevState });
      prevState = state;
      return;
    }

    const prev = prevState;
    prevState = state;
    logAction(action, state, prev, name, groupFn, lastTimeRef);
  });
}
