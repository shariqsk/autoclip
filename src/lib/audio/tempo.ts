// Tempo estimation and beat tracking.
//
// Tempo: autocorrelation of the onset envelope, summed with its harmonics, weighted by a prior that
// prefers the 80–160 BPM range most edits are cut to.
// Beats: dynamic programming in the style of Ellis (2007), which finds the beat sequence that best
// balances landing on onsets against keeping a steady period.

import { localPeaks } from './features'

export interface TempoEstimate {
  bpm: number
  /** Beat period in feature frames (fractional). */
  period: number
  confidence: number
}

const MIN_BPM = 60
const MAX_BPM = 200

function autocorrelate(x: Float32Array, maxLag: number): Float32Array {
  const ac = new Float32Array(maxLag + 1)
  for (let lag = 0; lag <= maxLag; lag++) {
    let s = 0
    for (let i = 0; i + lag < x.length; i++) s += x[i] * x[i + lag]
    ac[lag] = s / (x.length - lag)
  }
  return ac
}

function interp(ac: Float32Array, lag: number): number {
  const i = Math.floor(lag)
  const f = lag - i
  return (ac[i] ?? 0) * (1 - f) + (ac[i + 1] ?? 0) * f
}

export function estimateTempo(onset: Float32Array, frameRate: number, preferredBpm = 120): TempoEstimate {
  const env = localPeaks(onset, Math.round(frameRate * 0.4))
  const maxLag = Math.ceil((60 * frameRate * 4) / MIN_BPM)
  const ac = autocorrelate(env, Math.min(maxLag, env.length - 1))

  let best = { bpm: preferredBpm, score: -Infinity }
  const scores: number[] = []
  // Search in 0.25 BPM steps; cheap, and finer than any tempo a viewer could feel.
  for (let bpm = MIN_BPM; bpm <= MAX_BPM; bpm += 0.25) {
    const lag = (60 * frameRate) / bpm
    // A true beat period also lines up at 2x and 4x the lag (bars), and half the lag (eighths).
    const s = interp(ac, lag) + 0.5 * interp(ac, lag * 2) + 0.25 * interp(ac, lag * 4) + 0.25 * interp(ac, lag / 2)
    const octaves = Math.log2(bpm / preferredBpm)
    const weighted = s * Math.exp(-0.5 * (octaves / 0.9) ** 2)
    scores.push(weighted)
    if (weighted > best.score) best = { bpm, score: weighted }
  }

  const mean = scores.reduce((a, b) => a + b, 0) / scores.length
  const max = best.score
  const confidence = max > 0 ? Math.min(1, Math.max(0, (max - mean) / max)) : 0
  return { bpm: best.bpm, period: (60 * frameRate) / best.bpm, confidence }
}

/** Returns beat positions in (fractional) feature frames. */
export function trackBeats(onset: Float32Array, period: number, tightness = 100): number[] {
  const n = onset.length
  if (n < period * 2) return []

  // Normalize, then smooth with a Gaussian a fraction of a beat wide so near-misses still count.
  let sd = 0
  let mean = 0
  for (const v of onset) mean += v
  mean /= n
  for (const v of onset) sd += (v - mean) ** 2
  sd = Math.sqrt(sd / n) || 1
  const radius = Math.max(1, Math.round(period / 16))
  const kernel: number[] = []
  for (let i = -radius * 2; i <= radius * 2; i++) kernel.push(Math.exp(-0.5 * (i / radius) ** 2))
  const local = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let s = 0
    for (let k = 0; k < kernel.length; k++) {
      const j = i + k - radius * 2
      if (j >= 0 && j < n) s += (onset[j] / sd) * kernel[k]
    }
    local[i] = s
  }

  const score = new Float32Array(n)
  const back = new Int32Array(n).fill(-1)
  const lo = Math.round(period / 2)
  const hi = Math.round(period * 2)
  for (let t = 0; t < n; t++) {
    let bestPrev = -1
    let bestScore = -Infinity
    for (let p = t - hi; p <= t - lo; p++) {
      if (p < 0) continue
      const penalty = -tightness * Math.log((t - p) / period) ** 2
      const s = score[p] + penalty
      if (s > bestScore) {
        bestScore = s
        bestPrev = p
      }
    }
    score[t] = local[t] + (bestPrev >= 0 ? Math.max(0, bestScore) : 0)
    back[t] = bestScore > 0 ? bestPrev : -1
  }

  // Start from the best-scoring frame within the last beat period, then walk the back-links.
  let end = n - 1
  for (let t = Math.max(0, n - Math.round(period)); t < n; t++) if (score[t] > score[end]) end = t
  const beats: number[] = []
  for (let t = end; t >= 0; t = back[t]) {
    beats.push(t)
    if (back[t] < 0) break
  }
  beats.reverse()

  // Fill obvious gaps at the start (the DP can begin late in a soft intro) by extrapolating the grid.
  if (beats.length) {
    let first = beats[0]
    while (first - period >= 0) {
      first -= period
      beats.unshift(Math.round(first))
    }
  }
  return beats
}

