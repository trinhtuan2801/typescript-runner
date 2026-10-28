/**
 * Class strings shared by more than one component. Keeping them here means the
 * panes stay identical without repeating long utility lists in every file.
 */

export const pane = 'flex min-h-0 min-w-0 flex-col border border-border bg-panel'

/** Wraps rather than overflowing when a pane is squeezed narrow. */
export const paneHead =
  'flex min-h-10 flex-none flex-wrap items-center justify-between gap-2.5 border-b border-border bg-panel-2 px-3 py-2'

export const paneTitle = 'text-[13px] font-semibold'

export const paneBody = 'min-h-0 flex-1 overflow-auto p-3.5'

export const headRight = 'flex items-center gap-2'

export const mono = 'font-mono text-[12.5px]'

const button =
  'cursor-pointer rounded-md border text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-40'

export const ghostButton = `${button} border-border bg-transparent px-3 py-1.5 text-text enabled:hover:border-border-strong enabled:hover:bg-surface-hover`

export const secondaryButton = `${button} border-border-accent bg-surface-accent px-3 py-1.5 text-accent-text enabled:hover:border-border-strong`

export const dangerButton = `${button} border-danger-border bg-transparent px-3 py-1.5 text-bad enabled:hover:bg-surface-hover`

/** A square button that carries an icon instead of a label. Roomier on touch. */
export const iconButton = 'flex h-8 w-9 items-center justify-center !px-0 !py-0 md:h-[26px] md:w-7'

export const linkButton =
  'cursor-pointer border-none bg-transparent pl-2 text-[12px] font-normal normal-case tracking-normal text-accent'

export const input =
  'rounded-md border border-border bg-panel-2 px-2.5 py-1.5 font-sans text-[13px] text-text outline-none focus:border-accent'

/**
 * Sized to sit level with the toolbar toggles. Kept separate from `input`
 * rather than layered on top of it: two padding utilities on one element leave
 * the winner down to stylesheet order.
 */
export const select =
  'cursor-pointer rounded-md border border-border bg-panel-2 px-2 py-[3px] text-[12px] text-muted outline-none focus:border-accent'

export const emptyNote = 'text-muted'
