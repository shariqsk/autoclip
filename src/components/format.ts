// Helpers shared by components (kept out of component files so fast refresh works).

import { twMerge } from 'tailwind-merge'
import type { SectionLabel } from '../lib/types'

export const cx = (...c: (string | false | null | undefined)[]) => twMerge(c.filter(Boolean).join(' '))

export const fmtTime = (t: number) => {
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  const cs = Math.floor((t % 1) * 10)
  return `${m}:${String(s).padStart(2, '0')}.${cs}`
}

export const SECTION_COLORS: Record<SectionLabel, string> = {
  intro: '#7d7a72',
  verse: '#5b8def',
  build: '#ff9f1c',
  drop: '#ff3b2f',
  break: '#4fc3a1',
  outro: '#7d7a72',
}

const CLIP_HUES = [12, 45, 200, 280, 150, 330, 95, 250, 20, 175]

/** A stable colour per clip, by its position in the bin. */
export function clipColor(clipIds: string[], id: string) {
  const i = clipIds.indexOf(id)
  return `hsl(${CLIP_HUES[(i < 0 ? 0 : i) % CLIP_HUES.length]} 70% 55%)`
}
