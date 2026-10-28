import { useCallback, useRef } from 'react'

interface Props {
  orientation: 'vertical' | 'horizontal'
  onResize: (deltaPx: number) => void
}

/** A thin drag handle. The parent decides what the delta means. */
export function Splitter({ orientation, onResize }: Props) {
  const last = useRef(0)

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      const target = event.currentTarget
      target.setPointerCapture(event.pointerId)
      last.current = orientation === 'vertical' ? event.clientX : event.clientY

      const move = (moveEvent: PointerEvent) => {
        const position = orientation === 'vertical' ? moveEvent.clientX : moveEvent.clientY
        onResize(position - last.current)
        last.current = position
      }
      const up = (upEvent: PointerEvent) => {
        target.releasePointerCapture(upEvent.pointerId)
        target.removeEventListener('pointermove', move)
        target.removeEventListener('pointerup', up)
      }
      target.addEventListener('pointermove', move)
      target.addEventListener('pointerup', up)
    },
    [orientation, onResize],
  )

  return (
    <div
      className={`group relative bg-bg ${orientation === 'vertical' ? 'cursor-col-resize' : 'cursor-row-resize'}`}
      onPointerDown={handlePointerDown}
      role="separator"
      aria-orientation={orientation}
    >
      <div className="absolute inset-0 bg-border opacity-0 transition-opacity group-hover:opacity-100" />
    </div>
  )
}
