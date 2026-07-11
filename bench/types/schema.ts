export interface BenchResults {
  meta: {
    generatedAt: string
    neutroVersion: string       // from NEUTRO_VERSION env var (git tag, e.g. "v0.4.3", "v" prefix stripped)
    nodeVersion: string         // process.version
    platform: 'linux' | 'darwin' | string
    runner: 'github-actions' | 'local'
  }
  core:        Record<string, LibraryBenchResult[]>   // key = "surface/scale" e.g. "set-get/small"
  correctness: Record<string, CorrectnessResult[]>    // key = surface name e.g. "async-race"
  browser:     Record<string, BrowserResult[]>        // key = surface name e.g. "re-renders/10"
  bundleSize:  Record<string, BundleSizeResult[]>      // key = "bundle-size"
}

export interface LibraryBenchResult {
  library: string
  status: 'ok' | 'error' | 'na'
  opsPerSec?: number        // hz from tinybench TaskResult
  median?: number           // ms
  rme?: number              // relative margin of error %
  highVariance?: boolean    // true when rme > 10; excluded from comparison
  samples?: number
  shim?: string             // present when adapter used a shim; disclosed on public page
  error?: string            // present when status = 'error'
}

export interface CorrectnessResult {
  library: string
  status: 'pass' | 'fail' | 'na' | 'error'
  detail?: string           // failure message
}

export interface BrowserResult {
  library: string
  status: 'ok' | 'error' | 'na'
  renderCount?: number                  // total renders across all fields during a keystroke sequence
  p50Ms?: number                        // async validation latency p50
  p99Ms?: number                        // async validation latency p99
  cancellationPass?: boolean            // async-cancellation surface: did the UI show the fresh result, not stale?
  connectedCountAfterCleanup?: number   // dom-cleanup surface only; 0 = pass
  mountMs?: number                      // mount-cost surface: time from navigation start to form interactive
  heapDeltaBytes?: number               // memory-churn surface: JS heap growth across mount/unmount churn, post-GC
  submitLatencyMs?: number              // schema-validate-submit surface: ms from submit click to error-visible
  error?: string
}

export interface BundleSizeResult {
  library: string
  status: 'ok' | 'error'
  gzipBytes?: number
  error?: string
}
