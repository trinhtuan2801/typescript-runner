import { useEffect, useMemo, useRef, useState } from 'react'
import type { PausedState, VarEntry } from '../lib/protocol'
import { load, save } from '../lib/storage'
import {
  BugIcon,
  ChevronIcon,
  CloseIcon,
  ContinueIcon,
  PlusIcon,
  StepIcon,
  StopIcon,
} from './icons'
import {
  dangerButton,
  ghostButton,
  iconButton,
  input,
  linkButton,
  mono,
  pane,
  paneHead,
  paneTitle,
  secondaryButton,
} from './ui'

const sectionHeading =
  'mb-2 flex items-center gap-1 text-[11px] font-semibold tracking-[0.07em] text-muted uppercase'

const sectionToggle =
  'flex cursor-pointer items-center border-none bg-transparent p-0 text-inherit uppercase'

const rowBase = 'draggable-row cursor-grab border-b border-border-soft'

const softLabel = 'font-normal tracking-normal normal-case text-muted'

const dropShadow = {
  above: 'shadow-[inset_0_2px_0_-1px_var(--accent)]',
  below: 'shadow-[inset_0_-2px_0_-1px_var(--accent)]',
}

interface Props {
  onDebug: () => void
  busy: boolean
  canStop: boolean
  paused: PausedState | null
  trace: PausedState[]
  traceIndex: number
  onTraceIndexChange: (index: number) => void
  watches: string[]
  onAddWatch: (expression: string) => void
  onRemoveWatch: (index: number) => void
  onReorderWatches: (from: number, to: number) => void
  /** Variable names in the order you dragged them into. */
  varOrder: string[]
  onReorderVars: (names: string[]) => void
  canPause: boolean
  isPaused: boolean
  onContinue: () => void
  onStep: () => void
  onStop: () => void
}

/** Drag and drop plumbing shared by both lists. */
function useReorder(onReorder: (from: number, to: number) => void) {
  // The index being dragged lives in a ref as well as in state: the ref is
  // readable the instant the drop fires, while the state is only there to
  // drive the highlight.
  const sourceRef = useRef<number | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  const finish = () => {
    sourceRef.current = null
    setDragIndex(null)
    setOverIndex(null)
  }

  const rowProps = (index: number) => ({
    draggable: true,
    onDragStart: (event: React.DragEvent) => {
      sourceRef.current = index
      setDragIndex(index)
      event.dataTransfer.effectAllowed = 'move'
      // Some browsers refuse to start a drag without payload.
      event.dataTransfer.setData('text/plain', String(index))
    },
    onDragOver: (event: React.DragEvent) => {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      if (overIndex !== index) setOverIndex(index)
    },
    onDrop: (event: React.DragEvent) => {
      event.preventDefault()
      const from = sourceRef.current
      if (from !== null && from !== index) onReorder(from, index)
      finish()
    },
    onDragEnd: finish,
  })

  const rowClass = (index: number) => {
    if (dragIndex === index) return 'cursor-grabbing opacity-45'
    if (overIndex === index && dragIndex !== null) {
      return dragIndex < index ? dropShadow.below : dropShadow.above
    }
    return ''
  }

  return { rowProps, rowClass }
}

/** Applies a saved order to whatever the paused frame reported. */
function applyOrder(vars: VarEntry[], order: string[]): VarEntry[] {
  if (order.length === 0) return vars
  const rank = new Map(order.map((name, index) => [name, index]))
  return [...vars].sort((a, b) => (rank.get(a.name) ?? Infinity) - (rank.get(b.name) ?? Infinity))
}

