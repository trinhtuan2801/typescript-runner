import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { CodeEditor, type EditorHandle } from './components/CodeEditor'
import { ConsolePane } from './components/ConsolePane'
import { DebugPane } from './components/DebugPane'
import { NotesPane } from './components/NotesPane'
import { FormatIcon, PlayIcon } from './components/icons'
import { Splitter } from './components/Splitter'
import { ghostButton, iconButton, pane, paneHead, paneTitle, select } from './components/ui'
import { canIsolate, type LogEntry, type PausedState, type WorkerOut } from './lib/protocol'
import { useIsNarrow } from './lib/responsive'
import { Runner } from './lib/runner'
import { sanitizeHtml } from './lib/sanitize'
import { load, save } from './lib/storage'
import {
  applyTheme,
  DEFAULT_THEME,
  isThemeChoice,
  MONACO_THEMES,
  THEMES,
  useResolvedTheme,
  type ThemeChoice,
} from './lib/theme'
import { stripTypes } from './lib/typescript'

type Status = 'idle' | 'running' | 'paused'

type SectionKey = 'notes' | 'code' | 'console' | 'debug'

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'notes', label: 'Problem' },
  { key: 'code', label: 'Code' },
  { key: 'console', label: 'Console' },
  { key: 'debug', label: 'Debugger' },
]

