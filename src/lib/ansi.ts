/**
 * Turns terminal colour codes into something the console pane can style.
 *
 * Helpers written for a terminal, such as the check utility, colour their
 * output with ANSI escapes. Without this they would show up as stray
 * characters like `[32mPASS[0m`.
 */

export interface AnsiSegment {
  text: string
  bold?: boolean
  dim?: boolean
  italic?: boolean
  underline?: boolean
  /** A colour name mapped to a theme variable by the pane. */
  color?: string
}

const COLORS: Record<number, string> = {
  30: 'black',
  31: 'red',
  32: 'green',
  33: 'yellow',
  34: 'blue',
  35: 'magenta',
  36: 'cyan',
  37: 'white',
  90: 'grey',
  91: 'red',
  92: 'green',
  93: 'yellow',
  94: 'blue',
  95: 'magenta',
  96: 'cyan',
  97: 'white',
}

const ESCAPE = /\x1b\[([0-9;]*)m/g

export function hasAnsi(text: string): boolean {
  return text.includes('\x1b[')
}

export function parseAnsi(input: string): AnsiSegment[] {
  if (!hasAnsi(input)) return [{ text: input }]

  const segments: AnsiSegment[] = []
  let style: Omit<AnsiSegment, 'text'> = {}
  let cursor = 0

  const push = (text: string) => {
    if (text) segments.push({ text, ...style })
  }

  ESCAPE.lastIndex = 0
  let match = ESCAPE.exec(input)
  while (match !== null) {
    push(input.slice(cursor, match.index))
    cursor = match.index + match[0].length

    const codes = match[1] === '' ? [0] : match[1].split(';').map(Number)
    for (const code of codes) {
      if (code === 0) style = {}
      else if (code === 1) style = { ...style, bold: true }
      else if (code === 2) style = { ...style, dim: true }
      else if (code === 3) style = { ...style, italic: true }
      else if (code === 4) style = { ...style, underline: true }
      else if (code === 22) style = { ...style, bold: false, dim: false }
      else if (code === 23) style = { ...style, italic: false }
      else if (code === 24) style = { ...style, underline: false }
      else if (code === 39) style = { ...style, color: undefined }
      else if (COLORS[code]) style = { ...style, color: COLORS[code] }
    }
    match = ESCAPE.exec(input)
  }

  push(input.slice(cursor))
  return segments
}
