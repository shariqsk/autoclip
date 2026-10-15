// The playhead lives outside the main store: it changes every frame, and only a few things (the time
// readout, scrubbers, waveform cursor) need it.

import { useSyncExternalStore } from 'react'
import type { PreviewEngine } from '../lib/render/preview'

let time = 0
let playing = false
const listeners = new Set<() => void>()
let engine: PreviewEngine | null = null

export const playhead = {
  get time() {
    return time
  },
  get playing() {
    return playing
  },
  set(t: number, isPlaying: boolean) {
    if (t === time && isPlaying === playing) return
    time = t
    playing = isPlaying
    for (const l of listeners) l()
  },
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  attach(e: PreviewEngine | null) {
    engine = e
  },
  seek(t: number) {
    engine?.seek(t)
  },
  toggle() {
    engine?.toggle()
  },
  pause() {
    engine?.pause()
  },
  play() {
    void engine?.play()
  },
  get engine() {
    return engine
  },
}

/** Re-render with the playhead, rounded to `step` seconds to keep updates cheap. */
export function usePlayhead(step = 0.1): { time: number; playing: boolean } {
  const t = useSyncExternalStore(playhead.subscribe, () => Math.floor(time / step) * step)
  const p = useSyncExternalStore(playhead.subscribe, () => playing)
  return { time: t, playing: p }
}
