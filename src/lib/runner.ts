import {
  CMD,
  CTRL_SLOT,
  HEADER_BYTES,
  LEN_SLOT,
  SAB_BYTES,
  canIsolate,
  type RunRequest,
  type WorkerOut,
} from './protocol'

export interface RunOptions {
  source: string
  debug: boolean
  breakpoints: number[]
  watches: string[]
  breakOnEntry: boolean
  /** Milliseconds of silence before a run is treated as stuck. */
  timeoutMs?: number
}

export interface RunnerHandlers {
  onMessage: (message: WorkerOut) => void
  onTimeout: () => void
}

/**
 * Owns one worker per run. Starting fresh each time is the cheapest way to
 * guarantee that nothing survives from the previous attempt.
 */
export class Runner {
  private worker: Worker | null = null
  private ctrl: Int32Array | null = null
  private bytes: Uint8Array | null = null
  private timer: number | null = null
  private paused = false
  private handlers: RunnerHandlers | null = null
  private timeoutMs = 10_000

  get isRunning(): boolean {
    return this.worker !== null
  }

  get isPaused(): boolean {
    return this.paused
  }

  get supportsPausing(): boolean {
    return canIsolate()
  }

  start(options: RunOptions, handlers: RunnerHandlers): void {
    this.terminate()
    this.handlers = handlers
    this.timeoutMs = options.timeoutMs ?? 10_000
    this.paused = false

    const useSab = options.debug && canIsolate()
    const sab = useSab ? new SharedArrayBuffer(SAB_BYTES) : null
    if (sab) {
      this.ctrl = new Int32Array(sab, 0, 4)
      this.bytes = new Uint8Array(sab, HEADER_BYTES)
    } else {
      this.ctrl = null
      this.bytes = null
    }

    const worker = new Worker(new URL('./runner.worker.ts', import.meta.url), { type: 'module' })
    this.worker = worker

    worker.onmessage = (event: MessageEvent<WorkerOut>) => {
      const message = event.data
      if (message.type === 'paused') {
        this.paused = true
        this.clearTimer()
      } else {
        if (message.type !== 'console') this.paused = false
        this.armTimer()
      }
      handlers.onMessage(message)
      if (message.type === 'done') this.terminate()
    }

    worker.onerror = (event) => {
      handlers.onMessage({ type: 'error', message: event.message || 'The worker failed to start.' })
      handlers.onMessage({ type: 'done', durationMs: 0, steps: 0 })
      this.terminate()
    }

    const request: RunRequest = {
      source: options.source,
      debug: options.debug,
      breakpoints: options.breakpoints,
      watches: options.watches,
      breakOnEntry: options.breakOnEntry,
      sab,
    }
    worker.postMessage({ type: 'run', request })
    this.armTimer()
  }

  private armTimer(): void {
    this.clearTimer()
    this.timer = self.setTimeout(() => {
      if (!this.worker) return
      this.handlers?.onTimeout()
      this.terminate()
    }, this.timeoutMs)
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  private send(command: number): void {
    if (!this.ctrl) return
    Atomics.store(this.ctrl, CTRL_SLOT, command)
    Atomics.notify(this.ctrl, CTRL_SLOT)
  }

  resume(): void {
    if (!this.paused) return
    this.paused = false
    this.armTimer()
    this.send(CMD.CONTINUE)
  }

  step(): void {
    if (!this.paused) return
    this.paused = false
    this.armTimer()
    this.send(CMD.STEP)
  }

  /** Re-evaluates the watch list inside the frame that is currently paused. */
  updateWatches(expressions: string[]): void {
    if (!this.paused || !this.ctrl || !this.bytes) return
    const payload = new TextEncoder().encode(JSON.stringify(expressions))
    if (payload.byteLength > this.bytes.byteLength) return
    this.bytes.set(payload)
    Atomics.store(this.ctrl, LEN_SLOT, payload.byteLength)
    this.send(CMD.WATCH)
  }

  stop(): void {
    if (this.paused && this.ctrl) {
      this.paused = false
      this.send(CMD.STOP)
      // The worker still has to unwind, so give it a moment before pulling the plug.
      self.setTimeout(() => this.terminate(), 150)
      return
    }
    this.terminate()
  }

  terminate(): void {
    this.clearTimer()
    this.paused = false
    if (this.worker) {
      this.worker.onmessage = null
      this.worker.onerror = null
      this.worker.terminate()
      this.worker = null
    }
    this.ctrl = null
    this.bytes = null
  }
}
