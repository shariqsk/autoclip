// Hits: the moments you can hear on their own. Strums, stabs, a snare fill, a shouted word: any
// attack that stands out from the few seconds around it, wherever it falls, on the beat grid or not.
// In a quiet intro three guitar strums are hits; in a wall of drums the twentieth kick isn't.

import { normalize } from './features'

export interface SongHit {
  /** Seconds. */
  time: number
  /** How much it stands out from its surroundings, 0–1. */
  strength: number
}

const WINDOW = 2 // seconds either side for "the surroundings"
const MIN_GAP = 0.12 // seconds between two hits

/**
 * `onset` should be the mid-band flux (where guitars, stabs, vocals and snares live, not hi-hats or
 * sub-bass). `barFrames` is one bar in frames: a hit that happens at the same spot in every bar is the
 * groove, not a moment, so it counts for less.
 */
export function findHits(onset: Float32Array, frameRate: number, latency: number, barFrames = 0): SongHit[] {
  const n = onset.length
  const level = normalize(onset, 0.995)
  const half = Math.round(WINDOW * frameRate)
  const peakRadius = Math.max(1, Math.round(0.05 * frameRate))

  // Rolling background level: the mean of the envelope around each frame. A running sum keeps it O(n).
  const prefix = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + level[i]
  const background = (i: number) => {
    const a = Math.max(0, i - half)
    const b = Math.min(n, i + half + 1)
    return (prefix[b] - prefix[a]) / (b - a)
  }

  // Loudest attack within a few seconds: hits are judged against their own part of the song, so
  // quiet intros have hits too.
  const localMax = (i: number) => {
    let m = 0
    for (let j = Math.max(0, i - half * 1.5); j < Math.min(n, i + half * 1.5); j++) if (level[j] > m) m = level[j]
    return m || 1
  }

  const hits: SongHit[] = []
  for (let i = 1; i < n - 1; i++) {
    const v = level[i]
    if (v < 0.04) continue
    let isPeak = true
    for (let k = -peakRadius; k <= peakRadius && isPeak; k++) if (k && level[i + k] > v) isPeak = false
    if (!isPeak) continue
    // Stand-out: how far above the surrounding level this attack sits, and how it ranks locally.
    const prominence = v / (background(i) + 0.01)
    if (prominence < 2.5) continue
    const rank = v / localMax(i)
    if (rank < 0.35) continue
    // Novelty: compared with the same spot one and two bars either side (with a little slack). A
    // hit that's there every bar is the groove; it still counts, for less.
    let novelty = 1
    if (barFrames > 0) {
      let same = 0
      for (const k of [-2, -1, 1, 2]) {
        const c = i + Math.round(k * barFrames)
        if (c < 2 || c >= n - 2) continue
        for (let d = -2; d <= 2; d++) same = Math.max(same, level[c + d])
      }
      novelty = Math.max(0, Math.min(1, 1 - same / v))
    }
    const strength = Math.min(1, (0.4 * Math.min(1, (prominence - 2.5) / 5) + 0.6 * rank) * (0.2 + 0.8 * novelty))
    const time = i / frameRate + latency
    const last = hits[hits.length - 1]
    if (last && time - last.time < MIN_GAP) {
      if (strength > last.strength) hits[hits.length - 1] = { time, strength }
      continue
    }
    hits.push({ time, strength })
  }
  return hits.map((h) => ({ time: Math.round(h.time * 1000) / 1000, strength: Math.round(h.strength * 1000) / 1000 }))
}

/**
 * Clusters: two to four standout hits in quick succession (within about a bar), like a riff of
 * strums or a fill. These are what an editor cuts on, one cut per hit.
 */
export function findClusters(hits: SongHit[], from: number, to: number, beatPeriod: number, minStrength = 0.35): SongHit[][] {
  const strong = hits.filter((h) => h.time > from && h.time < to && h.strength >= minStrength)
  const clusters: SongHit[][] = []
  let cur: SongHit[] = []
  for (const h of strong) {
    const prev = cur[cur.length - 1]
    if (prev && h.time - prev.time > beatPeriod * 1.6) {
      if (cur.length >= 2) clusters.push(cur)
      cur = []
    }
    cur.push(h)
  }
  if (cur.length >= 2) clusters.push(cur)
  // Long runs (a busy drum part) aren't a phrase you'd cut on hit by hit; keep the punchiest four.
  return clusters.map((c) =>
    c.length <= 4
      ? c
      : [...c]
          .sort((a, b) => b.strength - a.strength)
          .slice(0, 4)
          .sort((a, b) => a.time - b.time),
  )
}
