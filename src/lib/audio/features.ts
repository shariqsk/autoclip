// Frame-level audio features from a mono signal: band energies, onset strength (spectral flux),
// a kick-drum flux from the low bands, loudness and chroma. Everything downstream (tempo, beats,
// sections, drops) is computed from these.

import { FFT, hann } from './fft'

export const ANALYSIS_RATE = 22050
export const N_FFT = 1024
export const HOP = 256
/** Feature frames per second. */
export const FRAME_RATE = ANALYSIS_RATE / HOP
/**
 * A frame's flux peaks when an attack is well inside its window, a little after the frame starts.
 * Adding this to `frame / frameRate` gives the attack's real time (measured on synthetic hits).
 */
export const ONSET_LATENCY = (0.6 * N_FFT) / ANALYSIS_RATE

export interface Features {
  frameRate: number
  frames: number
  /** Spectral flux across all bands: the "something just happened" curve. */
  onset: Float32Array
  /** Spectral flux below ~150 Hz: kicks and bass hits. */
  lowOnset: Float32Array
  /** Spectral flux from ~200 Hz to ~2.5 kHz: snares, claps, stabs. Lands on the beat in most music. */
  midOnset: Float32Array
  /** RMS loudness per frame (linear). */
  rms: Float32Array
  /** Energy below ~150 Hz per frame (log). */
  low: Float32Array
  /** Log band energies, `bands` values per frame. */
  bandEnergy: Float32Array
  bands: number
  /** 12 pitch-class energies per frame, normalized per frame. */
  chroma: Float32Array
}

const BANDS = 24
const MIN_HZ = 40
const MAX_HZ = 10000
const LOW_HZ = 150
const MID_HZ = [200, 2500]

/** Log-spaced band edges, as FFT bin indices. */
function bandEdges(sampleRate: number): number[] {
  const binHz = sampleRate / N_FFT
  const edges: number[] = []
  for (let b = 0; b <= BANDS; b++) {
    const hz = MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, b / BANDS)
    edges.push(Math.max(1, Math.round(hz / binHz)))
  }
  // Keep every band at least one bin wide.
  for (let b = 1; b < edges.length; b++) if (edges[b] <= edges[b - 1]) edges[b] = edges[b - 1] + 1
  return edges
}

