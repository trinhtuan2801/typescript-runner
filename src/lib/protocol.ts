/** Shared vocabulary between the UI thread and the execution worker. */

export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'system'

export interface LogEntry {
  id: number
  level: LogLevel
  text: string
}

export interface VarEntry {
  name: string
  type: string
  value: string
  /** True for functions and classes, which the panel keeps out of the way. */
  callable?: boolean
}

export interface WatchValue {
  expr: string
  value: string
  failed?: boolean
}

export interface PausedState {
  line: number
  vars: VarEntry[]
  watches: WatchValue[]
  step: number
  /** Set when the frame comes from a recorded trace instead of a live pause. */
  recorded?: boolean
}

export interface RunRequest {
  /** JavaScript, with any TypeScript already stripped on the UI thread. */
  source: string
  debug: boolean
  breakpoints: number[]
  watches: string[]
  /** Pause at the first instrumented statement. */
  breakOnEntry: boolean
  sab: SharedArrayBuffer | null
}

export type WorkerOut =
  | { type: 'ready' }
  | { type: 'console'; level: LogLevel; text: string }
  | { type: 'paused'; state: PausedState }
  | { type: 'trace'; frames: PausedState[] }
  | { type: 'error'; message: string; line?: number }
  | { type: 'done'; durationMs: number; steps: number }

export type WorkerIn = { type: 'run'; request: RunRequest }

/** Commands written into the first slot of the shared control buffer. */
export const CMD = {
  NONE: 0,
  CONTINUE: 1,
  STEP: 2,
  STOP: 3,
  WATCH: 4,
} as const

export const CTRL_SLOT = 0
export const LEN_SLOT = 1
export const HEADER_BYTES = 16
export const SAB_BYTES = 64 * 1024

export const canIsolate = (): boolean =>
  typeof SharedArrayBuffer !== 'undefined' &&
  typeof crossOriginIsolated !== 'undefined' &&
  crossOriginIsolated
