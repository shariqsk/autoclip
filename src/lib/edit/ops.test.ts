import { describe, expect, it } from 'vitest'
import type { EditPlan, Shot } from '../types'
import { bestMoment, removeShot, rollCut, snapToBeat, splitShot, swapClip } from './ops'

const shot = (id: string, start: number, end: number, srcStart = 0, clipId = 'a'): Shot => ({
  id,
  clipId,
  start,
  end,
  srcStart,
  speed: { kind: 'constant', speed: 1 },
  transition: { type: 'cut', duration: 0 },
  fx: { pulse: 0, shake: 0, rgb: 0, flash: 0, push: 0 },
  reason: '',
  energy: 0.5,
})
const plan: EditPlan = {
  songStart: 0,
  songEnd: 3,
  shots: [shot('1', 0, 1, 2), shot('2', 1, 2, 5, 'b'), shot('3', 2, 3, 1)],
  hits: [],
  captions: [],
  seed: 1,
}

const clip = (id: string, peak: number) => {
  const times = Array.from({ length: 50 }, (_, i) => i * 0.2)
  const flat = times.map(() => 0.5)
  return {
    id,
    kind: 'video' as const,
    analysis: {
      duration: 10,
      width: 100,
      height: 100,
      fps: 30,
      times,
      motion: flat,
      brightness: flat,
      sharpness: flat,
      loudness: flat,
      focusX: flat,
      focusY: flat,
      interest: times.map((t) => Math.exp(-(((t - peak) / 0.6) ** 2))),
      cuts: [],
    },
  }
}

describe('director edits', () => {
  it('rolls a cut and keeps the next shot anchored', () => {
    const p = rollCut(plan, 1, 1.25)
    expect(p.shots[0].end).toBe(1.25)
    expect(p.shots[1].start).toBe(1.25)
    expect(p.shots[1].srcStart).toBeCloseTo(5.25)
    expect(p.shots[1].end).toBe(2)
  })

  it('never rolls a cut past its neighbours', () => {
    const p = rollCut(plan, 1, 5)
    expect(p.shots[1].start).toBeLessThan(2)
    expect(p.shots[1].end - p.shots[1].start).toBeGreaterThan(0.1)
  })

  it('splits a shot into two that continue seamlessly', () => {
    const p = splitShot(plan, '2', 1.4)
    expect(p.shots).toHaveLength(4)
    expect(p.shots[1].end).toBe(1.4)
    expect(p.shots[2].start).toBe(1.4)
    expect(p.shots[2].srcStart).toBeCloseTo(5.4)
  })

  it('fills the gap when a shot is removed', () => {
    const p = removeShot(plan, '2')
    expect(p.shots.map((s) => [s.start, s.end])).toEqual([
      [0, 2],
      [2, 3],
    ])
    const first = removeShot(plan, '1')
    expect(first.shots[0].start).toBe(0)
  })

  it('finds the best moment, skipping used ones', () => {
    const c = clip('c', 6)
    expect(bestMoment(c, 1, [])).toBeGreaterThan(5)
    expect(bestMoment(c, 1, [])).toBeLessThan(6.2)
    const avoid = bestMoment(c, 1, [[5, 7]])
    expect(avoid + 1 <= 5.01 || avoid >= 6.99).toBe(true)
  })

  it('swaps a clip and lands on its action', () => {
    const p = swapClip(plan, '2', clip('z', 3))
    const s = p.shots[1]
    expect(s.clipId).toBe('z')
    expect(s.srcStart).toBeGreaterThan(2)
    expect(s.srcStart).toBeLessThan(3.2)
  })

  it('snaps to beats and half-beats', () => {
    expect(snapToBeat(1.04, [0, 0.5, 1, 1.5])).toBe(1)
    expect(snapToBeat(1.27, [0, 0.5, 1, 1.5])).toBe(1.25)
    expect(snapToBeat(1.27, [0, 0.5, 1, 1.5], false)).toBe(1.27)
  })
})
