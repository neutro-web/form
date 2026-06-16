import type { FormAction, FormInstance, FormState } from './index.js';
import { isDeepEqual } from './index.js';

export interface DevtoolsOptions {
  name?: string;
  collapsed?: boolean;
}

export interface DevtoolsPanelOptions {
  name?: string;
  theme?: 'light' | 'dark' | 'auto';
  maxLogEntries?: number;
  collapsed?: boolean;
}

const BADGE_STYLE =
  'background:#6366f1;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold;font-size:11px;';
const DIM_STYLE = 'color:#888;font-weight:normal;';
const ACTION_STYLE = 'color:#f59e0b;font-weight:bold;';
const RESET_STYLE = 'color:inherit;font-weight:normal;';

function formatElapsed(ms: number): string {
  return ms < 1000 ? `+${ms}ms` : `+${(ms / 1000).toFixed(1)}s`;
}

function describeAction(action: FormAction): string {
  switch (action.type) {
    case 'SET':
      return `SET ${action.path}`;
    case 'VALIDATE':
      return action.paths ? `VALIDATE [${action.paths.join(', ')}]` : 'VALIDATE';
    case 'SUBMIT':
      return 'SUBMIT';
    case 'RESET':
      return 'RESET';
    case 'SET_ERRORS':
      return `SET_ERRORS [${Object.keys(action.errors).join(', ')}]`;
    case 'CLEAR_ERRORS':
      return 'CLEAR_ERRORS';
    case 'CONNECT':
      return `CONNECT ${action.path}`;
    case 'DISCONNECT':
      return `DISCONNECT ${action.path}`;
    case 'BLUR':
      return `BLUR ${action.path}`;
    case 'BATCH_START':
      return 'BATCH_START';
    case 'BATCH_END':
      return 'BATCH_END';
    case 'ARRAY_APPEND':
      return `ARRAY_APPEND ${action.path}`;
    case 'ARRAY_INSERT':
      return `ARRAY_INSERT ${action.path}[${action.index}]`;
    case 'ARRAY_REMOVE':
      return `ARRAY_REMOVE ${action.path}[${action.index}]`;
    case 'ARRAY_MOVE':
      return `ARRAY_MOVE ${action.path} ${action.from}→${action.to}`;
    case 'ARRAY_SWAP':
      return `ARRAY_SWAP ${action.path} [${action.i}↔${action.j}]`;
    default:
      return (action as any).type;
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
    rows.push({
      slice: 'meta',
      key: 'isSubmitting',
      prev: prev.isSubmitting,
      next: next.isSubmitting,
    });
  }
  if (prev.isValidating !== next.isValidating) {
    rows.push({
      slice: 'meta',
      key: 'isValidating',
      prev: prev.isValidating,
      next: next.isValidating,
    });
  }
  if (prev.isValid !== next.isValid) {
    rows.push({
      slice: 'meta',
      key: 'isValid',
      prev: prev.isValid,
      next: next.isValid,
    });
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
    BADGE_STYLE,
    name,
    RESET_STYLE,
    label,
    DIM_STYLE,
    timestamp,
    formatElapsed(elapsed)
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

const registeredForms = new WeakSet<FormInstance<any>>();

export function devtools<T extends object>(
  form: FormInstance<T>,
  options: DevtoolsOptions = {}
): () => void {
  if (registeredForms.has(form)) {
    console.warn(
      '[NeutroForm devtools] devtools() was called twice on the same form instance. Ignoring duplicate registration.'
    );
    return () => {};
  }
  registeredForms.add(form);

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

  const unsubscribe = form._subscribeToActions((action, state) => {
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
        BADGE_STYLE,
        name,
        RESET_STYLE,
        count,
        DIM_STYLE,
        timestamp,
        formatElapsed(elapsed)
      );
      const frozenTimeRef = { value: lastTimeRef.value };
      for (const { action: a, state: s, prev } of batchActions) {
        logAction(a, s, prev, name, groupFn, frozenTimeRef);
      }
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

  return () => {
    registeredForms.delete(form);
    unsubscribe();
  };
}

// Per-(form, container) registry to guard against duplicate mounts
const panelRegistry = new WeakMap<FormInstance<any>, WeakMap<HTMLElement, true>>();

export function createDevtoolsPanel(
  form: FormInstance<any>,
  container: HTMLElement,
  options: DevtoolsPanelOptions = {}
): () => void {
  if (typeof document === 'undefined') {
    console.warn('[NeutroForm devtools] createDevtoolsPanel called in SSR — no-op');
    return () => {};
  }

  if (!panelRegistry.has(form)) panelRegistry.set(form, new WeakMap());
  const formMap = panelRegistry.get(form)!;
  if (formMap.has(container)) {
    console.warn('[NeutroForm devtools] createDevtoolsPanel called twice on the same form+container — returning no-op; keep the unsubscribe returned by the first call');
    return () => {};
  }
  formMap.set(container, true);

  const name = options.name ?? 'Form';
  const maxLogEntries = options.maxLogEntries ?? 50;

  // --- Shadow DOM (fall back to light DOM if attachShadow is not available) ---
  let root: ShadowRoot | HTMLElement;
  try {
    root = container.attachShadow({ mode: 'open' });
  } catch {
    // Light DOM fallback — inject global style once
    if (!document.getElementById('neutro-devtools-panel-style')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'neutro-devtools-panel-style';
      styleEl.textContent = `
        .nf-panel { font-family: monospace; font-size: 12px; border: 1px solid #444; border-radius: 4px; overflow: hidden; }
        .nf-panel-header { background: #1e1e2e; color: #cdd6f4; padding: 6px 10px; display: flex; gap: 8px; align-items: center; cursor: pointer; }
        .nf-panel-body { background: #181825; color: #cdd6f4; padding: 8px; max-height: 400px; overflow-y: auto; }
        .nf-badge { font-size: 10px; padding: 1px 5px; border-radius: 3px; background: #313244; }
        .nf-badge-valid { background: #a6e3a1; color: #1e1e2e; }
        .nf-badge-invalid { background: #f38ba8; color: #1e1e2e; }
        .nf-section-title { color: #89b4fa; font-weight: bold; margin: 4px 0 2px; }
        .nf-log-entry { border-bottom: 1px solid #313244; padding: 2px 0; }
        .nf-log-type { color: #f38ba8; }
      `;
      document.head.appendChild(styleEl);
    }
    root = container;
  }

  // --- Build panel DOM ---
  const panel = document.createElement('div');
  panel.className = 'nf-panel';

  const header = document.createElement('div');
  header.className = 'nf-panel-header';
  header.appendChild(document.createTextNode(`NeutroForm: ${name}`));

  const validBadge = document.createElement('span');
  validBadge.className = 'nf-badge';
  header.appendChild(validBadge);

  const submittingBadge = document.createElement('span');
  submittingBadge.className = 'nf-badge';
  header.appendChild(submittingBadge);

  const validatingBadge = document.createElement('span');
  validatingBadge.className = 'nf-badge';
  header.appendChild(validatingBadge);

  const body = document.createElement('div');
  body.className = 'nf-panel-body';
  if (options.collapsed) body.style.display = 'none';

  header.addEventListener('click', () => {
    body.style.display = body.style.display === 'none' ? '' : 'none';
  });

  // State section
  const stateTitle = document.createElement('div');
  stateTitle.className = 'nf-section-title';
  stateTitle.textContent = 'State';
  body.appendChild(stateTitle);

  const stateNode = document.createElement('pre');
  stateNode.style.margin = '0';
  body.appendChild(stateNode);

  // Action log section
  const logTitle = document.createElement('div');
  logTitle.className = 'nf-section-title';
  logTitle.textContent = 'Action log';
  body.appendChild(logTitle);

  const logList = document.createElement('div');
  body.appendChild(logList);

  panel.appendChild(header);
  panel.appendChild(body);
  root.appendChild(panel);

  // --- Helpers ---
  const updateBadges = (state: FormState<any>) => {
    const iv = state.isValid;
    validBadge.textContent = iv === null ? 'unknown' : iv ? 'valid' : 'invalid';
    validBadge.className = `nf-badge ${iv === true ? 'nf-badge-valid' : iv === false ? 'nf-badge-invalid' : ''}`;
    submittingBadge.textContent = state.isSubmitting ? 'submitting' : '';
    submittingBadge.style.display = state.isSubmitting ? '' : 'none';
    validatingBadge.textContent = state.isValidating ? 'validating…' : '';
    validatingBadge.style.display = state.isValidating ? '' : 'none';
  };

  const updateState = (state: FormState<any>) => {
    // Use textContent — never innerHTML — to safely render user-controlled JSON
    stateNode.textContent = JSON.stringify(
      { values: state.values, errors: state.errors, touched: state.touched, dirty: state.dirty },
      null,
      2
    );
  };

  const appendLog = (action: FormAction) => {
    const entry = document.createElement('div');
    entry.className = 'nf-log-entry';
    const typeSpan = document.createElement('span');
    typeSpan.className = 'nf-log-type';
    typeSpan.textContent = action.type;
    entry.appendChild(typeSpan);
    entry.appendChild(document.createTextNode(` ${new Date().toLocaleTimeString()}`));
    logList.insertBefore(entry, logList.firstChild);
    while (logList.children.length > maxLogEntries) {
      logList.removeChild(logList.lastChild!);
    }
  };

  // --- Initial render ---
  const initialState = form.getState();
  updateBadges(initialState);
  updateState(initialState);

  // --- Subscriptions ---
  const unsubState = form.subscribe((state) => {
    updateBadges(state);
    updateState(state);
  });

  const unsubActions = form._subscribeToActions((action) => {
    if (action.type === 'BATCH_START' || action.type === 'BATCH_END') return;
    appendLog(action);
  });

  return () => {
    formMap.delete(container);
    unsubState();
    unsubActions();
    root.replaceChildren();
  };
}
