import { describe, expect, it } from 'vitest'
import type { Beat, SongAnalysis } from '../types'
import { findEvents, frameColor, globalMotion, type FrameSample } from './frames'
import { learnStyle, measureEdit, syncOffset, type WatchedFrames } from './measure'
import { quantizeBeats } from './stats'

const BPM = 120
const BP = 60 / BPM
const DROP = 16

function song(duration: number, hits: number[] = []): SongAnalysis {
  const beats: Beat[] = []
  for (let i = 0; i * BP < duration; i++)
    beats.push({ time: i * BP, kind: i % 4 ? 'beat' : 'downbeat', bar: i >> 2, strength: 0.5, energy: 0.5 })
  return {
    duration,
    bpm: BPM,
    confidence: 0.9,
    beats,
    sections: [],
    drops: [{ time: DROP, strength: 1 }],
    hits: hits.map((time) => ({ time, strength: 0.8 })),
    envelope: [],
    envelopeRate: 0.1,
    peaks: [],
  }
}

/**
 * A synthetic edit cut to a known plan: 4-beat intro shots in black and white, a build that speeds
 * up 2 → 1 → ½ → ½, a flash and a freeze-frame on the drop, then 1-beat cuts in colour.
 */
function plannedEdit(): { watched: WatchedFrames; cuts: number[] } {
  const dt = 1 / 30
  const duration = 30
  const cuts: number[] = []
  for (let t = 4 * BP; t < DROP - 8 * BP + 0.01; t += 4 * BP) cuts.push(t)
  let t = DROP - 8 * BP
  for (const b of [2, 2, 1, 1, 1, 0.5, 0.5]) {
    t += b * BP
    if (t < DROP - 0.01) cuts.push(t)
  }
  cuts.push(DROP)
  for (let x = DROP + 4 * BP; x < duration - 4 * BP; x += BP) cuts.push(x)
  cuts.push(duration - 4 * BP)
  const uniq = [...new Set(cuts.map((c) => Math.round(c * 1000) / 1000))].sort((a, b) => a - b)

  const frames: FrameSample[] = []
  for (let k = 0; k * dt < duration; k++) {
    const ft = k * dt
    const frozen = ft > DROP + 0.2 && ft < DROP + 1.2
    frames.push({
      t: ft,
      motion: frozen ? 0 : 0.03,
      brightness: ft >= DROP && ft < DROP + 0.07 ? 0.95 : 0.4,
      saturation: ft < DROP ? 0.01 : 0.4,
      warmth: 0.02,
      barTop: 0,
      barBottom: 0,
      dx: 0,
      dy: 0,
      scale: 1,
      zoomGain: 0,
    })
  }
  return { watched: { duration, dt, cuts: uniq, frames, events: findEvents(frames, uniq, dt) }, cuts: uniq }
}

