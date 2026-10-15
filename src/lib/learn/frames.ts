// Per-frame measurements for reading someone else's edit: colour, letterbox bars and how the whole
// picture moved (shake, zoom punches), plus the events they add up to (flashes, dips to black,
// freeze-frames). Pure functions over small frames, shared by the worker and the tests.

import { median } from './stats'

export interface FrameColor {
  /** Mean luma, 0–1. */
  brightness: number
  /** Mean chroma (max − min channel), 0–1: near zero for black and white. */
  saturation: number
  /** Mean red minus blue, −1–1: positive is warm. */
  warmth: number
  /** Fraction of the height taken by near-black bars at the top and at the bottom. */
  barTop: number
  barBottom: number
}

export function frameColor(rgba: Uint8ClampedArray, width: number, height: number): FrameColor {
  let luma = 0
  let sat = 0
  let warm = 0
  const rowLuma = new Float32Array(height)
  for (let y = 0, p = 0; y < height; y++) {
    let row = 0
    for (let x = 0; x < width; x++, p += 4) {
      const r = rgba[p]
      const g = rgba[p + 1]
      const b = rgba[p + 2]
      const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
      row += l
      sat += (Math.max(r, g, b) - Math.min(r, g, b)) / 255
      warm += (r - b) / 255
    }
    rowLuma[y] = row / width
    luma += row
  }
  const n = width * height
  const band = (from: number, step: number) => {
    let k = 0
    for (let y = from; y >= 0 && y < height && rowLuma[y] < 0.035; y += step) k++
    // A black frame is not a letterbox.
    return k >= height * 0.45 ? 0 : k / height
  }
  return { brightness: luma / n, saturation: sat / n, warmth: warm / n, barTop: band(0, 1), barBottom: band(height - 1, -1) }
}

export interface GlobalMotion {
  /** Whole-frame shift from the previous frame, in pixels of the small frame. */
  dx: number
  dy: number
  /** 1 when nothing scaled, above 1 when the picture punched in, below when it pulled out. */
  scale: number
  /** How much better the best scale explained the change than no scaling at all (0–1). */
  zoomGain: number
}

/**
 * How the whole picture moved between two small grayscale frames: the best shift within ±2 px,
 * then whether a slight zoom about the centre explains it better.
 */
export function globalMotion(prev: Float32Array, cur: Float32Array, width: number, height: number): GlobalMotion {
  const m = 3
  const cost = (dx: number, dy: number, s: number) => {
    const cx = (width - 1) / 2
    const cy = (height - 1) / 2
    let sum = 0
    let n = 0
    for (let y = m; y < height - m; y++) {
      for (let x = m; x < width - m; x++) {
        // Where this pixel of the current frame came from in the previous one.
        const sx = Math.round(cx + (x - cx) / s - dx)
        const sy = Math.round(cy + (y - cy) / s - dy)
        if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue
        sum += Math.abs(cur[y * width + x] - prev[sy * width + sx])
        n++
      }
    }
    return n ? sum / n : Infinity
  }
  let best = { dx: 0, dy: 0, c: cost(0, 0, 1) }
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (!dx && !dy) continue
      const c = cost(dx, dy, 1)
      if (c < best.c - 1e-4) best = { dx, dy, c }
    }
  }
  let scale = 1
  let bestC = best.c
  for (const s of [1.06, 0.94]) {
    const c = cost(best.dx, best.dy, s)
    if (c < bestC) {
      bestC = c
      scale = s
    }
  }
  return { dx: best.dx, dy: best.dy, scale, zoomGain: best.c > 1e-4 ? Math.max(0, (best.c - bestC) / best.c) : 0 }
}

/**
 * A brightness-free copy of a frame (zero mean, unit spread), so strobes, flashes and fades don't
 * look like cuts: they change how bright the picture is, not what's in it.
 */
export function normalizeGray(data: Float32Array): Float32Array {
  let m = 0
  for (const v of data) m += v
  m /= data.length || 1
  let sd = 0
  for (const v of data) sd += (v - m) * (v - m)
  sd = Math.sqrt(sd / (data.length || 1)) || 1
  return data.map((v) => Math.min(1, Math.max(0, 0.5 + ((v - m) / sd) * 0.18)))
}

/** Everything measured about one sampled frame. */
export interface FrameSample extends FrameColor, GlobalMotion {
  t: number
  /** Mean absolute change from the previous frame, ignoring noise, 0–1. */
  motion: number
}

export interface FrameEvents {
  flashes: number[]
  dips: number[]
  /** [start, end] of held frames. */
  freezes: [number, number][]
  shakes: number[]
  zooms: number[]
}

