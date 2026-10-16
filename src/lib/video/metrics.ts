// Per-frame measurements on small grayscale frames, and how they combine into a "this is a
// highlight" score. Pure functions over typed arrays, shared by the clip worker and the tests.

export interface Gray {
  data: Float32Array
  width: number
  height: number
}

export function toGray(rgba: Uint8ClampedArray, width: number, height: number): Gray {
  const data = new Float32Array(width * height)
  for (let i = 0, p = 0; i < data.length; i++, p += 4) data[i] = (0.2126 * rgba[p] + 0.7152 * rgba[p + 1] + 0.0722 * rgba[p + 2]) / 255
  return { data, width, height }
}

export function brightness(g: Gray): number {
  let s = 0
  for (const v of g.data) s += v
  return s / g.data.length
}

/** Mean absolute Laplacian: high for crisp detail, low for blur, fades and flat frames. */
export function sharpness(g: Gray): number {
  const { data, width: w, height: h } = g
  let s = 0
  let n = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      s += Math.abs(4 * data[i] - data[i - 1] - data[i + 1] - data[i - w] - data[i + w])
      n++
    }
  }
  return n ? s / n : 0
}

export interface Motion {
  /** Mean absolute change, 0–1. */
  amount: number
  /** Where the change is, 0–1 (0.5 when nothing moves). */
  x: number
  y: number
}

export function motion(prev: Gray, cur: Gray): Motion {
  const { width: w, height: h } = cur
  let sum = 0
  let sx = 0
  let sy = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.abs(cur.data[y * w + x] - prev.data[y * w + x])
      // Ignore sensor noise and compression shimmer.
      const m = d > 0.04 ? d : 0
      sum += m
      sx += m * x
      sy += m * y
    }
  }
  const amount = sum / (w * h)
  return { amount, x: sum > 1e-3 ? sx / sum / (w - 1) : 0.5, y: sum > 1e-3 ? sy / sum / (h - 1) : 0.5 }
}

/** A coarse signature (luma histogram + 3×3 layout) for spotting hard cuts. */
export function signature(g: Gray): Float32Array {
  const sig = new Float32Array(16 + 9)
  const { data, width: w, height: h } = g
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = data[y * w + x]
      sig[Math.min(15, Math.floor(v * 16))] += 1 / data.length
      sig[16 + Math.min(2, Math.floor((y / h) * 3)) * 3 + Math.min(2, Math.floor((x / w) * 3))] += v / (data.length / 9)
    }
  }
  return sig
}

export function signatureDistance(a: Float32Array, b: Float32Array): number {
  let hist = 0
  for (let i = 0; i < 16; i++) hist += Math.abs(a[i] - b[i])
  let layout = 0
  for (let i = 16; i < 25; i++) layout += Math.abs(a[i] - b[i])
  return 0.5 * hist + 0.5 * (layout / 9) * 4
}

/**
 * Hard cuts: a jump in the frame signature that stands well clear of the jumps around it (so fast
 * action and camera pans don't count) and that stays changed. Flashes, strobes and a single bright
 * frame on an impact jump away and come straight back, so they aren't cuts. `sigs` are the frame
 * signatures; without them only the jump test is applied. Returns the indices of the first frame
 * after each cut.
 */
export function detectCuts(distances: number[], threshold = 0.45, sigs?: Float32Array[]): number[] {
  const cuts: number[] = []
  for (let i = 1; i < distances.length; i++) {
    const d = distances[i]
    const around = [...distances.slice(Math.max(1, i - 4), i), ...distances.slice(i + 1, i + 5)].sort((a, b) => a - b)
    const median = around[Math.floor(around.length / 2)] ?? 0
    if (!(d > threshold && d > median * 3 + 0.08)) continue
    if (sigs && sigs[i - 1] && sigs[i + 1] && sigs[i + 2]) {
      const after1 = signatureDistance(sigs[i - 1], sigs[i + 1])
      const after2 = signatureDistance(sigs[i - 1], sigs[i + 2])
      if (Math.min(after1, after2) < threshold * 0.6) continue
      // ...and the frame coming back from a flash isn't one either.
      if (sigs[i - 2] && signatureDistance(sigs[i - 2], sigs[i]) < threshold * 0.6) continue
    }
    cuts.push(i)
  }
  return cuts
}

export function percentileNormalize(xs: number[], lo = 0.05, hi = 0.97): number[] {
  if (!xs.length) return []
  const sorted = [...xs].sort((a, b) => a - b)
  const a = sorted[Math.floor((sorted.length - 1) * lo)]
  const b = sorted[Math.floor((sorted.length - 1) * hi)]
  const range = b - a || 1
  return xs.map((x) => Math.min(1, Math.max(0, (x - a) / range)))
}

/** A moving average. `starts` (sample indices where a new scene begins) keep it from crossing cuts. */
export function smoothSeries(xs: number[], radius: number, starts: number[] = []): number[] {
  return xs.map((_, i) => {
    let s = 0
    let n = 0
    const lo = Math.max(0, i - radius, ...starts.filter((k) => k <= i))
    const hi = Math.min(xs.length - 1, i + radius, ...starts.filter((k) => k > i).map((k) => k - 1))
    for (let j = lo; j <= hi; j++) {
      s += xs[j]
      n++
    }
    return s / n
  })
}

export interface RawSeries {
  motion: number[]
  sharpness: number[]
  brightness: number[]
  loudness: number[]
}

/**
 * Interest: mostly motion (relative to the clip, so a calm clip still has its best moments, and
 * absolute, so a genuinely wild clip beats a calm one), plus sudden bursts of motion (impacts), a
 * loud soundtrack (crowd roars, commentators shouting) and crisp frames.
 */
export function interestScore(raw: RawSeries): { motion: number[]; sharpness: number[]; interest: number[] } {
  const rel = percentileNormalize(raw.motion)
  const abs = raw.motion.map((m) => Math.min(1, m / 0.12))
  const motion = rel.map((r, i) => 0.55 * r + 0.45 * abs[i])
  const sharp = raw.sharpness.map((s) => Math.min(1, s / 0.08))
  const burst = motion.map((m, i) => Math.max(0, m - (motion[i - 2] ?? m)))
  const loudRel = percentileNormalize(raw.loudness)
  const hasAudio = raw.loudness.some((l) => l > 0.02)
  const interest = motion.map((m, i) => {
    const dark = raw.brightness[i] < 0.08 ? 0.5 : 1
    const v = 0.55 * m + 0.2 * Math.min(1, burst[i] * 2.5) + (hasAudio ? 0.15 * loudRel[i] : 0.07) + 0.1 * sharp[i]
    return Math.min(1, v * dark)
  })
  return { motion, sharpness: sharp, interest: smoothSeries(interest, 1) }
}
