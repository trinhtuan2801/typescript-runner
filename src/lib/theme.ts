import { useEffect, useState } from 'react'

export type ThemeChoice =
  'system' | 'light' | 'dark' | 'one-dark' | 'dark-modern' | 'night-shift' | 'night-shift-light'
export type ResolvedTheme = Exclude<ThemeChoice, 'system'>

export const DEFAULT_THEME: ThemeChoice = 'dark-modern'

/** What System resolves to when the operating system asks for a dark theme. */
const DEFAULT_DARK: ResolvedTheme = 'dark-modern'

export const THEMES: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  // The app's own slate palette, named for its colour.
  { value: 'dark', label: 'Slate' },
  { value: 'one-dark', label: 'Atom One Dark' },
  { value: 'dark-modern', label: 'Dark Modern' },
  // Warm and low on blue, in the spirit of Night Shift, in both brightnesses.
  { value: 'night-shift', label: 'Night Shift' },
  { value: 'night-shift-light', label: 'Night Shift Light' },
]

const DARK_QUERY = '(prefers-color-scheme: dark)'

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return THEMES.some((theme) => theme.value === value)
}

/** The theme in force, following the operating system when asked to. */
export function useResolvedTheme(choice: ThemeChoice): ResolvedTheme {
  const [prefersDark, setPrefersDark] = useState(
    () => typeof matchMedia === 'function' && matchMedia(DARK_QUERY).matches,
  )

  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const query = matchMedia(DARK_QUERY)
    const onChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  if (choice !== 'system') return choice
  return prefersDark ? DEFAULT_DARK : 'light'
}

export function applyTheme(resolved: ResolvedTheme): void {
  document.documentElement.dataset.theme = resolved
}

export const MONACO_THEMES: Record<ResolvedTheme, string> = {
  dark: 'app-dark',
  'one-dark': 'app-one-dark',
  'dark-modern': 'app-dark-modern',
  'night-shift': 'app-night-shift',
  'night-shift-light': 'app-night-shift-light',
  light: 'app-light',
}