export function DebugPane(props: Props) {
  const [draft, setDraft] = useState('')
  const [showFunctions, setShowFunctions] = useState(false)
  const [watchOpen, setWatchOpen] = useState(() => load('watchOpen', true))
  const [varsOpen, setVarsOpen] = useState(() => load('varsOpen', true))

  useEffect(() => {
    save('watchOpen', watchOpen)
  }, [watchOpen])
  useEffect(() => {
    save('varsOpen', varsOpen)
  }, [varsOpen])

  const frame = props.paused
  const ordered = useMemo(
    () => (frame ? applyOrder(frame.vars, props.varOrder) : []),
    [frame, props.varOrder],
  )
  const vars = ordered.filter((entry) => showFunctions || !entry.callable)
  const hiddenCount = ordered.length - vars.length

  const watchDrag = useReorder(props.onReorderWatches)

  // Dragging happens on the visible rows, so the saved order is rebuilt by
  // moving that name next to the one it was dropped on.
  const varDrag = useReorder((from, to) => {
    const moved = vars[from]?.name
    const target = vars[to]?.name
    if (!moved || !target) return
    const names = ordered.map((entry) => entry.name).filter((name) => name !== moved)
    const at = names.indexOf(target)
    names.splice(from < to ? at + 1 : at, 0, moved)
    props.onReorderVars(names)
  })

  const submitWatch = (event: React.FormEvent) => {
    event.preventDefault()
    const expression = draft.trim()
    if (!expression) return
    props.onAddWatch(expression)
    setDraft('')
  }

  return (
    <section className={pane}>
      <header className={paneHead}>
        <span className={paneTitle}>Debugger</span>
        <div className="flex gap-1.5">
          <button
            className={`${secondaryButton} ${iconButton}`}
            onClick={props.onDebug}
            disabled={props.busy}
            title="Start debugging (Cmd or Ctrl and Shift and Enter)"
            aria-label="Debug"
          >
            <BugIcon />
          </button>
          <button
            className={`${ghostButton} ${iconButton}`}
            onClick={props.onContinue}
            disabled={!props.isPaused}
            title="Next point: run on to the next breakpoint (F5)"
            aria-label="Next point"
          >
            <ContinueIcon />
          </button>
          <button
            className={`${ghostButton} ${iconButton}`}
            onClick={props.onStep}
            disabled={!props.isPaused}
            title="Next line: run the next line (F10)"
            aria-label="Next line"
          >
            <StepIcon />
          </button>
          <button
            className={`${dangerButton} ${iconButton}`}
            onClick={props.onStop}
            disabled={!props.canStop}
            title="Stop (Shift and F5)"
            aria-label="Stop"
          >
            <StopIcon />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {!props.canPause && (
          <p className="mb-3 rounded-md border border-notice-border bg-notice-bg px-2.5 py-2 text-[12px] text-notice-text">
            Live pausing needs cross origin isolation, which is not active in this browser session.
            Breakpoint hits are recorded instead and you can walk through them once the run
            finishes.
          </p>
        )}

        <div className="mb-3.5 flex flex-wrap items-center gap-2 text-[12px]">
          {frame ? (
            <>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] ${frame.recorded ? 'bg-violet-bg text-violet' : 'bg-surface-accent text-accent'}`}
              >
                {frame.recorded ? 'Recorded' : 'Paused'}
              </span>
              <span>line {frame.line}</span>
              <span className="text-muted">step {frame.step}</span>
            </>
          ) : (
            <span className="text-muted">
              Not paused. Click the gutter to set a breakpoint, then press Debug.
            </span>
          )}
        </div>

        {props.trace.length > 0 && (
          <div className="mb-3.5 flex items-center gap-2.5 text-[12px]">
            <button
              className={ghostButton}
              onClick={() => props.onTraceIndexChange(props.traceIndex - 1)}
              disabled={props.traceIndex <= 0}
            >
              Previous
            </button>
            <span className="text-muted">
              hit {props.traceIndex + 1} of {props.trace.length}
            </span>
            <button
              className={ghostButton}
              onClick={() => props.onTraceIndexChange(props.traceIndex + 1)}
              disabled={props.traceIndex >= props.trace.length - 1}
            >
              Next
            </button>
          </div>
        )}

        <div className="mb-5">
          <h3 className={sectionHeading}>
            <button
              className={sectionToggle}
              onClick={() => setWatchOpen((open) => !open)}
              aria-expanded={watchOpen}
            >
              <span
                className={`mr-1.5 inline-flex transition-transform ${watchOpen ? 'rotate-90' : ''}`}
              >
                <ChevronIcon />
              </span>
              Watch
            </button>
            {watchOpen && props.watches.length > 1 && (
              <span className={softLabel}> drag to reorder</span>
            )}
            {!watchOpen && props.watches.length > 0 && (
              <span className="text-muted"> {props.watches.length}</span>
            )}
          </h3>
          {watchOpen && (
            <>
              <form onSubmit={submitWatch} className="mb-2 flex gap-1.5">
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="for example nums[i] or seen.size"
                  spellCheck={false}
                  className={`min-w-0 flex-1 ${input}`}
                />
                <button
                  type="submit"
                  className={`${ghostButton} ${iconButton}`}
                  title="Add watch"
                  aria-label="Add watch"
                >
                  <PlusIcon />
                </button>
              </form>
              {props.watches.length === 0 ? (
                <p className="my-1 text-[12px] text-muted">No watch expressions yet.</p>
              ) : (
                <ul className={`m-0 list-none p-0 ${mono}`}>
                  {props.watches.map((expression, index) => {
                    const value = frame?.watches.find((item) => item.expr === expression)
                    return (
                      <li
                        key={`${expression}-${index}`}
                        className={[
                          'grid grid-cols-[10px_1fr_auto_18px] items-baseline gap-2 py-1',
                          rowBase,
                          watchDrag.rowClass(index),
                        ].join(' ')}
                        {...watchDrag.rowProps(index)}
                      >
                        <span className="grip" aria-hidden="true" />
                        <span className="overflow-hidden text-ellipsis text-ident">
                          {expression}
                        </span>
                        <span
                          className={`text-right break-all ${value?.failed ? 'text-bad' : 'text-text'}`}
                        >
                          {value ? value.value : frame ? 'pending' : 'waiting for a pause'}
                        </span>
                        <button
                          className="inline-flex cursor-pointer items-center justify-center border-none bg-transparent px-1 text-muted hover:text-bad"
                          onClick={() => props.onRemoveWatch(index)}
                          title="Remove"
                          aria-label={`Remove watch ${expression}`}
                        >
                          <CloseIcon />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}
        </div>

        <div className="mb-5">
          <h3 className={sectionHeading}>
            <button
              className={sectionToggle}
              onClick={() => setVarsOpen((open) => !open)}
              aria-expanded={varsOpen}
            >
              <span
                className={`mr-1.5 inline-flex transition-transform ${varsOpen ? 'rotate-90' : ''}`}
              >
                <ChevronIcon />
              </span>
              Variables
            </button>
            {!varsOpen && vars.length > 0 && <span className="text-muted"> {vars.length}</span>}
            {varsOpen && frame && vars.length > 1 && (
              <span className={softLabel}> drag to reorder</span>
            )}
            {varsOpen && hiddenCount > 0 && (
              <button className={linkButton} onClick={() => setShowFunctions((value) => !value)}>
                {showFunctions ? 'hide functions' : `show ${hiddenCount} functions`}
              </button>
            )}
            {varsOpen && props.varOrder.length > 0 && (
              <button className={linkButton} onClick={() => props.onReorderVars([])}>
                reset order
              </button>
            )}
          </h3>
          {!varsOpen ? null : !frame ? (
            <p className="my-1 text-[12px] text-muted">Variables appear when execution stops.</p>
          ) : vars.length === 0 ? (
            <p className="my-1 text-[12px] text-muted">Nothing in scope here.</p>
          ) : (
            <table className={`w-full border-collapse ${mono}`}>
              <tbody>
                {vars.map((entry, index) => (
                  <tr
                    key={entry.name}
                    className={`${rowBase} ${varDrag.rowClass(index)}`}
                    {...varDrag.rowProps(index)}
                  >
                    <td className="w-3 pr-0.5 align-top">
                      <span className="grip" aria-hidden="true" />
                    </td>
                    <td className="py-[3px] pr-1.5 align-top whitespace-nowrap text-ident">
                      {entry.name}
                    </td>
                    <td className="py-[3px] pr-1.5 align-top text-[11px] whitespace-nowrap text-muted">
                      {entry.type}
                    </td>
                    <td className="py-[3px] align-top break-all" title={entry.value}>
                      {entry.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  )
}
