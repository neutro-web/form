import { build } from 'esbuild'
import { gzipSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import type { BundleSizeResult } from '../../types/schema.js'

const LIBRARIES: Array<{ library: string; entry: string }> = [
  { library: 'neutro/form',      entry: 'fixtures/bundle/neutro.ts' },
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
