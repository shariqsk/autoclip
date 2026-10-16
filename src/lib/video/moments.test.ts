import { describe, expect, it } from 'vitest'
import type { ClipAnalysis } from '../types'
import { findMoments, sliceAnalysis } from './moments'

/** A 60 s clip sampled 5× a second, quiet except for the bumps given (centre, height, width). */
function clip(bumps: [number, number, number][], cuts: number[] = []): ClipAnalysis {
  const times = Array.from({ length: 300 }, (_, i) => i * 0.2)
  const interest = times.map((t) => Math.min(1, 0.05 + bumps.reduce((s, [c, h, w]) => s + h * Math.exp(-(((t - c) / w) ** 2)), 0)))
  const flat = times.map(() => 0.5)
  return {
    duration: 60,
    width: 1920,
    height: 1080,
    fps: 30,
    times,
    motion: interest,
    brightness: flat,
    sharpness: flat,
    loudness: flat,
    focusX: flat,
    focusY: flat,
    interest,
    cuts,
  }
}

describe('moments', () => {
  it('finds the action peaks and trims around them, leading in', () => {
    const ms = findMoments(
      clip([
        [12, 0.9, 1],
        [40, 0.7, 1.5],
      ]),
    )
    expect(ms).toHaveLength(2)
    const [a, b] = ms
    expect(a.peak).toBeCloseTo(12, 0)
    expect(b.peak).toBeCloseTo(40, 0)
    for (const m of ms) {
      expect(m.end - m.start).toBeGreaterThanOrEqual(2)
      expect(m.end - m.start).toBeLessThanOrEqual(8)
      // More of the moment comes before the peak than after.
      expect(m.peak - m.start).toBeGreaterThan(m.end - m.peak)
    }
    expect(a.score).toBeGreaterThan(b.score)
  })

  it('never lets a moment run across a cut', () => {
    const ms = findMoments(clip([[20.5, 0.9, 2]], [20]))
    expect(ms.length).toBeGreaterThan(0)
    for (const m of ms) expect(m.end <= 20 || m.start >= 20).toBe(true)
  })

  it('ignores a clip with nothing happening', () => {
    expect(findMoments(clip([]))).toEqual([])
  })

  it('slices an analysis down to a moment, starting at zero', () => {
    const a = clip([[12, 0.9, 1]], [11])
    const s = sliceAnalysis(a, 10, 14)
    expect(s.duration).toBe(4)
    expect(s.times[0]).toBe(0)
    expect(s.times.at(-1)).toBeCloseTo(3.8)
    expect(s.times.length).toBe(s.interest.length)
    expect(s.cuts).toEqual([1])
    expect(s.interest[10]).toBeCloseTo(a.interest[60])
  })
})
