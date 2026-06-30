import type { Reporter, FullResult, TestCase, TestResult } from '@playwright/test/reporter'
import { writeFileSync } from 'node:fs'
import type { BrowserResult } from '../types/schema.js'

export default class JsonPlaywrightReporter implements Reporter {
  private output: Record<string, BrowserResult[]> = {}

  onTestEnd(test: TestCase, result: TestResult) {
    const surface = test.parent.title
    const attach = result.attachments.find(a => a.name === 'result')
    if (!attach?.body) return
    try {
      const data: BrowserResult = JSON.parse(attach.body.toString())
      ;(this.output[surface] ??= []).push(data)
    } catch {
      ;(this.output[surface] ??= []).push({
        library: test.title,
        status: 'error',
        error: 'malformed attachment',
      })
    }
  }

  onEnd(_result: FullResult) {
    writeFileSync('results/browser.json', JSON.stringify(this.output, null, 2))
    console.log('[json-playwright] wrote results/browser.json')
  }
}
