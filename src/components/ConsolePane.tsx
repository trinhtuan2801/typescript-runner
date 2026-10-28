import { useEffect, useRef } from 'react'
import { hasAnsi, parseAnsi } from '../lib/ansi'
import type { LogEntry, LogLevel } from '../lib/protocol'
import { TrashIcon } from './icons'
import {
  emptyNote,
  ghostButton,
  headRight,
  iconButton,
  mono,
  pane,
  paneHead,
  paneTitle,
} from './ui'

const ANSI_COLOR: Record<string, string> = {
  red: 'text-bad',
  green: 'text-good',
  yellow: 'text-warn',
  blue: 'text-accent',
  magenta: 'text-ansi-magenta',
  cyan: 'text-ansi-cyan',
  white: 'text-ansi-white',
  black: 'text-ansi-black',
  grey: 'text-muted',
}

const LEVEL_COLOR: Record<LogLevel, string> = {
  log: '',
  info: '',
  warn: 'text-warn',
  error: 'text-bad',
  system: 'text-muted',
}

/** Renders a line, honouring any terminal colour codes it carries. */
function LogText({ text }: { text: string }) {
  if (!hasAnsi(text)) return <>{text}</>
  return (
    <>
      {parseAnsi(text).map((segment, index) => (
        <span
          key={index}
          className={[
            segment.bold ? 'font-bold' : '',
            segment.dim ? 'opacity-60' : '',
            segment.italic ? 'italic' : '',
            segment.underline ? 'underline' : '',
            segment.color ? (ANSI_COLOR[segment.color] ?? '') : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {segment.text}
        </span>
      ))}
    </>
  )
}

interface Props {
  logs: LogEntry[]
  summary: string
  onClear: () => void
}

export function ConsolePane(props: Props) {
  const logEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: 'end' })
  }, [props.logs.length])

  return (
    <section className={pane}>
      <header className={paneHead}>
        <span className={paneTitle}>Console</span>
        <div className={headRight}>
          {props.summary && <span className="text-[12px] text-muted">{props.summary}</span>}
          <button
            className={`${ghostButton} ${iconButton}`}
            onClick={props.onClear}
            title="Clear the console"
            aria-label="Clear the console"
          >
            <TrashIcon />
          </button>
        </div>
      </header>

      <div className={`min-h-0 flex-1 overflow-auto px-3 py-2 ${mono}`}>
        {props.logs.length === 0 ? (
          <p className={emptyNote}>Nothing logged yet. Use console.log in your code.</p>
        ) : (
          props.logs.map((entry) => (
            <div
              key={entry.id}
              className={`border-b border-border-soft py-[3px] break-words whitespace-pre-wrap ${LEVEL_COLOR[entry.level]}`}
            >
              <LogText text={entry.text} />
            </div>
          ))
        )}
        <div ref={logEndRef} />
      </div>
    </section>
  )
}
