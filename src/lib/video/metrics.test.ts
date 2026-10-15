import { describe, expect, it } from 'vitest'
import { detectCuts, interestScore, motion, sharpness, signature, signatureDistance, type Gray } from './metrics'

const W = 32
const H = 18
function frame(fn: (x: number, y: number) => number): Gray {
  const data = new Float32Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data[y * W + x] = fn(x, y)
  return { data, width: W, height: H }
}

describe('frame metrics', () => {
  it('finds where the motion is', () => {
    const a = frame(() => 0.2)
    const b = frame((x) => (x > 24 ? 0.9 : 0.2))
    const m = motion(a, b)
    expect(m.amount).toBeGreaterThan(0.1)
    expect(m.x).toBeGreaterThan(0.75)
    expect(m.y).toBeCloseTo(0.5, 1)
  })

  it('ignores sensor noise', () => {
    const a = frame(() => 0.5)
    const b = frame((x, y) => 0.5 + ((x + y) % 2 ? 0.02 : -0.02))
    expect(motion(a, b).amount).toBe(0)
  })

  it('rates detail above blur', () => {
    const crisp = frame((x, y) => ((x + y) % 2 ? 1 : 0))
    const flat = frame(() => 0.5)
    expect(sharpness(crisp)).toBeGreaterThan(sharpness(flat))
  })

  it('tells a cut from a pan', () => {
    const day = frame((x) => 0.6 + 0.3 * Math.sin(x / 4))
    const night = frame((_, y) => 0.05 + (0.02 * y) / H)
    const dists = [0, 0.05, 0.06, 0.04, signatureDistance(signature(day), signature(night)), 0.05, 0.04, 0.06]
    expect(detectCuts(dists)).toEqual([4])
    // Constant heavy change (a whip pan) is not a cut.
    expect(detectCuts([0, 0.5, 0.55, 0.5, 0.52, 0.5])).toEqual([])
  })
})

describe('interestScore', () => {
  it('peaks where motion and noise peak', () => {
    const n = 40
    const motionRaw = Array.from({ length: n }, (_, i) => (i > 20 && i < 26 ? 0.15 : 0.01))
    const loud = Array.from({ length: n }, (_, i) => (i > 21 && i < 27 ? 0.9 : 0.2))
    const s = interestScore({ motion: motionRaw, sharpness: Array(n).fill(0.05), brightness: Array(n).fill(0.5), loudness: loud })
    const peak = s.interest.indexOf(Math.max(...s.interest))
    expect(peak).toBeGreaterThan(19)
    expect(peak).toBeLessThan(28)
  })
})
