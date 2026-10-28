/// <reference lib="webworker" />
import { instrument } from './instrument'
import { formatArgs, formatValue, typeName, UNINITIALIZED } from './format'
import {
  CMD,
  CTRL_SLOT,
  HEADER_BYTES,
  LEN_SLOT,
  type PausedState,
  type VarEntry,
  type WatchValue,
  type WorkerIn,
  type WorkerOut,
} from './protocol'

const MAX_STEPS = 8_000_000
const MAX_TRACE_FRAMES = 400

class StopSignal extends Error {}

const post = (message: WorkerOut) => {
  self.postMessage(message)
}

/**
 * `new Function` wraps the body in a header, so thrown errors report a line a
 * couple of lines further down than the source. Measuring it once is more
 * reliable than assuming a constant across engines.
 */
function detectLineOffset(): number {
  try {
    new Function('throw new Error("probe")')()
  } catch (err) {
    const match = /<anonymous>:(\d+):/.exec((err as Error).stack ?? '')
    if (match) return Number(match[1]) - 1
  }
  return 2
}

const LINE_OFFSET = detectLineOffset()

const ANSI = {
  GREEN: '\x1b[32m',
  RED: '\x1b[31m',
  YELLOW: '\x1b[33m',
  DIM: '\x1b[2m',
  BOLD: '\x1b[1m',
  RESET: '\x1b[0m',
}

/**
 * In debug mode the code has a probe in front of every statement, so the text
 * of a callback with a block body would otherwise read back full of them.
 * Removing balanced `__dbg(...)` calls keeps the label the user wrote.
 */
function stripProbes(text: string): string {
  let out = ''
  let index = 0
  while (index < text.length) {
    const start = text.indexOf('__dbg(', index)
    if (start === -1) {
      out += text.slice(index)
      break
    }
    out += text.slice(index, start)
    let depth = 0
    let cursor = start + '__dbg'.length
    for (; cursor < text.length; cursor++) {
      const char = text[cursor]
      if (char === '(') depth++
      else if (char === ')') {
        depth--
        if (depth === 0) {
          cursor++
          break
        }
      }
    }
    if (text[cursor] === ';') cursor++
    index = cursor
  }
  return out
}

interface Session {
  breakpoints: Set<number>
  watches: string[]
  stepping: boolean
  steps: number
  ctrl: Int32Array | null
  bytes: Uint8Array | null
  trace: PausedState[]
  stopped: boolean
}

function toVarEntries(snapshot: Record<string, unknown>): VarEntry[] {
  const entries: VarEntry[] = []
  for (const [name, value] of Object.entries(snapshot)) {
    // `this` is only worth showing when it is a real receiver.
    if (name === 'this' && (value === undefined || value === globalThis)) continue
    entries.push({
      name,
      type: typeName(value),
      value: formatValue(value, 1),
      callable: typeof value === 'function',
    })
  }
  entries.sort((a, b) => Number(a.callable ?? false) - Number(b.callable ?? false))
  return entries
}

function evaluateWatches(session: Session, evaluate: (expr: string) => unknown): WatchValue[] {
  return session.watches.map((expr) => {
    if (!expr.trim()) return { expr, value: '' }
    try {
      return { expr, value: formatValue(evaluate(expr), 1) }
    } catch (err) {
      return { expr, value: (err as Error)?.message ?? String(err), failed: true }
    }
  })
}

function readWatchPayload(session: Session): string[] {
  if (!session.ctrl || !session.bytes) return session.watches
  const length = Atomics.load(session.ctrl, LEN_SLOT)
  if (length <= 0) return []
  try {
    // TextDecoder refuses a view onto shared memory, so the bytes are copied
    // into a plain buffer first.
    const copy = new Uint8Array(session.bytes.subarray(0, length))
    const parsed: unknown = JSON.parse(new TextDecoder().decode(copy))
    return Array.isArray(parsed) ? parsed.map(String) : session.watches
  } catch {
    return session.watches
  }
}

function pause(
  session: Session,
  line: number,
  snapshot: () => Record<string, unknown>,
  evaluate: (expr: string) => unknown,
): void {
  const vars = toVarEntries(snapshot())

  // Without cross origin isolation there is no SharedArrayBuffer and so no way
  // to block the worker. Breakpoint hits are recorded instead, and the panel
  // lets you walk through them once the run finishes.
  if (!session.ctrl) {
    if (session.trace.length < MAX_TRACE_FRAMES) {
      session.trace.push({
        line,
        vars,
        watches: evaluateWatches(session, evaluate),
        step: session.steps,
        recorded: true,
      })
    }
    return
  }

  const ctrl = session.ctrl
  post({
    type: 'paused',
    state: { line, vars, watches: evaluateWatches(session, evaluate), step: session.steps },
  })

  for (;;) {
    Atomics.store(ctrl, CTRL_SLOT, CMD.NONE)
    Atomics.wait(ctrl, CTRL_SLOT, CMD.NONE)
    const command = Atomics.load(ctrl, CTRL_SLOT)

    if (command === CMD.WATCH) {
      session.watches = readWatchPayload(session)
      post({
        type: 'paused',
        state: { line, vars, watches: evaluateWatches(session, evaluate), step: session.steps },
      })
      continue
    }
    if (command === CMD.STOP) {
      session.stopped = true
      throw new StopSignal('stopped')
    }
    session.stepping = command === CMD.STEP
    return
  }
}

