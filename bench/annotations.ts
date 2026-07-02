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
}

// Hand-maintained map of surface -> library -> reason. This is the single source for both
// Tradeoff badge tooltip text (verdict.ts) and N/A reason text shown inline on the generated page.
export const ANNOTATIONS: Record<string, Record<string, string>> = {
  'async-latency': {
    'neutro/form (React)': 'neutro debounces async validation 300ms by default (asyncDebounceMs) to avoid firing on every keystroke. See the debounce=0 column for the floor cost.',
    'neutro/form (Vue)': 'same debounce policy as React — see debounce=0 column.',
    'neutro/form (Svelte)': 'same debounce policy as React — see debounce=0 column.',
  },
  'async-cancellation': {
    'react-hook-form': 'no async cancellation API; a slow stale validation can overwrite a fresh result',
    'formik': 'no async cancellation API',
    'tanstack-form (React)': 'no async cancellation API',
    'tanstack-form (Svelte)': 'no async cancellation API',
    'vee-validate': 'no async cancellation API',
    'felte': 'no async cancellation API',
  },
  'array-state-integrity': {
    'tanstack-form': 'no public API to rekey per-field error/touched state on array splice outside React context',
    'react-hook-form': 'state-map rekey on splice not exposed outside hook context',
    'formik': 'state-map rekey on splice not exposed outside hook context',
    'vee-validate': 'state-map rekey on splice not exposed outside hook context',
  },
  'async-race': {
    // Node-level correctness suite (bench/suites/correctness/async-race.test.ts), distinct from the
    // browser 'async-cancellation' surface above — same underlying capability, different test mechanism.
    'tanstack-form': 'no async cancellation API in vanilla usage',
    'react-hook-form': 'no async cancellation API in vanilla usage',
    'formik': 'no async cancellation API in vanilla usage',
    'vee-validate': 'no async cancellation API in vanilla usage',
  },
  'dependency-trigger': {
    'tanstack-form': 'requires per-field validators; no declarative cross-field dependency graph',
    'react-hook-form': 'no declarative dependency graph; cross-field validation is manual',
    'formik': 'no declarative dependency graph; cross-field validation is manual',
    'vee-validate': 'no declarative dependency graph; cross-field validation is manual',
  },
  'bundle-size': {
    'tanstack-form': "neutro/form's createForm is a single closure factory (array ops, DOM bridge, persistence, computed fields, and devtools hooks all in one function body) so nothing is tree-shakeable; tanstack-form's modular file structure lets esbuild drop unused code paths despite a larger raw source size.",
  },
}
