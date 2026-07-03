export interface FormFixture {
  initialValues: Record<string, any>
  dependencies?: Record<string, string[]>
  validator?: (values: any) => Promise<Record<string, string>>
}

export type AdapterCapability =
  | 'path-subscriptions'    // fine-grained per-path subscription, not whole-form
  | 'scoped-validation'     // validate a subset of fields without triggering the rest
  | 'array-move'            // native move without remove+insert reset
  | 'cross-field-deps'      // declarative dependency graph resolved at init
  | 'async-cancellation'    // aborts stale async validation on re-trigger

export interface BenchAdapter {
  readonly name: string
  readonly capabilities: AdapterCapability[]

  set(path: string, value: any): void
  get(path: string): any

  subscribeToPath(path: string, fn: () => void): () => void
  subscribeGlobal(fn: () => void): () => void

  validate(paths?: string[]): Promise<Record<string, string>>

  arrayRemove(path: string, index: number): void
  arrayMove(path: string, from: number, to: number): void
  /** Optional: not every adapter under comparison exposes an insert-at-index primitive. */
  arrayInsert?(path: string, index: number, item: any): void

  getErrors(): Record<string, string>
  getTouched(): Record<string, boolean>
}

export function hasCapability(adapter: BenchAdapter, cap: AdapterCapability): boolean {
  return adapter.capabilities.includes(cap)
}