describe('learning a style from an edit', () => {
  it('rounds shot lengths to musical values', () => {
    expect(quantizeBeats(0.6)).toBe(0.5)
    expect(quantizeBeats(1.4)).toBe(1)
    expect(quantizeBeats(1.5)).toBe(2)
    expect(quantizeBeats(3.1)).toBe(4)
    expect(quantizeBeats(20)).toBe(8)
  })

  it('reads the arc, the rhythm and the drop back out of an edit', () => {
    const { watched } = plannedEdit()
    const m = measureEdit('ref', watched, song(30))
    expect(m.drop).toBe(DROP)
    expect(m.cuts.onBeat / m.cuts.total).toBeGreaterThan(0.9)
    expect(m.mono.intro).toBeGreaterThan(0.9)
    expect(m.mono.after).toBeLessThan(0.1)
    expect(m.flashAtDrop).toBe(true)
    expect(m.freezeAtDrop).toBe(true)
    expect(m.shots.find((s) => s.phase === 'hero')?.start).toBeCloseTo(DROP, 2)

    const { preset, facts } = learnStyle([m], { id: 'learned-test', name: 'Mine' })
    expect(preset.id).toBe('learned-test')
    expect(preset.name).toBe('Mine')
    expect(preset.intro.beats).toBe(4)
    expect(preset.intro.mono).toBe(1)
    expect(preset.build.pattern.slice(-3)).toEqual([1, 0.5, 0.5])
    expect(preset.hero.beats).toBe(4)
    expect(preset.hero.speed.kind).toBe('freeze')
    expect(preset.hero.transition.flash).toBeGreaterThan(0)
    expect(preset.flurry.choices).toEqual([1, 1, 1, 1])
    expect(preset.look.grade).toBe('punch')
    expect(preset.coldOpen).toBe(false)
    expect(facts.join(' ')).toMatch(/black and white/)
  })

  it('learns to cut on hits between beats when the edit does', () => {
    const { watched } = plannedEdit()
    // Move every other post-drop cut onto an off-beat hit.
    const moved = watched.cuts.map((c, i) => (c > DROP + 3 && i % 2 === 0 ? c + 0.3 * BP : c))
    const hits = moved.filter((c, i) => c !== watched.cuts[i])
    const m = measureEdit('ref', { ...watched, cuts: moved }, song(30, hits))
    expect(m.cuts.onHit).toBe(hits.length)
    expect(learnStyle([m], { id: 'learned-hits', name: 'Hits' }).preset.hitCuts.everyBars).toBe(1)
  })

  it('lines the picture up with the music before judging the cuts', () => {
    const { watched } = plannedEdit()
    // The whole picture 40 ms early, as encoders and platforms often leave it.
    const early = watched.cuts.map((c) => c - 0.04)
    const beats = song(30).beats.map((b) => b.time)
    expect(syncOffset(early, beats, BP)).toBeCloseTo(-0.04, 2)
    const m = measureEdit('ref', { ...watched, cuts: early }, song(30))
    expect(m.cuts.onBeat / m.cuts.total).toBeGreaterThan(0.9)
    // Cuts all over the place have no offset to correct.
    expect(syncOffset([0.11, 0.73, 1.37, 2.02, 2.91, 3.3, 4.47], beats, BP)).toBe(0)
  })

  it('combines several references', () => {
    const a = measureEdit('a', plannedEdit().watched, song(30))
    const b = { ...a, name: 'b', mono: { intro: 0, after: 0, overall: 0 } }
    const { preset } = learnStyle([a, b, a], { id: 'learned-mix', name: 'Mix' })
    expect(preset.intro.mono).toBe(1)
    expect(preset.flurry.choices[0]).toBe(1)
  })
})

describe('reading frames', () => {
  it('measures colour and cinema bars', () => {
    const w = 10
    const h = 20
    const px = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4
        const bar = y < 2 || y >= h - 2
        px.set(bar ? [0, 0, 0, 255] : [220, 120, 40, 255], p)
      }
    }
    const c = frameColor(px, w, h)
    expect(c.barTop).toBeCloseTo(0.1)
    expect(c.barBottom).toBeCloseTo(0.1)
    expect(c.warmth).toBeGreaterThan(0.4)
    expect(c.saturation).toBeGreaterThan(0.5)
  })

  it('tells a freeze-frame punched on the beat from slow motion', () => {
    const dt = 1 / 30
    const sample = (t: number, motion: number): FrameSample => ({
      t,
      motion,
      brightness: 0.4,
      saturation: 0.3,
      warmth: 0,
      barTop: 0,
      barBottom: 0,
      dx: 0,
      dy: 0,
      scale: 1,
      zoomGain: 0,
    })
    const make = (motionAt: (k: number) => number) => Array.from({ length: 120 }, (_, k) => sample(k * dt, motionAt(k)))
    // Action, then a held frame from 1 s to 3 s with a zoom punch every half second.
    const frozen = make((k) => (k < 30 || k >= 90 ? 0.05 : k % 15 < 3 ? 0.04 : 0))
    expect(findEvents(frozen, [], dt).freezes.length).toBe(1)
    expect(findEvents(frozen, [], dt).freezes[0][0]).toBeCloseTo(1, 0)
    // Slow motion at 0.4×: each source frame shows two or three times, so stills come one or two at a time.
    const slowmo = make((k) => (k % 5 === 0 || k % 5 === 2 ? 0.05 : 0))
    expect(findEvents(slowmo, [], dt).freezes).toEqual([])
  })

  it('finds a whole-frame shift and a zoom punch', () => {
    const w = 32
    const h = 32
    const img = (f: (x: number, y: number) => number) => Float32Array.from({ length: w * h }, (_, i) => f(i % w, Math.floor(i / w)))
    const pattern = (x: number, y: number) => 0.5 + 0.5 * Math.sin(x * 0.7) * Math.cos(y * 0.5)
    const prev = img(pattern)
    const shifted = img((x, y) => pattern(x - 2, y + 1))
    const m = globalMotion(prev, shifted, w, h)
    expect([m.dx, m.dy]).toEqual([2, -1])
    const c = (w - 1) / 2
    const zoomed = img((x, y) => pattern(Math.round(c + (x - c) / 1.06), Math.round(c + (y - c) / 1.06)))
    expect(globalMotion(prev, zoomed, w, h).scale).toBe(1.06)
  })
})
