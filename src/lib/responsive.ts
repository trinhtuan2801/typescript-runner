import { useEffect, useState } from 'react'

/** Below this width the panes are shown one at a time instead of side by side. */
export const NARROW_QUERY = '(max-width: 767px)'

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof matchMedia === 'function' && matchMedia(query).matches,
  )

  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const list = matchMedia(query)
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches)
    setMatches(list.matches)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [query])

  return matches
}

export const useIsNarrow = () => useMediaQuery(NARROW_QUERY)
