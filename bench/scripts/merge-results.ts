import { readFileSync, writeFileSync } from 'node:fs'
import type { BenchResults, CorrectnessResult, LibraryBenchResult } from '../types/schema.js'

// Shim descriptions must be disclosed on the public page. The adapters export
// shimDescription but can't inject it into tinybench TaskResult objects, so we
// annotate here after reading the core results.
const KNOWN_SHIMS: Record<string, string> = {
  'react-hook-form': 'plain store; RHF hooks unavailable outside React render context',
  'formik':          'plain store; Formik hooks unavailable outside React render context',
  'vee-validate':    'plain store; Vee-Validate composables unavailable outside Vue app context',
}

// Version passed as NEUTRO_VERSION from the git tag (e.g. "v0.4.3") by bench-full.yml.
// bench-full.yml checks out main (which has the pre-release version in package.json),
// so the tag ref_name is the only way to get the correct released version.
// Falls back to "unknown" for the weekly cron job which does not publish results.
const neutroVersion = (process.env.NEUTRO_VERSION ?? '').replace(/^v/, '') || 'unknown'

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    console.error(`[merge-results] Failed to read ${path}:`, e)
    process.exit(1)
  }
}

// Vitest's --reporter=json format: top-level testResults[] each with assertionResults[]
function normalizeCorrectnessJson(raw: any): Record<string, CorrectnessResult[]> {
  const out: Record<string, CorrectnessResult[]> = {}
  for (const file of raw.testResults ?? []) {
    for (const test of file.assertionResults ?? []) {
      const surface: string = test.ancestorTitles?.[0] ?? 'unknown'
      const status: CorrectnessResult['status'] =
        test.status === 'passed' ? 'pass'
        : test.status === 'failed' ? 'fail'
        : 'na'
      const detail: string | undefined =
        test.failureMessages?.length ? test.failureMessages[0] : undefined
      ;(out[surface] ??= []).push({ library: test.title, status, detail })
    }
  }
  return out
}

const core        = readJson('results/core.json') as Record<string, any>
const correctness = readJson('results/correctness.json') as Record<string, any>
const browser     = readJson('results/browser.json') as Record<string, any>

const merged: BenchResults = {
  meta: {
    generatedAt: new Date().toISOString(),
    neutroVersion,
    nodeVersion: process.version,
    platform: process.platform,
    runner: process.env.CI ? 'github-actions' : 'local',
  },
  core,
  correctness: normalizeCorrectnessJson(correctness),
  browser,
}

// Annotate shim field for known shim adapters so generate-page.ts can add footnotes
for (const results of Object.values(merged.core)) {
  for (const r of results as LibraryBenchResult[]) {
    if (KNOWN_SHIMS[r.library]) r.shim = KNOWN_SHIMS[r.library]
  }
}

writeFileSync('results/latest.json', JSON.stringify(merged, null, 2))
console.log('[merge-results] wrote results/latest.json')
