/** Value rendering shared by the console, the variables panel and the watch list. */

const MAX_STRING = 240
const MAX_ITEMS = 24
const MAX_KEYS = 24
const MAX_DEPTH = 3

export const UNINITIALIZED = Symbol('uninitialized')

function quote(text: string): string {
  const clipped = text.length > MAX_STRING ? `${text.slice(0, MAX_STRING)}...` : text
  return JSON.stringify(clipped)
}

export function typeName(value: unknown): string {
  if (value === UNINITIALIZED) return 'uninitialized'
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (value instanceof Map) return 'Map'
  if (value instanceof Set) return 'Set'
  if (value instanceof Error) return 'Error'
  if (typeof value === 'object') {
    const name = (value as object).constructor?.name
    return name && name !== 'Object' ? name : 'object'
  }
  return typeof value
}

export function formatValue(value: unknown, depth = 0, seen = new WeakSet<object>()): string {
  if (value === UNINITIALIZED) return 'not initialised yet'
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'

  switch (typeof value) {
    case 'string':
      return depth === 0 ? value : quote(value)
    case 'number':
      return Object.is(value, -0) ? '-0' : String(value)
    case 'bigint':
      return `${value}n`
    case 'boolean':
      return String(value)
    case 'symbol':
      return value.toString()
    case 'function': {
      const fn = value as { name?: string }
      const kind = /^class[\s{]/.test(Function.prototype.toString.call(value)) ? 'class' : 'fn'
      return `${kind} ${fn.name || '(anonymous)'}()`
    }
  }

  const obj = value as object
  if (seen.has(obj)) return '[circular]'
  if (depth > MAX_DEPTH) return Array.isArray(obj) ? '[...]' : '{...}'
  seen.add(obj)

  try {
    if (value instanceof Error) return `${value.name}: ${value.message}`
    if (value instanceof RegExp) return value.toString()
    if (value instanceof Date) return value.toISOString()

    if (Array.isArray(value)) {
      const items = value.slice(0, MAX_ITEMS).map((item) => formatValue(item, depth + 1, seen))
      if (value.length > MAX_ITEMS) items.push(`+${value.length - MAX_ITEMS} more`)
      return `[${items.join(', ')}]`
    }

    if (value instanceof Map) {
      const items: string[] = []
      let count = 0
      for (const [k, v] of value) {
        if (count++ >= MAX_ITEMS) {
          items.push(`+${value.size - MAX_ITEMS} more`)
          break
        }
        items.push(`${formatValue(k, depth + 1, seen)} => ${formatValue(v, depth + 1, seen)}`)
      }
      return `Map(${value.size}) {${items.join(', ')}}`
    }

    if (value instanceof Set) {
      const items: string[] = []
      let count = 0
      for (const v of value) {
        if (count++ >= MAX_ITEMS) {
          items.push(`+${value.size - MAX_ITEMS} more`)
          break
        }
        items.push(formatValue(v, depth + 1, seen))
      }
      return `Set(${value.size}) {${items.join(', ')}}`
    }

    if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
      const typed = Array.from(value as unknown as ArrayLike<number>).slice(0, MAX_ITEMS)
      return `${typeName(value)}(${(value as unknown as ArrayLike<number>).length}) [${typed.join(', ')}]`
    }

    const keys = Object.keys(obj)
    const shown = keys.slice(0, MAX_KEYS).map((key) => {
      const entry = (obj as Record<string, unknown>)[key]
      return `${key}: ${formatValue(entry, depth + 1, seen)}`
    })
    if (keys.length > MAX_KEYS) shown.push(`+${keys.length - MAX_KEYS} more`)
    const prefix = typeName(value)
    const label = prefix === 'object' ? '' : `${prefix} `
    return `${label}{${shown.join(', ')}}`
  } catch {
    return '[unreadable value]'
  } finally {
    seen.delete(obj)
  }
}

export function formatArgs(args: unknown[]): string {
  return args.map((arg) => formatValue(arg, 0)).join(' ')
}
