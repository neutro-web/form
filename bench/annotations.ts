// Hand-maintained map of competitor library -> version actually benchmarked. Update this
// whenever a competitor's package.json dependency range in bench/package.json or
// bench/apps/*/package.json is bumped, so results stay attributable to a specific release.
export const COMPETITOR_VERSIONS: Record<string, string> = {
  'react-hook-form': '7.80.0',
  formik: '2.4.9',
  'vee-validate': '4.15.1',
  felte: '1.3.0',
  'tanstack-form': '1.33.0',
  'tanstack-form (React)': '1.33.0',
  'tanstack-form (Svelte)': '1.33.0',
}

// Hand-maintained map of surface -> "why neutro/form passes" explanation, shown in the
// correctness tables' Why column. Keyed by surface name (bench/results correctness key).
export const PASS_REASONS: Record<string, string> = {
  'array-state-integrity': 'errors/touched/dirty state is rekeyed by index on every array splice/move/swap',
  'async-race': 'each async validation run gets its own AbortController; stale results are discarded by epoch',
  'dependency-trigger': 'a static dependency graph is precompiled at form init, so dependent fields re-validate automatically',
  'validation-scope-precision': 'set() on a field with 3 declared dependents validates exactly itself + those 3 (4 of 504 total fields), not the whole form — the O(1) precomputed dependency-graph claim, quantified',
}

export interface Annotation {
  brief: string
  detail: string
}

// Hand-maintained map of surface -> library -> {brief, detail}. This is the single source for
// scorecard badge tooltips/citations, browser-table detail-cell footnotes (verdict.ts's
// hasAnnotation check just needs any truthy value, so this reshape doesn't affect it), and N/A
// reason text shown inline on the generated page.
export const ANNOTATIONS: Record<string, Record<string, Annotation>> = {
  'async-latency': {
    'neutro/form (React)': {
      brief: 'debounced 300ms by default',
      detail: 'neutro debounces async validation 300ms by default (asyncDebounceMs) to avoid firing on every keystroke. See the debounce=0 column for the floor cost.',
    },
    'neutro/form (Vue)': {
      brief: 'debounced 300ms by default',
      detail: 'same debounce policy as React — see debounce=0 column.',
    },
    'neutro/form (Svelte)': {
      brief: 'debounced 300ms by default',
      detail: 'same debounce policy as React — see debounce=0 column.',
    },
  },
  'async-cancellation': {
    'react-hook-form': { brief: 'no async cancellation API', detail: 'no async cancellation API; a slow stale validation can overwrite a fresh result' },
    'formik': { brief: 'no async cancellation API', detail: 'no async cancellation API' },
    'tanstack-form (React)': { brief: 'no async cancellation API', detail: 'no async cancellation API' },
    'tanstack-form (Svelte)': { brief: 'no async cancellation API', detail: 'no async cancellation API' },
    'vee-validate': { brief: 'no async cancellation API', detail: 'no async cancellation API' },
    'felte': { brief: 'no async cancellation API', detail: 'no async cancellation API' },
  },
  'array-state-integrity': {
    'tanstack-form': { brief: 'no public rekey API outside React context', detail: 'no public API to rekey per-field error/touched state on array splice outside React context' },
    'react-hook-form': { brief: 'rekey not exposed outside hook context', detail: 'state-map rekey on splice not exposed outside hook context' },
    'formik': { brief: 'rekey not exposed outside hook context', detail: 'state-map rekey on splice not exposed outside hook context' },
    'vee-validate': { brief: 'rekey not exposed outside hook context', detail: 'state-map rekey on splice not exposed outside hook context' },
  },
  'async-race': {
    // Node-level correctness suite (bench/suites/correctness/async-race.test.ts), distinct from the
    // browser 'async-cancellation' surface above — same underlying capability, different test mechanism.
    'tanstack-form': { brief: 'no async cancellation API in vanilla usage', detail: 'no async cancellation API in vanilla usage' },
    'react-hook-form': { brief: 'no async cancellation API in vanilla usage', detail: 'no async cancellation API in vanilla usage' },
    'formik': { brief: 'no async cancellation API in vanilla usage', detail: 'no async cancellation API in vanilla usage' },
    'vee-validate': { brief: 'no async cancellation API in vanilla usage', detail: 'no async cancellation API in vanilla usage' },
  },
  'dependency-trigger': {
    'tanstack-form': { brief: 'no declarative dependency graph', detail: 'requires per-field validators; no declarative cross-field dependency graph' },
    'react-hook-form': { brief: 'no declarative dependency graph', detail: 'no declarative dependency graph; cross-field validation is manual' },
    'formik': { brief: 'no declarative dependency graph', detail: 'no declarative dependency graph; cross-field validation is manual' },
    'vee-validate': { brief: 'no declarative dependency graph', detail: 'no declarative dependency graph; cross-field validation is manual' },
  },
  'bundle-size': {
    'tanstack-form': {
      brief: "neutro's single-closure design isn't tree-shakeable",
      detail: "neutro/form's createForm is a single closure factory (array ops, DOM bridge, persistence, computed fields, and devtools hooks all in one function body) so nothing is tree-shakeable; tanstack-form's modular file structure lets esbuild drop unused code paths despite a larger raw source size.",
    },
  },
  'array-ops': {
    'tanstack-form (Svelte)': {
      brief: "TanStack's own Svelte render counter never gets wired up",
      detail: "TanStack's own Svelte bench harness never defines window.__resetArrayRenders, so its render counter (window.__tanstackArrayRenders) stays permanently empty and reports an artificial 0 — not a real absence of render work. Confirmed by direct inspection during this project's own v0.5.0 verification; not a neutro/form architectural gap.",
    },
  },
}
