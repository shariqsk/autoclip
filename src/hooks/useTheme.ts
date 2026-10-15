import { useEffect, useState } from 'react'

export type ThemeId = 'fight' | 'press' | 'afterhours'
export const THEMES: { id: ThemeId; name: string; note: string; swatch: [string, string, string] }[] = [
  { id: 'fight', name: 'Fight Night', note: 'Arena black, broadcast red', swatch: ['#0a0a0a', '#efe9dd', '#ff2a14'] },
  { id: 'press', name: 'Press', note: 'The printed fight poster', swatch: ['#ece6d8', '#141210', '#d4210f'] },
  { id: 'afterhours', name: 'Afterhours', note: 'Violet black, acid lime', swatch: ['#0c0a14', '#ece7ff', '#c2ff2e'] },
]
const KEY = 'autoclip:theme'

export function useTheme() {
  const [theme, setTheme] = useState<ThemeId>(() => {
    const t = localStorage.getItem(KEY) as ThemeId | null
    return THEMES.some((x) => x.id === t) ? t! : 'fight'
  })
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(KEY, theme)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEMES.find((x) => x.id === theme)!.swatch[0])
  }, [theme])
  const cycle = () => setTheme((t) => THEMES[(THEMES.findIndex((x) => x.id === t) + 1) % THEMES.length].id)
  return { theme, setTheme, cycle }
}
