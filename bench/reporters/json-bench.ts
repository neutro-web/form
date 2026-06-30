import type { Reporter, File, Suite, Task } from 'vitest'
import type { Benchmark } from 'vitest/benchmark'
import { writeFileSync } from 'node:fs'
import type { LibraryBenchResult } from '../types/schema.js'

function isBenchmark(task: Task): task is Benchmark {
  return (task as any).meta?.benchmark === true
}

export default class JsonBenchReporter implements Reporter {
  onFinished(files: File[] = []) {
    const output: Record<string, LibraryBenchResult[]> = {}

    const walk = (tasks: Task[], suiteName: string) => {
      for (const task of tasks) {
        if (isBenchmark(task)) {
          const result = (task as any).result?.benchmark as any
          const entry: LibraryBenchResult = result
            ? {
                library: task.name,
                status: 'ok',
                opsPerSec: result.hz,
                median: result.median,
                rme: result.rme,
                highVariance: result.rme != null && result.rme > 10,
                samples: result.sampleCount,
              }
            : { library: task.name, status: 'error', error: 'no result recorded' }
          ;(output[suiteName] ??= []).push(entry)
        } else if ('tasks' in task) {
          walk((task as Suite).tasks, task.name)
        }
      }
    }

    for (const file of files) walk(file.tasks, file.name)

    const outPath = process.env.BENCH_OUTPUT_FILE ?? 'results/core.json'
    writeFileSync(outPath, JSON.stringify(output, null, 2))
    console.log(`[json-bench] wrote ${outPath}`)
  }
}
