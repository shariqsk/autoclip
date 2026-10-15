import { useEffect, useState } from 'react'

export type ThemeId = 'arena' | 'neon' | 'paper'
export const THEMES: { id: ThemeId; name: string; note: string; swatch: [string, string, string] }[] = [
  { id: 'arena', name: 'Arena', note: 'Fight-night dark', swatch: ['#0b0b0d', '#ff3b2f', '#ffc93c'] },
  { id: 'neon', name: 'Neon', note: 'After-hours glow', swatch: ['#07061a', '#22e5ff', '#ff3df2'] },
  { id: 'paper', name: 'Paper', note: 'Daylight sticker', swatch: ['#f4ecdd', '#17130e', '#ff4a1c'] },
]
const KEY = 'autoclip:theme'

export function useTheme() {
  const [theme, setTheme] = useState<ThemeId>(() => {
    const t = localStorage.getItem(KEY) as ThemeId | null
    return THEMES.some((x) => x.id === t) ? t! : 'arena'
  })
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(KEY, theme)
    const meta = document.querySelector('meta[name="theme-color"]')
    meta?.setAttribute('content', THEMES.find((x) => x.id === theme)!.swatch[0])
  }, [theme])
  const cycle = () => setTheme((t) => THEMES[(THEMES.findIndex((x) => x.id === t) + 1) % THEMES.length].id)
  return { theme, setTheme, cycle }
}
