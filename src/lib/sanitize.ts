import DOMPurify from 'dompurify'

/**
 * Cleans HTML pasted from a web page before it is shown or stored.
 *
 * Structure is what matters here: headings, lists, tables, code and images all
 * survive, while the source page's own colours, fonts and classes are dropped so
 * the description reads as part of this app rather than fighting its theme.
 * Scripts, event handlers and anything else executable are removed, which also
 * matters because this HTML is kept in local storage and put back on the page.
 */
const ALLOWED_TAGS = [
  'p',
  'br',
  'div',
  'span',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'del',
  'ins',
  'mark',
  'small',
  'code',
  'pre',
  'kbd',
  'samp',
  'var',
  'sup',
  'sub',
  'ul',
  'ol',
  'li',
  'dl',
  'dt',
  'dd',
  'blockquote',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'caption',
  'a',
  'img',
  'figure',
  'figcaption',
  'hr',
]

const ALLOWED_ATTR = ['href', 'src', 'alt', 'title', 'colspan', 'rowspan']

let hooked = false

function addHooks(): void {
  if (hooked) return
  hooked = true
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.hasAttribute('href')) {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noreferrer noopener')
    }
    if (node.tagName === 'IMG') {
      // A relative or junk source cannot resolve here and would leave a broken
      // image in the description, so only real remote or inline images stay.
      const src = node.getAttribute('src') ?? ''
      if (!/^(https?:|data:image\/)/i.test(src)) {
        node.remove()
        return
      }
      node.setAttribute('loading', 'lazy')
    }
    if (node.tagName === 'A' && !node.hasAttribute('href')) {
      node.replaceWith(...Array.from(node.childNodes))
    }
  })
}

export function sanitizeHtml(html: string): string {
  if (!html) return ''
  addHooks()
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ADD_ATTR: ['target', 'rel', 'loading'],
    ADD_DATA_URI_TAGS: ['img'],
    ALLOW_DATA_ATTR: false,
    KEEP_CONTENT: true,
  })
}

/** Turns plain text into simple HTML, used when a paste carries no markup. */
export function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  return escaped
    .split(/\r?\n/)
    .map((line) => (line.trim() === '' ? '<br>' : `<div>${line}</div>`))
    .join('')
}

/** True when the editable area holds nothing but empty markup. */
export function isBlankHtml(html: string): boolean {
  return html.replace(/<br\s*\/?>|&nbsp;|\s|<div>\s*<\/div>|<p>\s*<\/p>/gi, '') === ''
}
