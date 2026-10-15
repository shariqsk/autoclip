// Song structure: split the song into sections at bar boundaries where the sound changes, rate each
// section's energy, and find the drops (the moments the energy lands after a build).

import type { Drop, Section, SectionLabel } from '../types'

export interface BarFeatures {
  /** Bar start times, seconds. One extra entry at the end marks the last bar's end. */
  times: number[]
  /** One feature vector per bar (timbre + harmony). */
  vectors: Float32Array[]
  /** Loudness per bar, 0–1. */
  energy: number[]
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}

/**
 * Foote novelty: slide a checkerboard kernel down the diagonal of the bar-to-bar similarity matrix.
 * Peaks are bars where "before" is self-similar, "after" is self-similar, and the two differ.
 */
export function novelty(vectors: Float32Array[], half = 4): number[] {
  const n = vectors.length
  const sim: number[][] = vectors.map((a) => vectors.map((b) => cosine(a, b)))
  const out: number[] = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    let s = 0
    let w = 0
    for (let u = -half; u < half; u++) {
      for (let v = -half; v < half; v++) {
        const a = i + u
        const b = i + v
        if (a < 0 || b < 0 || a >= n || b >= n) continue
        const sign = u < 0 === v < 0 ? 1 : -1
        const taper = Math.exp(-((u + 0.5) ** 2 + (v + 0.5) ** 2) / (2 * (half * 0.6) ** 2))
        s += sign * taper * sim[a][b]
        w += taper
      }
    }
    out[i] = w ? s / w : 0
  }
  return out
}

/** Section boundaries (bar indices), favouring phrase lengths of 4 and 8 bars. */
export function findBoundaries(bars: BarFeatures, minBars = 4): number[] {
  const n = bars.vectors.length
  if (n < minBars * 2) return [0]
  const nov = novelty(bars.vectors)
  const energyJump = bars.energy.map((_, i) => {
    if (i === 0) return 0
    const before = bars.energy.slice(Math.max(0, i - 2), i)
    const after = bars.energy.slice(i, i + 2)
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
    return Math.abs(mean(after) - mean(before))
  })

  const score = nov.map((v, i) => v + 1.2 * energyJump[i] + (i % 8 === 0 ? 0.06 : i % 4 === 0 ? 0.03 : 0))
  const mean = score.reduce((a, b) => a + b, 0) / n
  const sd = Math.sqrt(score.reduce((a, b) => a + (b - mean) ** 2, 0) / n) || 1

  const candidates: number[] = []
  for (let i = 1; i < n; i++) {
    const isPeak = score[i] >= Math.max(...score.slice(Math.max(1, i - 2), Math.min(n, i + 3)))
    if (isPeak && score[i] > mean + 0.35 * sd) candidates.push(i)
  }
  // Greedy: strongest first, respecting the minimum section length.
  candidates.sort((a, b) => score[b] - score[a])
  const chosen: number[] = []
  for (const c of candidates) {
    if (c < minBars || n - c < minBars) continue
    if (chosen.every((b) => Math.abs(b - c) >= minBars)) chosen.push(c)
  }
  return [0, ...chosen.sort((a, b) => a - b)]
}

export function labelSections(bars: BarFeatures, boundaries: number[]): { sections: Section[]; drops: Drop[] } {
  const n = bars.vectors.length
  const raw = boundaries.map((b, i) => {
    const end = boundaries[i + 1] ?? n
    const slice = bars.energy.slice(b, end)
    return { startBar: b, endBar: end, energy: slice.reduce((a, c) => a + c, 0) / Math.max(1, slice.length) }
  })
  const maxE = Math.max(...raw.map((r) => r.energy), 1e-6)
  const minE = Math.min(...raw.map((r) => r.energy))
  const rel = raw.map((r) => (r.energy - minE * 0.5) / (maxE - minE * 0.5 || 1))

  // A drop: a high-energy section that arrives with a real jump from the one before.
  const jumps = rel.map((e, i) => (i === 0 ? 0 : e - rel[i - 1]))
  const dropIdx = new Set<number>()
  rel.forEach((e, i) => {
    if (i > 0 && e >= 0.72 && jumps[i] >= 0.16) dropIdx.add(i)
  })
  if (!dropIdx.size) {
    // No clear drop: take the biggest step up into a loud part, if the song has one.
    let best = -1
    rel.forEach((e, i) => {
      if (i > 0 && e >= 0.6 && jumps[i] > 0.05 && (best < 0 || jumps[i] > jumps[best])) best = i
    })
    if (best > 0) dropIdx.add(best)
  }

  const sections: Section[] = raw.map((r, i) => {
    let label: SectionLabel
    const e = rel[i]
    if (dropIdx.has(i) || e >= 0.78) label = 'drop'
    else if (dropIdx.has(i + 1) && (r.endBar - r.startBar <= 8 || e < rel[i + 1])) label = 'build'
    else if (i === 0 && e < 0.65) label = 'intro'
    else if (i === raw.length - 1 && e < 0.65) label = 'outro'
    else if (e < 0.45) label = 'break'
    else label = 'verse'
    return {
      start: bars.times[r.startBar],
      end: bars.times[r.endBar] ?? bars.times[bars.times.length - 1],
      label,
      energy: Math.min(1, Math.max(0, e)),
    }
  })

  const maxJump = Math.max(...[...dropIdx].map((i) => jumps[i] * rel[i]), 1e-6)
  const drops: Drop[] = [...dropIdx]
    .sort((a, b) => a - b)
    .map((i) => ({ time: sections[i].start, strength: Math.min(1, (jumps[i] * rel[i]) / maxJump) }))
  return { sections, drops }
}