/**
 * Pick which beat in each group of four is the downbeat ("the one"): kicks and harmonic changes
 * tend to land there. Returns the phase, 0–3.
 */
export function downbeatPhase(beatFrames: number[], lowOnset: Float32Array, chroma: Float32Array): number {
  const scores = [0, 0, 0, 0]
  const at = (f: number) => lowOnset[Math.min(lowOnset.length - 1, Math.max(0, Math.round(f)))] ?? 0
  const chromaAt = (f: number) => {
    const i = Math.min(chroma.length / 12 - 1, Math.max(0, Math.round(f)))
    return chroma.subarray(i * 12, i * 12 + 12)
  }
  for (let i = 1; i < beatFrames.length; i++) {
    const a = chromaAt(beatFrames[i - 1] + 2)
    const b = chromaAt(beatFrames[i] + 2)
    let change = 0
    for (let c = 0; c < 12; c++) change += Math.abs(a[c] - b[c])
    scores[i % 4] += at(beatFrames[i]) + 0.5 * change
  }
  return scores.indexOf(Math.max(...scores))
}

/**
 * Beat trackers often lock onto the off-beat when bass or open hi-hats sit between the beats
 * (common in dance music). Snares and claps almost always land on the beat, and kicks usually do, so
 * compare that "on-beat" evidence at the tracked beats against the points halfway between them and
 * shift by half a beat if the midpoints win.
 */
export function fixOffbeat(beatFrames: number[], lowOnset: Float32Array, midOnset: Float32Array): number[] {
  if (beatFrames.length < 8) return beatFrames
  const at = (arr: Float32Array, f: number) => {
    let m = 0
    for (let i = -1; i <= 1; i++) m = Math.max(m, arr[Math.round(f) + i] ?? 0)
    return m
  }
  let onBeat = 0
  let offBeat = 0
  for (let i = 0; i < beatFrames.length - 1; i++) {
    const mid = (beatFrames[i] + beatFrames[i + 1]) / 2
    onBeat += at(midOnset, beatFrames[i]) + 0.5 * at(lowOnset, beatFrames[i])
    offBeat += at(midOnset, mid) + 0.5 * at(lowOnset, mid)
  }
  if (offBeat <= onBeat * 1.15) return beatFrames
  const shifted: number[] = []
  for (let i = 0; i < beatFrames.length - 1; i++) shifted.push(Math.round((beatFrames[i] + beatFrames[i + 1]) / 2))
  return shifted
}

/** Refine the tempo from the tracked beats themselves: the median spacing is sub-frame accurate. */
export function bpmFromBeats(beatTimes: number[], fallback: number): number {
  if (beatTimes.length < 8) return fallback
  const gaps = beatTimes.slice(1).map((t, i) => t - beatTimes[i])
  gaps.sort((a, b) => a - b)
  const core = gaps.slice(Math.floor(gaps.length * 0.25), Math.ceil(gaps.length * 0.75))
  const mean = core.reduce((a, b) => a + b, 0) / core.length
  return mean > 0 ? 60 / mean : fallback
}

function sampleAt(x: Float32Array, f: number): number {
  const i = Math.floor(f)
  const t = f - i
  return (x[i] ?? 0) * (1 - t) + (x[i + 1] ?? 0) * t
}

/**
 * Fit a constant-tempo grid. Nearly all music people cut edits to (EDM, hip-hop, phonk, pop) is
 * played to a click, so one tempo and one phase describe every beat. Search a narrow band around the
 * estimated period and every phase, scoring each grid by how much on-beat evidence lands on it.
 * Returns beat positions in feature frames and how well the grid fits (0–1).
 */
export function fitBeatGrid(evidence: Float32Array, period: number): { frames: number[]; fit: number } {
  const n = evidence.length
  let best = { period, phase: 0, score: -Infinity }
  for (let p = period * 0.985; p <= period * 1.015; p += period * 0.0005) {
    const count = Math.floor(n / p)
    for (let phase = 0; phase < p; phase += 0.5) {
      let s = 0
      for (let k = 0; k < count; k++) s += sampleAt(evidence, phase + k * p)
      s /= count
      if (s > best.score) best = { period: p, phase, score: s }
    }
  }
  // Fit: grid score against the score of the same grid moved half a beat (pure noise scores ~1).
  let off = 0
  const count = Math.floor(n / best.period)
  for (let k = 0; k < count; k++) off += sampleAt(evidence, best.phase + best.period / 2 + k * best.period)
  off /= count
  const fit = best.score > 0 ? Math.max(0, Math.min(1, (best.score - off) / best.score)) : 0

  const frames: number[] = []
  for (let f = best.phase; f < n; f += best.period) {
    // Let each beat settle onto its actual attack, within a few milliseconds, for human-played parts.
    let bestF = f
    let bestV = sampleAt(evidence, f)
    for (let d = -2; d <= 2; d++) {
      const v = sampleAt(evidence, f + d) * (1 - Math.abs(d) * 0.15)
      if (v > bestV) {
        bestV = v
        bestF = f + d
      }
    }
    frames.push(bestF)
  }
  return { frames, fit }
}
