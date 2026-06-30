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
  browser:     Record<string, BrowserResult[]>        // key = surface name e.g. "re-renders"
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
  detail?: string           // failure message or shim description
}

export interface BrowserResult {
  library: string
  status: 'ok' | 'error' | 'na'
  renderCount?: number      // total renders across all fields during 20-keystroke sequence
  p50Ms?: number            // async validation latency p50
  p99Ms?: number            // async validation latency p99
  concurrentRacePass?: boolean
  error?: string
}