/** Times of each run of consecutive true flags (its first frame). */
function runs(flags: boolean[], t: number[], minLen = 1, maxLen = Infinity): number[][] {
  const out: number[][] = []
  let start = -1
  for (let i = 0; i <= flags.length; i++) {
    if (i < flags.length && flags[i]) {
      if (start < 0) start = i
    } else if (start >= 0) {
      const len = i - start
      if (len >= minLen && len <= maxLen) out.push([t[start], t[i - 1]])
      start = -1
    }
  }
  return out
}

/**
 * Turn per-frame samples into events. `cuts` are the edit's hard cuts: motion across a cut is the
 * cut itself, so shake and zoom ignore the frames right after one.
 */
export function findEvents(frames: FrameSample[], cuts: number[], dt: number): FrameEvents {
  const t = frames.map((f) => f.t)
  const b = frames.map((f) => f.brightness)
  const nearCut = frames.map((f) => cuts.some((c) => f.t >= c - dt * 0.6 && f.t <= c + dt * 1.6))
  const around = (i: number, r0: number, r1: number) => {
    const xs: number[] = []
    for (let k = r0; k <= r1; k++) {
      if (i - k >= 0) xs.push(b[i - k])
      if (i + k < b.length) xs.push(b[i + k])
    }
    return median(xs)
  }
  const spread = Math.max(3, Math.round(0.15 / dt))

  // A flash: a few frames far brighter than what's around them.
  const flash = b.map((v, i) => v > 0.62 && v - around(i, spread, spread * 2) > 0.22)
  const flashes = runs(flash, t, 1, Math.max(2, Math.round(0.3 / dt))).map(([s]) => s)

  // A dip: a few black frames between brighter ones.
  const dip = b.map((v, i) => v < 0.045 && around(i, spread, spread * 2) > 0.12)
  const dips = runs(dip, t, 1, Math.round(0.8 / dt)).map(([s]) => s)

  // A freeze: the picture holds after moving. Edits keep punching the zoom on the beat over a frozen
  // frame, so a freeze is a stretch that's mostly still in long runs. Slow motion repeats frames
  // too, but only one or two at a time, so it doesn't count.
  const still = frames.map((f, i) => f.motion < 0.0025 && f.brightness > 0.06 && !nearCut[i])
  const win = Math.round(0.8 / dt)
  const longRun = Math.round(0.18 / dt)
  const held = frames.map(() => false)
  for (let i = 0; i + win <= frames.length; i++) {
    if (cuts.some((c) => c > t[i] && c < t[i + win - 1])) continue
    let count = 0
    let run = 0
    let best = 0
    for (let k = i; k < i + win; k++) {
      run = still[k] ? run + 1 : 0
      if (still[k]) count++
      best = Math.max(best, run)
    }
    if (count >= win * 0.5 && best >= longRun) for (let k = i; k < i + win; k++) held[k] = true
  }
  const freezes = runs(held, t, win)
    .filter(([s]) => {
      const i = t.indexOf(s)
      const before = frames.slice(Math.max(0, i - Math.round(0.8 / dt)), i)
      return before.some((f) => f.motion > 0.01)
    })
    .map(([s, e]) => [s, e + dt] as [number, number])

  // Shake: the whole frame jerks one way then straight back, frame after frame.
  const jerk = frames.map((f, i) => {
    const p = frames[i - 1]
    if (!p || nearCut[i] || nearCut[i - 1]) return false
    const big = Math.hypot(f.dx, f.dy) >= 1 && Math.hypot(p.dx, p.dy) >= 1
    return big && f.dx * p.dx + f.dy * p.dy < 0
  })
  const shakes = runs(jerk, t, 1)
    .filter(([s, e]) => e - s >= dt * 0.5 || jerk.filter((j, k) => j && Math.abs(t[k] - s) < 0.3).length >= 2)
    .map(([s]) => s)

  // A zoom punch: the picture suddenly scales in (or snaps back out), briefly.
  const zoom = frames.map((f, i) => !nearCut[i] && f.scale !== 1 && f.zoomGain > 0.12)
  const zooms = runs(zoom, t, 1, Math.round(0.5 / dt)).map(([s]) => s)

  return { flashes, dips, freezes, shakes: mergeClose(shakes, 0.35), zooms: mergeClose(zooms, 0.35) }
}

function mergeClose(times: number[], gap: number): number[] {
  const out: number[] = []
  for (const x of times) if (!out.length || x - out[out.length - 1] > gap) out.push(x)
  return out
}
