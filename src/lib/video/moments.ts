// Moments: the best few seconds of a long clip (a whole round, a full game, a long run of footage),
// found from the action score the clip analysis already made. Each moment stays inside one scene and
// leads in a little before its peak, the way an editor would trim it.

import type { ClipAnalysis } from '../types'

export interface Moment {
  start: number
  end: number
  /** Where the action peaks. */
  peak: number
  /** How strong the moment is, 0–1. */
  score: number
}

export interface MomentOptions {
  /** Shortest and longest moment, seconds. */
  min?: number
  max?: number
  /** At most this many. */
  count?: number
}

/** Long enough that finding moments in it is worth offering. */
export const MOMENT_MIN_CLIP = 12

function smooth(xs: number[], radius: number): number[] {
  return xs.map((_, i) => {
    let s = 0
    let n = 0
    for (let k = Math.max(0, i - radius); k <= Math.min(xs.length - 1, i + radius); k++) {
      s += xs[k]
      n++
    }
    return s / n
  })
}

export function findMoments(a: ClipAnalysis, opts: MomentOptions = {}): Moment[] {
  const min = opts.min ?? 2
  const max = opts.max ?? 8
  const count = opts.count ?? 12
  const n = a.times.length
  if (n < 4 || a.duration < min * 1.5) return []
  const dt = (a.times[n - 1] - a.times[0]) / (n - 1) || 0.2
  const score = smooth(a.interest, Math.max(1, Math.round(0.6 / dt)))
  const bounds = [0, ...a.cuts, a.duration]
  const sceneOf = (t: number) => {
    let i = 0
    while (i < bounds.length - 2 && t >= bounds[i + 1]) i++
    return [bounds[i], bounds[i + 1]] as const
  }

  const order = score.map((s, i) => [s, i] as const).sort((x, y) => y[0] - x[0])
  const best = order[0]?.[0] ?? 0
  const out: Moment[] = []
  for (const [s, i] of order) {
    if (out.length >= count || s < best * 0.4 || s < 0.15) break
    const peak = a.times[i]
    if (out.some((m) => peak >= m.start - 0.5 && peak <= m.end + 0.5)) continue
    const [sceneStart, sceneEnd] = sceneOf(peak)
    if (sceneEnd - sceneStart < min * 0.75) continue

    // Grow around the peak while the action holds up, then fit the length.
    let lo = i
    let hi = i
    while (lo > 0 && score[lo - 1] >= s * 0.55 && a.times[lo - 1] >= sceneStart) lo--
    while (hi < n - 1 && score[hi + 1] >= s * 0.55 && a.times[hi + 1] < sceneEnd) hi++
    let len = Math.min(max, Math.max(min, a.times[hi] - a.times[lo] + dt))
    // Lead in: more before the peak than after it.
    let start = peak - len * 0.6
    let end = start + len
    if (end > sceneEnd) {
      end = sceneEnd
      start = Math.max(sceneStart, end - len)
    }
    if (start < sceneStart) {
      start = sceneStart
      end = Math.min(sceneEnd, start + len)
    }
    len = end - start
    if (len < min * 0.75) continue
    const overlap = out.some((m) => Math.min(m.end, end) - Math.max(m.start, start) > len * 0.3)
    if (overlap) continue
    out.push({ start: round(start), end: round(end), peak: round(peak), score: Math.round(s * 100) / 100 })
  }
  return out.sort((x, y) => x.start - y.start)
}

const round = (x: number) => Math.round(x * 100) / 100

/**
 * The analysis of just [start, end) of a clip, with time starting at zero, so a moment can be planned
 * like any short clip. (Playback adds the moment's offset back when it seeks the file.)
 */
export function sliceAnalysis(a: ClipAnalysis, start: number, end: number): ClipAnalysis {
  const keep = a.times.map((t, i) => [t, i] as const).filter(([t]) => t >= start - 1e-6 && t < end)
  const idx = keep.map(([, i]) => i)
  const pick = (xs: number[]) => idx.map((i) => xs[i])
  return {
    ...a,
    duration: round(end - start),
    times: keep.map(([t]) => round(t - start)),
    motion: pick(a.motion),
    brightness: pick(a.brightness),
    sharpness: pick(a.sharpness),
    loudness: pick(a.loudness),
    focusX: pick(a.focusX),
    focusY: pick(a.focusY),
    interest: pick(a.interest),
    cuts: a.cuts.filter((c) => c > start && c < end).map((c) => round(c - start)),
  }
}
