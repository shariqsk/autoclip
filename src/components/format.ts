// Helpers shared by components (kept out of component files so fast refresh works).

import { twMerge } from 'tailwind-merge'
import type { ShotPhase } from '../lib/types'

export const cx = (...c: (string | false | null | undefined)[]) => twMerge(c.filter(Boolean).join(' '))

export const fmtTime = (t: number) => {
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  const cs = Math.floor((t % 1) * 10)
  return `${m}:${String(s).padStart(2, '0')}.${cs}`
}

/** Broadcast timecode: MM:SS:FF at 30 fps. */
export const timecode = (t: number, fps = 30) => {
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  const f = Math.floor((t % 1) * fps)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`
}

export const PHASE_NAMES: Record<ShotPhase, string> = {
  tease: 'Cold open',
  intro: 'Intro',
  build: 'Build',
  hero: 'Drop',
  flurry: 'Flurry',
  ride: 'Ride',
  outro: 'Outro',
}

/** Phase colours as theme variables, so the arc reads in every look. */
export const PHASE_COLORS: Record<ShotPhase, string> = {
  tease: 'var(--signal-2)',
  intro: 'var(--ink-3)',
  build: 'color-mix(in srgb, var(--signal) 55%, var(--ink-3))',
  hero: 'var(--signal)',
  flurry: 'color-mix(in srgb, var(--signal) 75%, var(--bg))',
  ride: 'var(--ink-2)',
  outro: 'var(--ink-3)',
}

const CLIP_HUES = [8, 42, 200, 280, 150, 330, 95, 250, 20, 175]

/** A stable colour per clip, by its position in the bin. */
export function clipColor(clipIds: string[], id: string) {
  const i = clipIds.indexOf(id)
  return `hsl(${CLIP_HUES[(i < 0 ? 0 : i) % CLIP_HUES.length]} 55% 50%)`
}
