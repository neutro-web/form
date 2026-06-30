import type { BenchAdapter, FormFixture, AdapterCapability } from './interface.js'

// Formik is React-specific. Without a React render context, its useFormik hook
// and <Formik> component are unavailable. This adapter shims the state layer.
// Shim: 'plain store; Formik hooks unavailable outside React render context'
const SHIM = 'plain store; Formik hooks unavailable outside React render context'

function getIn(obj: any, path: string): any {
  return path.split('.').reduce((cur, key) => cur?.[key], obj)
}

function setIn(obj: any, path: string, value: any): void {
  const keys = path.split('.')
  let cur = obj
  for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]] ??= {}
  cur[keys[keys.length - 1]] = value
}

export function createAdapter(fixture: FormFixture): BenchAdapter {
  let values: Record<string, any> = JSON.parse(JSON.stringify(fixture.initialValues))
  const subscribers = new Set<() => void>()
  let errors: Record<string, string> = {}

  function notify() { subscribers.forEach(fn => fn()) }

  return {
    name: 'formik',
    capabilities: [] as AdapterCapability[],

    set(path, value) { setIn(values, path, value); notify() },
    get(path) { return getIn(values, path) },

    subscribeToPath(_path, fn) {
      subscribers.add(fn)
      return () => subscribers.delete(fn)
    },
    subscribeGlobal(fn) {
      subscribers.add(fn)
      return () => subscribers.delete(fn)
    },

    async validate(_paths?) {
      if (!fixture.validator) return {}
      errors = await fixture.validator(values)
      return errors
    },

    arrayRemove(path, index) {
      const arr = [...(getIn(values, path) as any[])]
      arr.splice(index, 1)
      setIn(values, path, arr)
      notify()
    },
    arrayMove(path, from, to) {
      const arr = [...(getIn(values, path) as any[])]
      const [item] = arr.splice(from, 1)
      arr.splice(to, 0, item)
      setIn(values, path, arr)
      notify()
    },

    getErrors() { return { ...errors } },
    getTouched() { return {} },
  }
}

export const shimDescription = SHIM
