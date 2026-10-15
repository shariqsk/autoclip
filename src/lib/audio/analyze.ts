// Song analysis: mono PCM in, beats / bars / sections / drops out. Pure and synchronous so it can run
// in a worker and in tests.

import type { Beat, SongAnalysis } from '../types'
import { ANALYSIS_RATE, computeFeatures, normalize, ONSET_LATENCY, smooth } from './features'
import { findHits } from './hits'
import { findBoundaries, labelSections, type BarFeatures } from './structure'
import { bpmFromBeats, downbeatPhase, estimateTempo, fitBeatGrid, fixOffbeat, trackBeats } from './tempo'

export interface AnalyzeOptions {
  sampleRate?: number
  /** Called with 0–1 as the stages finish. */
  onProgress?: (fraction: number, stage: string) => void
}

const PEAK_BUCKETS = 1200

export function analyzeSong(signal: Float32Array, opts: AnalyzeOptions = {}): SongAnalysis {
  const sampleRate = opts.sampleRate ?? ANALYSIS_RATE
  const progress = opts.onProgress ?? (() => {})
  const duration = signal.length / sampleRate

  progress(0.05, 'Listening')
  const f = computeFeatures(signal, sampleRate)
  const fr = f.frameRate

  progress(0.45, 'Finding the tempo')
  const tempo = estimateTempo(f.onset, fr)
  // On-beat evidence: kicks and snares count double, hats and pads once.
  const onN = normalize(f.onset)
  const lowN = normalize(f.lowOnset)
  const midN = normalize(f.midOnset)
  const evidence = new Float32Array(f.frames)
  for (let i = 0; i < f.frames; i++) evidence[i] = 0.5 * onN[i] + lowN[i] + midN[i]
  // A steady grid when the music is played to a click; free beat tracking when it isn't.
  const grid = fitBeatGrid(evidence, tempo.period)
  const beatFrames = fixOffbeat(grid.fit > 0.12 ? grid.frames : trackBeats(evidence, tempo.period), f.lowOnset, f.midOnset)

  // Loudness in dB relative to the song's loudest moments, mapped to 0–1 over a 30 dB range.
  const rmsDb = Array.from(f.rms, (r) => 20 * Math.log10(r + 1e-6))
  const topDb = [...rmsDb].sort((a, b) => a - b)[Math.floor(rmsDb.length * 0.98)] ?? 0
  const loud = smooth(
    rmsDb.map((d) => Math.min(1, Math.max(0, (d - (topDb - 30)) / 30))),
    Math.round(fr * 0.1),
  )
  const onsetNorm = onN
  // Bass weight matters as much as loudness: a build can be loud, but the kick and sub land on the drop.
  const lowNorm = normalize(f.low)
  const lowOnsetNorm = lowN

  progress(0.65, 'Counting bars')
  const phase = downbeatPhase(beatFrames, f.lowOnset, f.chroma)
  const at = (arr: ArrayLike<number>, frame: number) => arr[Math.min(arr.length - 1, Math.max(0, Math.round(frame)))] ?? 0
  const peakNear = (arr: ArrayLike<number>, frame: number, r = 2) => {
    let m = 0
    for (let i = -r; i <= r; i++) m = Math.max(m, at(arr, frame + i))
    return m
  }

  let bar = -1
  const beats: Beat[] = beatFrames.map((frame, i) => {
    const isDown = (i - phase) % 4 === 0
    if (isDown || bar < 0) bar++
    return {
      time: Math.min(duration, frame / fr + ONSET_LATENCY),
      kind: isDown ? 'downbeat' : 'beat',
      bar,
      strength: peakNear(onsetNorm, frame),
      energy: at(loud, frame),
    }
  })

  // Bar-level features for the structure pass: timbre (band energies) and harmony (chroma).
  const downbeats = beats.filter((b) => b.kind === 'downbeat').map((b) => b.time)
  const barTimes =
    downbeats.length >= 2 ? [...downbeats, Math.min(duration, downbeats.at(-1)! + (downbeats.at(-1)! - downbeats.at(-2)!))] : [0, duration]
  const dims = f.bands + 12
  const vectors: Float32Array[] = []
  const barEnergy: number[] = []

  for (let b = 0; b < barTimes.length - 1; b++) {
    const s = Math.max(0, Math.floor((barTimes[b] - ONSET_LATENCY) * fr))
    const e = Math.max(s + 1, Math.min(f.frames, Math.floor((barTimes[b + 1] - ONSET_LATENCY) * fr)))
    const v = new Float32Array(dims)
    let energy = 0
    for (let fi = s; fi < e; fi++) {
      for (let k = 0; k < f.bands; k++) v[k] += f.bandEnergy[fi * f.bands + k]
      for (let c = 0; c < 12; c++) v[f.bands + c] += 3 * f.chroma[fi * 12 + c]
      energy += 0.5 * (loud[fi] ?? 0) + 0.5 * (lowNorm[fi] ?? 0)
    }
    for (let k = 0; k < dims; k++) v[k] /= e - s
    vectors.push(v)
    barEnergy.push(energy / (e - s))
  }
  // Center each dimension so cosine similarity reflects differences, not the shared average.
  for (let k = 0; k < dims; k++) {
    const mean = vectors.reduce((a, v) => a + v[k], 0) / Math.max(1, vectors.length)
    for (const v of vectors) v[k] -= mean
  }

  progress(0.8, 'Mapping the drops')
  const bars: BarFeatures = { times: barTimes, vectors, energy: barEnergy }
  const boundaries = findBoundaries(bars)
  const { sections, drops } = labelSections(bars, boundaries)
  if (sections.length) {
    sections[0].start = 0
    sections[sections.length - 1].end = duration
  }

  // Land each drop exactly: the downbeat near the boundary where loudness and bass jump the most.
  const weight = (from: number, to: number) => {
    let sum = 0
    let n = 0
    for (let i = Math.max(0, Math.floor(from)); i < Math.min(f.frames, Math.floor(to)); i++, n++) sum += 0.5 * loud[i] + 0.5 * lowNorm[i]
    return n ? sum / n : 0
  }
  for (const drop of drops) {
    let best = drop.time
    let bestScore = -Infinity
    for (const b of beats) {
      if (b.kind !== 'downbeat' || Math.abs(b.time - drop.time) > 2.5) continue
      const frame = (b.time - ONSET_LATENCY) * fr
      const jump = weight(frame, frame + fr) - weight(frame - fr, frame - fr * 0.05)
      const score = jump + 0.15 * peakNear(lowOnsetNorm, frame) + (b.time === drop.time ? 0.05 : 0)
      if (score > bestScore) {
        bestScore = score
        best = b.time
      }
    }
    drop.time = best
  }

  progress(0.95, 'Drawing the waveform')
  const envelopeRate = 0.05
  const envelope: number[] = []
  for (let t = 0; t < duration; t += envelopeRate) envelope.push(Math.round(at(loud, t * fr) * 1000) / 1000)

  const peaks: number[] = []
  const bucket = Math.max(1, Math.floor(signal.length / PEAK_BUCKETS))
  for (let i = 0; i < signal.length; i += bucket) {
    let lo = 0
    let hi = 0
    for (let j = i; j < Math.min(signal.length, i + bucket); j++) {
      if (signal[j] < lo) lo = signal[j]
      if (signal[j] > hi) hi = signal[j]
    }
    peaks.push(Math.round(lo * 1000) / 1000, Math.round(hi * 1000) / 1000)
  }

  progress(1, 'Done')
  const bpm = bpmFromBeats(
    beats.map((b) => b.time),
    tempo.bpm,
  )
  const hits = findHits(f.onset, fr, ONSET_LATENCY, (60 / Math.max(40, bpm)) * 4 * fr)
  return {
    duration,
    bpm: Math.round(bpm * 10) / 10,
    confidence: tempo.confidence,
    beats,
    sections,
    drops,
    hits,
    envelope,
    envelopeRate,
    peaks,
  }
}
