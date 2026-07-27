import { build } from 'esbuild'
import { gzipSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import type { BundleSizeResult } from '../../types/schema.js'

const LIBRARIES: Array<{ library: string; entry: string }> = [
  { library: 'neutro/form',      entry: 'fixtures/bundle/neutro.ts' },
  { library: 'neutro/form (minimal)', entry: 'fixtures/bundle/neutro-minimal.ts' },
  { library: 'react-hook-form',  entry: 'fixtures/bundle/rhf.ts' },
  { library: 'formik',           entry: 'fixtures/bundle/formik.ts' },
  { library: 'tanstack-form',    entry: 'fixtures/bundle/tanstack.ts' },
  { library: 'vee-validate',     entry: 'fixtures/bundle/vee-validate.ts' },
  { library: 'felte',            entry: 'fixtures/bundle/felte.ts' },
]

async function measureOne(library: string, entry: string): Promise<BundleSizeResult> {
  try {
    const result = await build({
      entryPoints: [entry],
      bundle: true,
      minify: true,
      format: 'esm',
      write: false,
      platform: 'browser',
      external: ['react', 'react-dom', 'vue', '@neutro/form-react', '@neutro/form-vue'],
    })
    const code = result.outputFiles[0].contents
    const gzipBytes = gzipSync(Buffer.from(code)).length
    return { library, status: 'ok', gzipBytes }
  } catch (e) {
    return { library, status: 'error', error: e instanceof Error ? e.message : String(e) }
  }
}

const results = await Promise.all(LIBRARIES.map((l) => measureOne(l.library, l.entry)))
writeFileSync('results/bundle-size.json', JSON.stringify({ 'bundle-size': results }, null, 2))
console.log('[bundle-size] wrote results/bundle-size.json')

// A failure to bundle our OWN library (as opposed to a competitor's) almost
// always means the workspace packages weren't built before this script ran
// (dist/ missing) -- that's an environment bug, not a real "neutro/form is
// too big to measure" result, and it must never be silently recorded as an
// ERROR badge in the published docs. Fail the job loudly instead.
const ownFailures = results.filter((r) => r.library.startsWith('neutro/form') && r.status === 'error')
if (ownFailures.length > 0) {
  for (const f of ownFailures) {
    console.error(`[bundle-size] FATAL: ${f.library} failed to bundle: ${f.error}`)
  }
  console.error(
    '[bundle-size] Did you run `pnpm build` (or `pnpm --filter "@neutro/*" run build`) before this script?'
  )
  process.exit(1)
}