function run(request: WorkerIn['request']): void {
  const session: Session = {
    breakpoints: new Set(request.breakpoints),
    watches: request.watches,
    stepping: request.debug && request.breakOnEntry,
    steps: 0,
    ctrl: request.sab ? new Int32Array(request.sab, 0, 4) : null,
    bytes: request.sab ? new Uint8Array(request.sab, HEADER_BYTES) : null,
    trace: [],
    stopped: false,
  }

  const consoleShim = {
    log: (...args: unknown[]) => post({ type: 'console', level: 'log', text: formatArgs(args) }),
    info: (...args: unknown[]) => post({ type: 'console', level: 'info', text: formatArgs(args) }),
    warn: (...args: unknown[]) => post({ type: 'console', level: 'warn', text: formatArgs(args) }),
    error: (...args: unknown[]) =>
      post({ type: 'console', level: 'error', text: formatArgs(args) }),
    debug: (...args: unknown[]) => post({ type: 'console', level: 'log', text: formatArgs(args) }),
    table: (...args: unknown[]) => post({ type: 'console', level: 'log', text: formatArgs(args) }),
  }

  const dbg = (
    line: number,
    snapshot: () => Record<string, unknown>,
    evaluate: (expr: string) => unknown,
  ) => {
    session.steps += 1
    if (session.steps > MAX_STEPS) {
      throw new Error('Too many steps. This looks like an endless loop.')
    }
    if (session.stepping || session.breakpoints.has(line)) {
      pause(session, line, snapshot, evaluate)
    }
  }

  const readVar = (getter: () => unknown): unknown => {
    try {
      return getter()
    } catch {
      return UNINITIALIZED
    }
  }

  // A small assertion helper, available to the code being run without any
  // import. Counters live here so every run starts from zero.
  let passed = 0
  let failed = 0
  let checked = 0
  let summaryShown = false

  const say = (text: string) => post({ type: 'console', level: 'log', text })

  const check = (fn: () => unknown, expected: unknown): void => {
    checked += 1
    // Stripping types leaves spaces behind, and a probe leaves a gap, so the
    // label is squeezed back onto one tidy line.
    const label = stripProbes(String(fn))
      .replace(/^\s*\(\s*\)\s*=>\s*/, '')
      .replace(/\s+/g, ' ')
      .replace(/\s+([),;\]}])/g, '$1')
      .replace(/([([{])\s+/g, '$1')
      .trim()
    let actual: unknown
    try {
      actual = fn()
    } catch (err) {
      if (err instanceof StopSignal) throw err
      failed += 1
      say(`${ANSI.RED}${ANSI.BOLD}FAIL${ANSI.RESET}  ${label}`)
      say(`      ${ANSI.RED}threw: ${String(err)}${ANSI.RESET}`)
      return
    }
    if (JSON.stringify(actual) === JSON.stringify(expected)) {
      passed += 1
      say(`${ANSI.GREEN}${ANSI.BOLD}PASS${ANSI.RESET}  ${ANSI.DIM}${label}${ANSI.RESET}`)
    } else {
      failed += 1
      say(`${ANSI.RED}${ANSI.BOLD}FAIL${ANSI.RESET}  ${label}`)
      say(`      ${ANSI.YELLOW}expected:${ANSI.RESET} ${JSON.stringify(expected)}`)
      say(`      ${ANSI.RED}actual:  ${ANSI.RESET} ${JSON.stringify(actual)}`)
    }
  }

  const summary = (): void => {
    summaryShown = true
    const colour = failed === 0 ? ANSI.GREEN : ANSI.RED
    say(`\n${colour}${ANSI.BOLD}${passed} passed, ${failed} failed${ANSI.RESET}`)
  }

  let compiled: Function
  const source = request.debug ? instrument(request.source).code : request.source

  try {
    compiled = new Function('__dbg', '__v', 'console', 'check', 'summary', source)
  } catch (err) {
    post({ type: 'error', message: `Syntax error: ${(err as Error).message}` })
    post({ type: 'done', durationMs: 0, steps: 0 })
    return
  }

  const started = performance.now()
  try {
    compiled(dbg, readVar, consoleShim, check, summary)
  } catch (err) {
    if (!(err instanceof StopSignal)) {
      const error = err as Error
      const match = /<anonymous>:(\d+):/.exec(error?.stack ?? '')
      const line = match ? Number(match[1]) - LINE_OFFSET : undefined
      post({
        type: 'error',
        message: `${error?.name ?? 'Error'}: ${error?.message ?? String(err)}`,
        line: line !== undefined && line > 0 ? line : undefined,
      })
    } else {
      post({ type: 'console', level: 'system', text: 'Run stopped.' })
    }
  }

  // Calling summary is optional: when checks ran without one, print it anyway.
  if (checked > 0 && !summaryShown && !session.stopped) summary()

  if (session.trace.length > 0) post({ type: 'trace', frames: session.trace })
  post({ type: 'done', durationMs: performance.now() - started, steps: session.steps })
}

self.onmessage = (event: MessageEvent<WorkerIn>) => {
  if (event.data?.type === 'run') run(event.data.request)
}

post({ type: 'ready' })
