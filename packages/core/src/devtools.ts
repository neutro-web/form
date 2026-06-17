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
  /** Start with the panel collapsed (floating mode: panel hidden; inline mode: body hidden). Default: false */
  collapsed?: boolean;
  /** If provided, mount inline inside this element. If omitted, creates a floating fixed overlay appended to document.body. */
  container?: HTMLElement;
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

// Floating-mode registry: one floating panel per form instance
const floatingRegistry = new WeakSet<FormInstance<any>>();
// Inline-mode registry: tracks (form, container) pairs
const inlinePanelRegistry = new WeakMap<FormInstance<any>, WeakSet<HTMLElement>>();

export function createNeutroFormDevtoolsPanel(
  form: FormInstance<any>,
  options: DevtoolsPanelOptions = {}
): () => void {
  if (typeof document === 'undefined') {
    console.warn('[NeutroForm devtools] createNeutroFormDevtoolsPanel called in SSR — no-op');
    return () => {};
  }

  const name = options.name ?? 'Form';
  const maxLogEntries = options.maxLogEntries ?? 50;
  const floatingMode = !options.container;

  // ── Duplicate guard ──────────────────────────────────────────────────────
  if (floatingMode) {
    if (floatingRegistry.has(form)) {
      console.warn(
        '[NeutroForm devtools] A floating panel is already mounted for this form — returning no-op; keep the unsubscribe returned by the first call'
      );
      return () => {};
    }
    floatingRegistry.add(form);
  } else {
    const container = options.container as HTMLElement;
    if (!inlinePanelRegistry.has(form)) inlinePanelRegistry.set(form, new WeakSet());
    const formSet = inlinePanelRegistry.get(form) as WeakSet<HTMLElement>;
    if (formSet.has(container)) {
      console.warn(
        '[NeutroForm devtools] createNeutroFormDevtoolsPanel called twice on the same form+container — returning no-op; keep the unsubscribe returned by the first call'
      );
      return () => {};
    }
    formSet.add(container);
  }

  // ── Shared DOM refs ──────────────────────────────────────────────────────
  let stateNode: HTMLPreElement;
  let logList: HTMLElement;
  let validBadge: HTMLElement;
  let submittingBadge: HTMLElement;
  let validatingBadge: HTMLElement;
  let root: HTMLElement | ShadowRoot;

  if (floatingMode) {
    // ── Floating overlay ───────────────────────────────────────────────────
    const wrapper = document.createElement('div');
    wrapper.style.cssText =
      'position:fixed;bottom:16px;right:16px;z-index:2147483647;font-family:"SF Mono",Menlo,monospace;font-size:12px;';
    document.body.appendChild(wrapper);
    root = wrapper;

    let panelOpen = options.collapsed !== true;

    const panelEl = document.createElement('div');
    panelEl.style.cssText = [
      'width:320px;max-height:500px;display:' +
        (panelOpen ? 'flex' : 'none') +
        ';flex-direction:column;',
      'background:#1e1e2e;color:#cdd6f4;border:1px solid #45475a;border-radius:8px;',
      'margin-bottom:8px;box-shadow:0 8px 32px rgba(0,0,0,.6);overflow:hidden;',
    ].join('');

    // Header
    const headerEl = document.createElement('div');
    headerEl.style.cssText =
      'background:#181825;padding:8px 12px;border-bottom:1px solid #45475a;display:flex;align-items:center;gap:6px;flex-shrink:0;';

    const titleEl = document.createElement('span');
    titleEl.style.cssText =
      'font-weight:bold;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    titleEl.textContent = `NeutroForm: ${name}`;
    headerEl.appendChild(titleEl);

    validBadge = document.createElement('span');
    validBadge.style.cssText =
      'font-size:10px;padding:1px 6px;border-radius:10px;white-space:nowrap;background:#313244;color:#cdd6f4;';
    headerEl.appendChild(validBadge);

    submittingBadge = document.createElement('span');
    submittingBadge.style.cssText =
      'font-size:10px;padding:1px 6px;border-radius:10px;white-space:nowrap;background:#fab387;color:#1e1e2e;display:none;';
    submittingBadge.textContent = 'submitting';
    headerEl.appendChild(submittingBadge);

    validatingBadge = document.createElement('span');
    validatingBadge.style.cssText =
      'font-size:10px;padding:1px 6px;border-radius:10px;white-space:nowrap;background:#89b4fa;color:#1e1e2e;display:none;';
    validatingBadge.textContent = 'validating…';
    headerEl.appendChild(validatingBadge);

    panelEl.appendChild(headerEl);

    // Body
    const bodyEl = document.createElement('div');
    bodyEl.style.cssText = 'padding:8px 12px;overflow-y:auto;flex:1;';

    const stateLabel = document.createElement('div');
    stateLabel.style.cssText =
      'color:#89b4fa;font-weight:bold;font-size:10px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px;';
    stateLabel.textContent = 'State';
    bodyEl.appendChild(stateLabel);

    stateNode = document.createElement('pre');
    stateNode.style.cssText =
      'margin:0 0 8px;font-size:11px;white-space:pre-wrap;word-break:break-all;color:#a6e3a1;max-height:180px;overflow-y:auto;';
    bodyEl.appendChild(stateNode);

    const logLabel = document.createElement('div');
    logLabel.style.cssText =
      'color:#89b4fa;font-weight:bold;font-size:10px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px;';
    logLabel.textContent = 'Action log';
    bodyEl.appendChild(logLabel);

    logList = document.createElement('div');
    logList.style.cssText = 'max-height:130px;overflow-y:auto;';
    bodyEl.appendChild(logList);

    panelEl.appendChild(bodyEl);
    wrapper.appendChild(panelEl);

    // Toggle button
    const toggleBtn = document.createElement('button');
    toggleBtn.style.cssText =
      'display:block;margin-left:auto;background:#6c6f85;color:#cdd6f4;border:none;border-radius:6px;padding:5px 10px;cursor:pointer;font-family:inherit;font-size:11px;font-weight:bold;';
    toggleBtn.textContent = panelOpen ? '▾ NF' : '▴ NF';
    toggleBtn.addEventListener('mouseenter', () => {
      toggleBtn.style.background = '#7f849c';
    });
    toggleBtn.addEventListener('mouseleave', () => {
      toggleBtn.style.background = '#6c6f85';
    });
    toggleBtn.addEventListener('click', () => {
      panelOpen = !panelOpen;
      panelEl.style.display = panelOpen ? 'flex' : 'none';
      toggleBtn.textContent = panelOpen ? '▾ NF' : '▴ NF';
    });
    wrapper.appendChild(toggleBtn);
  } else {
    // ── Inline mode ────────────────────────────────────────────────────────
    const container = options.container as HTMLElement;

    // Reuse existing shadowRoot if present (handles remount after unsub)
    if (container.shadowRoot) {
      root = container.shadowRoot;
    } else {
      try {
        root = container.attachShadow({ mode: 'open' });
      } catch {
        if (!document.getElementById('neutro-devtools-panel-style')) {
          const styleEl = document.createElement('style');
          styleEl.id = 'neutro-devtools-panel-style';
          styleEl.textContent = [
            '.nf-panel{font-family:monospace;font-size:12px;border:1px solid #45475a;border-radius:6px;overflow:hidden;}',
            '.nf-panel-header{background:#1e1e2e;color:#cdd6f4;padding:8px 12px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;cursor:pointer;}',
            '.nf-panel-body{background:#181825;color:#cdd6f4;padding:8px 12px;max-height:400px;overflow-y:auto;}',
            '.nf-badge{font-size:10px;padding:1px 6px;border-radius:10px;background:#313244;color:#cdd6f4;white-space:nowrap;}',
            '.nf-badge-valid{background:rgba(166,227,161,.3);color:#a6e3a1;}',
            '.nf-badge-invalid{background:rgba(243,139,168,.3);color:#f38ba8;}',
            '.nf-section-title{color:#89b4fa;font-weight:bold;font-size:10px;text-transform:uppercase;letter-spacing:.08em;margin:6px 0 3px;}',
            '.nf-log-entry{border-bottom:1px solid #313244;padding:2px 0;font-size:11px;}',
            '.nf-log-type{color:#f38ba8;}',
          ].join('');
          document.head.appendChild(styleEl);
        }
        root = container;
      }
    }

    const panelEl = document.createElement('div');
    panelEl.className = 'nf-panel';

    const headerEl = document.createElement('div');
    headerEl.className = 'nf-panel-header';

    const titleEl = document.createElement('span');
    titleEl.style.cssText = 'font-weight:bold;flex:1;';
    titleEl.textContent = `NeutroForm: ${name}`;
    headerEl.appendChild(titleEl);

    validBadge = document.createElement('span');
    validBadge.className = 'nf-badge';
    headerEl.appendChild(validBadge);

    submittingBadge = document.createElement('span');
    submittingBadge.className = 'nf-badge';
    submittingBadge.style.cssText = 'background:#fab387;color:#1e1e2e;display:none;';
    submittingBadge.textContent = 'submitting';
    headerEl.appendChild(submittingBadge);

    validatingBadge = document.createElement('span');
    validatingBadge.className = 'nf-badge';
    validatingBadge.style.cssText = 'background:#89b4fa;color:#1e1e2e;display:none;';
    validatingBadge.textContent = 'validating…';
    headerEl.appendChild(validatingBadge);

    const bodyEl = document.createElement('div');
    bodyEl.className = 'nf-panel-body';
    if (options.collapsed) bodyEl.style.display = 'none';

    headerEl.addEventListener('click', () => {
      bodyEl.style.display = bodyEl.style.display === 'none' ? '' : 'none';
    });

    const stateLabel = document.createElement('div');
    stateLabel.className = 'nf-section-title';
    stateLabel.textContent = 'State';
    bodyEl.appendChild(stateLabel);

    stateNode = document.createElement('pre');
    stateNode.style.margin = '0 0 4px';
    bodyEl.appendChild(stateNode);

    const logLabel = document.createElement('div');
    logLabel.className = 'nf-section-title';
    logLabel.textContent = 'Action log';
    bodyEl.appendChild(logLabel);

    logList = document.createElement('div');
    bodyEl.appendChild(logList);

    panelEl.appendChild(headerEl);
    panelEl.appendChild(bodyEl);
    root.appendChild(panelEl);
  }

  // ── Shared helpers ───────────────────────────────────────────────────────
  const updateBadges = (state: FormState<any>) => {
    const iv = state.isValid;
    validBadge.textContent = iv === null ? 'unknown' : iv ? 'valid' : 'invalid';
    if (floatingMode) {
      validBadge.style.background =
        iv === true ? 'rgba(166,227,161,.3)' : iv === false ? 'rgba(243,139,168,.3)' : '#313244';
      validBadge.style.color = iv === true ? '#a6e3a1' : iv === false ? '#f38ba8' : '#cdd6f4';
    } else {
      validBadge.className = `nf-badge${iv === true ? ' nf-badge-valid' : iv === false ? ' nf-badge-invalid' : ''}`;
    }
    submittingBadge.style.display = state.isSubmitting ? '' : 'none';
    validatingBadge.style.display = state.isValidating ? '' : 'none';
  };

  const updateState = (state: FormState<any>) => {
    // textContent only — never innerHTML — safe against XSS from user-controlled values
    stateNode.textContent = JSON.stringify(
      { values: state.values, errors: state.errors, touched: state.touched, dirty: state.dirty },
      null,
      2
    );
  };

  const appendLog = (action: FormAction) => {
    const entry = document.createElement('div');
    const typeSpan = document.createElement('span');
    typeSpan.textContent = action.type;
    const timeNode = document.createTextNode(
      ` ${new Date().toLocaleTimeString('en', { hour12: false } as Intl.DateTimeFormatOptions)}`
    );
    entry.appendChild(typeSpan);
    entry.appendChild(timeNode);
    if (floatingMode) {
      entry.style.cssText = 'border-bottom:1px solid #313244;padding:2px 0;font-size:11px;';
      typeSpan.style.color = '#f38ba8';
    } else {
      entry.className = 'nf-log-entry';
      typeSpan.className = 'nf-log-type';
    }
    logList.insertBefore(entry, logList.firstChild);
    while (logList.children.length > maxLogEntries) {
      if (logList.lastChild) logList.removeChild(logList.lastChild);
    }
  };

  // Initial render
  const initialState = form.getState();
  updateBadges(initialState);
  updateState(initialState);

  // Subscriptions
  const unsubState = form.subscribe((state) => {
    updateBadges(state);
    updateState(state);
  });

  const unsubActions = form._subscribeToActions((action) => {
    if (action.type === 'BATCH_START' || action.type === 'BATCH_END') return;
    appendLog(action);
  });

  // Teardown
  return () => {
    unsubState();
    unsubActions();
    if (floatingMode) {
      floatingRegistry.delete(form);
      (root as HTMLElement).remove();
    } else {
      const container = options.container as HTMLElement;
      inlinePanelRegistry.get(form)?.delete(container);
      root.replaceChildren();
    }
  };
}
