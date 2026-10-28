import type { Options } from 'prettier'

/**
 * Formatting rules for code written in the editor. These mirror .prettierrc,
 * which covers the project's own source, so solutions and project files come
 * out looking the same. Keep the two in step when changing either one.
 */
export const EDITOR_FORMAT_OPTIONS: Options = {
  parser: 'typescript',
  semi: false,
  singleQuote: true,
  printWidth: 100,
  tabWidth: 2,
  trailingComma: 'all',
  arrowParens: 'always',
  bracketSpacing: true,
}

type PrettierBundle = Awaited<ReturnType<typeof loadPrettier>>

let bundle: Promise<PrettierBundle> | null = null

/** Loaded on first use so the formatter stays out of the initial download. */
async function loadPrettier() {
  const [standalone, typescript, estree] = await Promise.all([
    import('prettier/standalone'),
    import('prettier/plugins/typescript'),
    import('prettier/plugins/estree'),
  ])
  return { standalone, plugins: [typescript.default, estree.default] }
}

export type FormatResult = { ok: true; code: string } | { ok: false; message: string }

export async function formatSource(source: string): Promise<FormatResult> {
  try {
    if (!bundle) bundle = loadPrettier()
    const { standalone, plugins } = await bundle
    const code = await standalone.format(source, { ...EDITOR_FORMAT_OPTIONS, plugins })
    return { ok: true, code }
  } catch (err) {
    // Prettier puts a code frame after the first line, which is too much for a
    // one line notice, so only the summary is kept.
    const message = (err as Error)?.message ?? String(err)
    return { ok: false, message: message.split('\n')[0] }
  }
}

/**
 * Follows breakpoints across a reformat.
 *
 * Prettier can map a cursor position from the old text to the new one, which is
 * exactly the question being asked here, so each breakpoint is mapped through
 * that. If the mapping is unavailable the line text is matched instead, with
 * spacing, quotes and trailing punctuation normalised away, since those are the
 * things Prettier is most likely to have changed.
 */
export async function remapBreakpoints(
  before: string,
  after: string,
  lines: number[],
): Promise<number[]> {
  if (lines.length === 0) return lines

  const oldLines = before.split('\n')
  const lineStarts: number[] = []
  let offset = 0
  for (const line of oldLines) {
    lineStarts.push(offset)
    offset += line.length + 1
  }

  const mapped = new Set<number>()
  let bundleReady = true
  if (!bundle) bundle = loadPrettier()

  for (const line of lines) {
    const text = oldLines[line - 1]
    if (text === undefined || !text.trim()) continue

    if (bundleReady) {
      try {
        const { standalone, plugins } = await bundle
        const indent = text.length - text.trimStart().length
        const { cursorOffset } = await standalone.formatWithCursor(before, {
          ...EDITOR_FORMAT_OPTIONS,
          plugins,
          cursorOffset: lineStarts[line - 1] + indent,
        })
        if (cursorOffset >= 0) {
          const upTo = after.slice(0, cursorOffset)
          mapped.add(upTo.split('\n').length)
          continue
        }
      } catch {
        // Fall through to matching on the text of the line.
        bundleReady = false
      }
    }

    const found = findLine(after, text, line, mapped)
    if (found > 0) mapped.add(found)
  }

  return Array.from(mapped).sort((a, b) => a - b)
}

/** Strips away the details Prettier is free to change before comparing. */
function normalise(line: string): string {
  return line
    .replace(/\s+/g, '')
    .replace(/"/g, "'")
    .replace(/[;,]+$/, '')
}

function findLine(after: string, text: string, origin: number, taken: Set<number>): number {
  const target = normalise(text)
  if (!target) return -1
  const newLines = after.split('\n')

  const search = (matches: (candidate: string) => boolean) => {
    let best = -1
    let bestDistance = Infinity
    for (let index = 0; index < newLines.length; index++) {
      const line = index + 1
      if (taken.has(line)) continue
      if (!matches(normalise(newLines[index]))) continue
      const distance = Math.abs(line - origin)
      if (distance < bestDistance) {
        best = line
        bestDistance = distance
      }
    }
    return best
  }

  const exact = search((candidate) => candidate === target)
  if (exact > 0) return exact
  // Prettier may have split the statement over several lines.
  const head = target.slice(0, Math.min(10, target.length))
  return search((candidate) => candidate.startsWith(head))
}