export function computeFeatures(signal: Float32Array, sampleRate = ANALYSIS_RATE): Features {
  const frames = Math.max(1, Math.floor((signal.length - N_FFT) / HOP) + 1)
  const fft = new FFT(N_FFT)
  const win = hann(N_FFT)
  const frame = new Float32Array(N_FFT)
  const mags = new Float32Array(N_FFT / 2 + 1)
  const edges = bandEdges(sampleRate)
  const binHz = sampleRate / N_FFT
  const lowBands = edges.findIndex((e) => e * binHz >= LOW_HZ)
  const midLo = edges.findIndex((e) => e * binHz >= MID_HZ[0])
  const midHi = Math.max(
    midLo + 1,
    edges.findIndex((e) => e * binHz >= MID_HZ[1]),
  )

  // Each FFT bin's pitch class for chroma, only for the musically useful range.
  const pitchClass = new Int8Array(N_FFT / 2 + 1).fill(-1)
  for (let k = 1; k <= N_FFT / 2; k++) {
    const hz = k * binHz
    if (hz < 80 || hz > 5000) continue
    const midi = 69 + 12 * Math.log2(hz / 440)
    pitchClass[k] = ((Math.round(midi) % 12) + 12) % 12
  }

  const bandEnergy = new Float32Array(frames * BANDS)
  const chroma = new Float32Array(frames * 12)
  const rms = new Float32Array(frames)
  const low = new Float32Array(frames)

  for (let f = 0; f < frames; f++) {
    const offset = f * HOP
    let sq = 0
    for (let i = 0; i < N_FFT; i++) {
      const s = signal[offset + i] ?? 0
      sq += s * s
      frame[i] = s * win[i]
    }
    rms[f] = Math.sqrt(sq / N_FFT)
    fft.magnitudes(frame, mags)

    for (let b = 0; b < BANDS; b++) {
      let e = 0
      for (let k = edges[b]; k < edges[b + 1]; k++) e += mags[k] * mags[k]
      bandEnergy[f * BANDS + b] = Math.log(1 + 100 * (e / (edges[b + 1] - edges[b])))
    }
    let lowE = 0
    for (let b = 0; b < Math.max(1, lowBands); b++) lowE += bandEnergy[f * BANDS + b]
    low[f] = lowE / Math.max(1, lowBands)

    let cTotal = 0
    for (let k = 1; k <= N_FFT / 2; k++) {
      const pc = pitchClass[k]
      if (pc < 0) continue
      chroma[f * 12 + pc] += mags[k]
      cTotal += mags[k]
    }
    if (cTotal > 0) for (let c = 0; c < 12; c++) chroma[f * 12 + c] /= cTotal
  }

  const onset = new Float32Array(frames)
  const lowOnset = new Float32Array(frames)
  const midOnset = new Float32Array(frames)
  for (let f = 1; f < frames; f++) {
    let flux = 0
    let lowFlux = 0
    let midFlux = 0
    for (let b = 0; b < BANDS; b++) {
      // SuperFlux-style: compare against the max of the neighbouring bands one frame back, which
      // ignores vibrato and slides and keeps percussive attacks.
      const prev = Math.max(
        bandEnergy[(f - 1) * BANDS + b],
        b > 0 ? bandEnergy[(f - 1) * BANDS + b - 1] : -Infinity,
        b < BANDS - 1 ? bandEnergy[(f - 1) * BANDS + b + 1] : -Infinity,
      )
      const d = bandEnergy[f * BANDS + b] - prev
      if (d > 0) {
        flux += d
        if (b < Math.max(1, lowBands)) lowFlux += d
        if (b >= midLo && b < midHi) midFlux += d
      }
    }
    onset[f] = flux / BANDS
    lowOnset[f] = lowFlux / Math.max(1, lowBands)
    midOnset[f] = midFlux / (midHi - midLo)
  }

  return { frameRate: sampleRate / HOP, frames, onset, lowOnset, midOnset, rms, low, bandEnergy, bands: BANDS, chroma }
}

/** Subtract a moving average and half-wave rectify: keeps only the peaks that stand out locally. */
export function localPeaks(x: Float32Array, radius: number): Float32Array {
  const out = new Float32Array(x.length)
  let sum = 0
  let count = 0
  let lo = 0
  let hi = -1
  for (let i = 0; i < x.length; i++) {
    while (hi < Math.min(x.length - 1, i + radius)) sum += x[++hi]
    while (lo < i - radius) sum -= x[lo++]
    count = hi - lo + 1
    out[i] = Math.max(0, x[i] - sum / count)
  }
  return out
}

/** Normalize to 0–1 using a high percentile as the ceiling, so one outlier doesn't flatten the rest. */
export function normalize(x: ArrayLike<number>, percentile = 0.98): Float32Array {
  const sorted = Float32Array.from(x).sort()
  const lo = sorted[0] ?? 0
  const hi = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * percentile))] ?? 1
  const range = hi - lo || 1
  const out = new Float32Array(x.length)
  for (let i = 0; i < x.length; i++) out[i] = Math.min(1, Math.max(0, (x[i] - lo) / range))
  return out
}

export function smooth(x: ArrayLike<number>, radius: number): Float32Array {
  const out = new Float32Array(x.length)
  for (let i = 0; i < x.length; i++) {
    let s = 0
    let n = 0
    for (let j = Math.max(0, i - radius); j <= Math.min(x.length - 1, i + radius); j++) {
      s += x[j]
      n++
    }
    out[i] = s / n
  }
  return out
}