const ALL_VISIBLE: Record<SectionKey, boolean> = {
  notes: true,
  code: true,
  console: true,
  debug: true,
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const chipBase =
  'cursor-pointer rounded-full border px-2.5 py-[3px] text-[12px] transition-colors disabled:cursor-not-allowed'

const chipOn = `${chipBase} border-border-accent bg-surface-accent text-accent-text`

const chipOff = `${chipBase} border-transparent bg-transparent text-muted`

const statusTone: Record<Status, string> = {
  idle: 'text-muted',
  running: 'text-warn',
  paused: 'text-accent',
}

const STARTER = `// Paste a solution here, then check it below.
function twoSum(nums: number[], target: number): number[] {
  const seen = new Map<number, number>()
  for (let i = 0; i < nums.length; i++) {
    const need = target - nums[i]
    if (seen.has(need)) return [seen.get(need)!, i]
    seen.set(nums[i], i)
  }
  return []
}

// Tests
check(() => twoSum([2, 7, 11, 15], 9), [0, 1])
check(() => twoSum([3, 2, 4], 6), [1, 2])
check(() => twoSum([3, 3], 6), [0, 1])
`

export default function App() {
  const runner = useRef<Runner | null>(null)
  if (runner.current === null) runner.current = new Runner()

  const editorHandle = useRef<EditorHandle | null>(null)
  const logId = useRef(0)

  const [code, setCode] = useState<string>(() => load('code', STARTER))
  // Anything restored from storage is cleaned again before it reaches the page.
  const [notes, setNotes] = useState<string>(() => sanitizeHtml(load('notes', '')))
  const [breakpoints, setBreakpoints] = useState<number[]>(() => load('breakpoints', []))
  const [watches, setWatches] = useState<string[]>(() => load('watches', []))
  const [varOrder, setVarOrder] = useState<string[]>(() => load('varOrder', []))

  const [logs, setLogs] = useState<LogEntry[]>([])
  const [paused, setPaused] = useState<PausedState | null>(null)
  const [trace, setTrace] = useState<PausedState[]>([])
  const [traceIndex, setTraceIndex] = useState(0)
  const [status, setStatus] = useState<Status>('idle')
  const [summary, setSummary] = useState('')
  const [errorLine, setErrorLine] = useState<number | null>(null)

  const [theme, setTheme] = useState<ThemeChoice>(() => {
    const stored = load<ThemeChoice>('theme', DEFAULT_THEME)
    return isThemeChoice(stored) ? stored : DEFAULT_THEME
  })
  const resolvedTheme = useResolvedTheme(theme)

  const [leftWidth, setLeftWidth] = useState(() => load('leftWidth', 300))
  const [rightWidth, setRightWidth] = useState(() => load('rightWidth', 320))
  const [consoleWidth, setConsoleWidth] = useState(() => load('consoleWidth', 320))
  const [visible, setVisible] = useState<Record<SectionKey, boolean>>(() => ({
    ...ALL_VISIBLE,
    ...load<Partial<Record<SectionKey, boolean>>>('visible', {}),
  }))
  // On a narrow screen the panes cannot sit side by side, so one is shown at a
  // time and the same toolbar picks which.
  const narrow = useIsNarrow()
  const [activeSection, setActiveSection] = useState<SectionKey>(() =>
    load<SectionKey>('activeSection', 'code'),
  )

  useEffect(() => {
    save('theme', theme)
  }, [theme])
  useEffect(() => {
    applyTheme(resolvedTheme)
  }, [resolvedTheme])
  useEffect(() => {
    save('code', code)
  }, [code])
  useEffect(() => {
    save('notes', notes)
  }, [notes])
  useEffect(() => {
    save('breakpoints', breakpoints)
  }, [breakpoints])
  useEffect(() => {
    save('watches', watches)
  }, [watches])
  useEffect(() => {
    save('varOrder', varOrder)
  }, [varOrder])
  useEffect(() => {
    save('leftWidth', leftWidth)
  }, [leftWidth])
  useEffect(() => {
    save('rightWidth', rightWidth)
  }, [rightWidth])
  useEffect(() => {
    save('consoleWidth', consoleWidth)
  }, [consoleWidth])
  useEffect(() => {
    save('visible', visible)
  }, [visible])
  useEffect(() => {
    save('activeSection', activeSection)
  }, [activeSection])
  useEffect(() => () => runner.current?.terminate(), [])

  const appendLog = useCallback((level: LogEntry['level'], text: string) => {
    setLogs((current) => [...current, { id: logId.current++, level, text }])
  }, [])

  const handleMessage = useCallback(
    (message: WorkerOut) => {
      switch (message.type) {
        case 'console':
          appendLog(message.level, message.text)
          break
        case 'paused':
          setPaused(message.state)
          setStatus('paused')
          break
        case 'trace':
          setTrace(message.frames)
          setTraceIndex(0)
          setPaused(message.frames[0] ?? null)
          break
        case 'error':
          appendLog(
            'error',
            message.line ? `${message.message} (line ${message.line})` : message.message,
          )
          setErrorLine(message.line ?? null)
          break
        case 'done':
          setStatus('idle')
          setPaused((current) => (current?.recorded ? current : null))
          setSummary(
            message.steps > 0
              ? `finished in ${message.durationMs.toFixed(0)} ms, ${message.steps.toLocaleString()} steps`
              : `finished in ${message.durationMs.toFixed(0)} ms`,
          )
          break
      }
    },
    [appendLog],
  )

  const run = useCallback(
    async (debug: boolean, breakOnEntry = false) => {
      const active = runner.current
      if (!active) return
      active.terminate()
      setLogs([])
      setPaused(null)
      setTrace([])
      setTraceIndex(0)
      setErrorLine(null)
      setSummary('')
      setStatus('running')

      // Types are removed before the code reaches the worker. Every character
      // keeps its position, so line numbers still match the editor exactly.
      const stripped = await stripTypes(code)
      if (!stripped.ok) {
        appendLog(
          'error',
          stripped.line ? `${stripped.message} (line ${stripped.line})` : stripped.message,
        )
        setErrorLine(stripped.line ?? null)
        setStatus('idle')
        return
      }

      active.start(
        {
          source: stripped.code,
          debug,
          breakpoints,
          watches,
          breakOnEntry,
          timeoutMs: debug ? 20_000 : 10_000,
        },
        {
          onMessage: handleMessage,
          onTimeout: () => {
            appendLog('error', 'Stopped after no response for a while. Check for an endless loop.')
            setStatus('idle')
          },
        },
      )
    },
    [appendLog, breakpoints, code, handleMessage, watches],
  )

  const onContinue = useCallback(() => {
    if (!runner.current?.isPaused) return
    setPaused(null)
    setStatus('running')
    runner.current.resume()
  }, [])

  const onStep = useCallback(() => {
    if (!runner.current?.isPaused) return
    runner.current.step()
  }, [])

  const onStop = useCallback(() => {
    runner.current?.stop()
    setStatus('idle')
    setPaused(null)
  }, [])

  const toggleBreakpoint = useCallback((line: number) => {
    setBreakpoints((current) =>
      current.includes(line)
        ? current.filter((item) => item !== line)
        : [...current, line].sort((a, b) => a - b),
    )
  }, [])

  const addWatch = useCallback((expression: string) => {
    setWatches((current) => {
      if (current.includes(expression)) return current
      const next = [...current, expression]
      runner.current?.updateWatches(next)
      return next
    })
  }, [])

  const reorderWatches = useCallback((from: number, to: number) => {
    setWatches((current) => {
      if (from < 0 || to < 0 || from >= current.length || to >= current.length) return current
      const next = [...current]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      runner.current?.updateWatches(next)
      return next
    })
  }, [])

  const removeWatch = useCallback((index: number) => {
    setWatches((current) => {
      const next = current.filter((_, i) => i !== index)
      runner.current?.updateWatches(next)
      return next
    })
  }, [])

  const formatCode = useCallback(() => {
    editorHandle.current?.format()
  }, [])

  const reportFormatError = useCallback(
    (message: string) => {
      appendLog('error', `Could not format: ${message}`)
    },
    [appendLog],
  )

  const showTraceFrame = useCallback(
    (index: number) => {
      const next = clamp(index, 0, trace.length - 1)
      setTraceIndex(next)
      setPaused(trace[next] ?? null)
    },
    [trace],
  )

  // Window level shortcuts, so they work even when focus is outside the editor.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        void run(event.shiftKey)
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        formatCode()
        return
      }
      if (event.key === 'F5' && !event.shiftKey) {
        event.preventDefault()
        onContinue()
        return
      }
      if (event.key === 'F10') {
        event.preventDefault()
        onStep()
        return
      }
      if (event.key === 'F5' && event.shiftKey) {
        event.preventDefault()
        onStop()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [run, onContinue, onStep, onStop, formatCode])

  const busy = status === 'running'

  // The grid is rebuilt from whichever sections are showing, so a hidden one
  // takes its splitter with it.
  const shown = SECTIONS.filter((section) => visible[section.key])
  const flexKey: SectionKey =
    shown.some((section) => section.key === 'code') || shown.length === 0
      ? 'code'
      : shown[shown.length - 1].key

  const fixedWidth: Record<SectionKey, number> = {
    notes: leftWidth,
    code: 0,
    console: consoleWidth,
    debug: rightWidth,
  }

  const resizers: Record<SectionKey, (delta: number) => void> = {
    notes: (delta) => setLeftWidth((value) => clamp(value + delta, 220, 720)),
    code: () => {},
    console: (delta) => setConsoleWidth((value) => clamp(value + delta, 220, 720)),
    debug: (delta) => setRightWidth((value) => clamp(value + delta, 240, 640)),
  }

  // The fixed panes may shrink when the window is too small to hold them all,
  // but the flexible one keeps a floor so the editor never squeezes to nothing.
  const template = shown
    .map((section) =>
      section.key === flexKey ? 'minmax(240px, 1fr)' : `minmax(0, ${fixedWidth[section.key]}px)`,
    )
    .join(' 6px ')

  // A splitter moves whichever neighbour has a fixed width.
  const splitterResize = (leftIndex: number) => (delta: number) => {
    const left = shown[leftIndex]
    const right = shown[leftIndex + 1]
    if (left.key !== flexKey) resizers[left.key](delta)
    else if (right) resizers[right.key](-delta)
  }

  const toggleSection = (key: SectionKey) => {
    setVisible((current) => {
      const next = { ...current, [key]: !current[key] }
      // Never hide the last one standing.
      if (!SECTIONS.some((section) => next[section.key])) return current
      return next
    })
  }

  const nodes: Record<SectionKey, React.ReactNode> = {
    notes: <NotesPane html={notes} onChange={setNotes} />,
    code: (
      <section className={pane}>
        <header className={paneHead}>
          <span className="flex items-center gap-2">
            <span className={paneTitle}>Code</span>
            {status !== 'idle' && (
              <span className={`text-[12px] tracking-[0.08em] uppercase ${statusTone[status]}`}>
                {status}
              </span>
            )}
          </span>
          <div className="flex items-center gap-2">
            <button
              className={`${ghostButton} ${iconButton}`}
              onClick={() => void run(false)}
              disabled={busy}
              title="Run (Cmd or Ctrl and Enter)"
              aria-label="Run"
            >
              <PlayIcon />
            </button>
            <button
              className={`${ghostButton} ${iconButton}`}
              onClick={formatCode}
              title="Format with Prettier (Shift and Alt and F)"
              aria-label="Format"
            >
              <FormatIcon />
            </button>
          </div>
        </header>
        <CodeEditor
          ref={editorHandle}
          theme={MONACO_THEMES[resolvedTheme]}
          value={code}
          onChange={setCode}
          breakpoints={breakpoints}
          onToggleBreakpoint={toggleBreakpoint}
          pausedLine={paused?.line ?? null}
          errorLine={errorLine}
          onRun={() => void run(false)}
          onDebug={() => void run(true, breakpoints.length === 0)}
          onStep={onStep}
          onContinue={onContinue}
          onFormatError={reportFormatError}
          onBreakpointsMoved={setBreakpoints}
          autoFormat={status === 'idle'}
          narrow={narrow}
        />
      </section>
    ),
    console: (
      <ConsolePane
        logs={logs}
        summary={summary}
        onClear={() => {
          setLogs([])
          setSummary('')
        }}
      />
    ),
    debug: (
      <DebugPane
        onDebug={() => void run(true, breakpoints.length === 0)}
        busy={busy}
        canStop={busy || status === 'paused'}
        paused={paused}
        trace={trace}
        traceIndex={traceIndex}
        onTraceIndexChange={showTraceFrame}
        watches={watches}
        onAddWatch={addWatch}
        onRemoveWatch={removeWatch}
        onReorderWatches={reorderWatches}
        varOrder={varOrder}
        onReorderVars={setVarOrder}
        canPause={canIsolate()}
        isPaused={status === 'paused' && !paused?.recorded}
        onContinue={onContinue}
        onStep={onStep}
        onStop={onStop}
      />
    ),
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-none flex-wrap items-center gap-1 border-b border-border bg-panel-2 px-2.5 py-[5px]">
        {SECTIONS.map((section) => (
          <button
            key={section.key}
            className={
              (narrow ? activeSection === section.key : visible[section.key]) ? chipOn : chipOff
            }
            onClick={() => (narrow ? setActiveSection(section.key) : toggleSection(section.key))}
            aria-pressed={narrow ? activeSection === section.key : visible[section.key]}
            title={
              narrow
                ? `Show ${section.label}`
                : `${visible[section.key] ? 'Hide' : 'Show'} the ${section.label} section`
            }
          >
            {section.label}
          </button>
        ))}
        <select
          className={`ml-2 ${select}`}
          value={theme}
          onChange={(event) => setTheme(event.target.value as ThemeChoice)}
          title="Theme"
          aria-label="Theme"
        >
          {THEMES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </header>

      {narrow ? (
        // A single cell grid, so the pane stretches to fill it exactly as the
        // columns do on a wider screen.
        <main className="grid min-h-0 flex-1 bg-bg">{nodes[activeSection]}</main>
      ) : (
        <main className="grid min-h-0 flex-1 bg-bg" style={{ gridTemplateColumns: template }}>
          {shown.map((section, index) => (
            <Fragment key={section.key}>
              {index > 0 && (
                <Splitter orientation="vertical" onResize={splitterResize(index - 1)} />
              )}
              {nodes[section.key]}
            </Fragment>
          ))}
        </main>
      )}
    </div>
  )
}
