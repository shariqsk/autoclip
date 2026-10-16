// Framing helpers shared by the live preview and the exporter.

import type { Layer } from '../edit/timeline'
import type { ClipAnalysis, FitMode } from '../types'

/** Focus point for smart cropping, read from the clip analysis at a source time. */
export function focusAt(a: ClipAnalysis, t: number): { x: number; y: number } {
  if (a.times.length < 2) return { x: a.focusX[0] ?? 0.5, y: a.focusY[0] ?? 0.5 }
  const dt = a.times[1] - a.times[0]
  const i = Math.min(a.times.length - 2, Math.max(0, Math.floor(t / dt)))
  const k = Math.min(1, Math.max(0, t / dt - i))
  return { x: a.focusX[i] * (1 - k) + a.focusX[i + 1] * k, y: a.focusY[i] * (1 - k) + a.focusY[i + 1] * k }
}

/** How much is moving in a clip at a source time, 0–1. */
export function motionAt(a: ClipAnalysis, t: number): number {
  if (a.times.length < 2) return a.motion[0] ?? 0
  const dt = a.times[1] - a.times[0]
  const i = Math.min(a.times.length - 1, Math.max(0, Math.round(t / dt)))
  return a.motion[i] ?? 0
}

/**
 * Where the picture sits in the frame, as fractions of the height: all of it when cropped to fill;
 * a band between bars when a wider shot is shown whole.
 */
export function pictureArea(fit: FitMode, src: { width: number; height: number } | null, out: { width: number; height: number }) {
  if (fit === 'fill' || !src) return { top: 0, height: 1 }
  const height = Math.min(1, out.width / out.height / (src.width / src.height))
  return { top: (1 - height) / 2, height }
}

/** Stills get a slow Ken Burns push so they never sit dead on screen. */
export function stillZoom(layer: Layer): number {
  return 1.02 + 0.1 * layer.progress
}
