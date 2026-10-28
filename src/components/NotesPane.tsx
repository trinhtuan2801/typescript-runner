import { useEffect, useRef } from 'react'
import { isBlankHtml, sanitizeHtml, textToHtml } from '../lib/sanitize'
import { TrashIcon } from './icons'
import { ghostButton, iconButton, pane, paneHead, paneTitle } from './ui'

interface Props {
  html: string
  onChange: (html: string) => void
}

/**
 * The problem description. Pasting from a site such as LeetCode keeps the
 * headings, lists, tables, code and images, and the text stays editable
 * afterwards. Nothing here is parsed or run.
 */
export function NotesPane({ html, onChange }: Props) {
  const ref = useRef<HTMLDivElement | null>(null)

  // The element owns its own content while you type, so it is only written to
  // when the value arrives from somewhere else, such as Clear or a page load.
  useEffect(() => {
    const node = ref.current
    if (node && node.innerHTML !== html) node.innerHTML = html
  }, [html])

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault()
    const markup = event.clipboardData.getData('text/html')
    const clean = markup
      ? sanitizeHtml(markup)
      : textToHtml(event.clipboardData.getData('text/plain'))
    if (!clean) return
    // insertHTML keeps the browser's own undo history intact.
    document.execCommand('insertHTML', false, clean)
  }

  const handleInput = () => {
    const node = ref.current
    if (!node) return
    onChange(isBlankHtml(node.innerHTML) ? '' : node.innerHTML)
  }

  return (
    <section className={pane}>
      <header className={paneHead}>
        <span className={paneTitle}>Problem</span>
        {html !== '' && (
          <button
            className={`${ghostButton} ${iconButton}`}
            onClick={() => onChange('')}
            title="Clear the description"
            aria-label="Clear the description"
          >
            <TrashIcon />
          </button>
        )}
      </header>
      <div
        ref={ref}
        className="notes rich min-h-0 flex-1 overflow-auto p-3.5 text-[13.5px] leading-relaxed outline-none"
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onPaste={handlePaste}
        onInput={handleInput}
        onBlur={handleInput}
        data-placeholder="Paste the problem description here. Formatting, tables and images are kept."
      />
    </section>
  )
}
