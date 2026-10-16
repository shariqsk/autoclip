import { describe, expect, it } from 'vitest'
import type { ClipAnalysis, ClipContent, ContentKind } from '../types'
import { classify, CONTENT_KINDS, contentSeries, contentShares, smoothByScene } from './classify'

/** Prompt fingerprints for a toy 6-dimensional space: one axis per shot type. */
const axis = (k: number, w = 1) => Array.from({ length: 6 }, (_, i) => (i === k ? w : 0))
const prompts = Object.fromEntries(CONTENT_KINDS.map((k, i) => [k, [axis(i), axis(i, 0.9)]])) as Record<ContentKind, number[][]>

describe('shot types', () => {
  it('gives the closest type the best odds', () => {
    const p = classify([0.1, 0.9, 0.1, 0, 0, 0], prompts)
    expect(CONTENT_KINDS[p.indexOf(Math.max(...p))]).toBe('action')
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 2)
  })

  it('reads each scene as one shot type, so a stray frame cannot flip it', () => {
    const a = [0.9, 0.02, 0.02, 0.02, 0.02, 0.02]
    const b = [0.02, 0.9, 0.02, 0.02, 0.02, 0.02]
    const content: ClipContent = { step: 1, times: [0.5, 1.5, 2.5, 3.5, 4.5], probs: [a, a, b, a, b] }
    const s = smoothByScene(content, [4])
    // Before the cut: mostly finishes; after it, the one sample stands alone.
    expect(s.probs[2][0]).toBeGreaterThan(s.probs[2][1])
    expect(s.probs[4]).toEqual(b)
  })

  it('lines shot types up with a clip’s analysis and sums up what the footage is', () => {
    const times = Array.from({ length: 10 }, (_, i) => i * 0.5)
    const a = { times, duration: 5 } as ClipAnalysis
    const talk = [0, 0, 0, 0, 0.9, 0.1]
    const broll = [0, 0, 0.9, 0, 0, 0.1]
    const content: ClipContent = { step: 1, times: [0.5, 1.5, 2.5, 3.5, 4.5], probs: [talk, talk, broll, broll, broll] }
    const series = contentSeries(a, content)!
    expect(series.talk[0]).toBeCloseTo(0.9)
    expect(series.broll[9]).toBeCloseTo(0.9)
    expect(contentShares(content)).toMatchObject({ talk: 0.4, broll: 0.6 })
  })
})
