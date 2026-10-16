import { describe, expect, it } from 'vitest'
import { analyzeSong } from '../audio/analyze'
import { synthesizeDemoSong } from '../demo/song'
import type { ClipAnalysis } from '../types'
import type { AssignableClip } from './assign'
import { makePlan } from './plan'
import { STYLES } from './presets'
import { sourceDuration, sourceOffset } from './speed'
import { frameAt } from './timeline'
import { chooseWindow } from './window'

const song = analyzeSong(synthesizeDemoSong(22050).samples, { sampleRate: 22050 })

function fakeClip(id: string, duration: number, peakAt: number | null, cuts: number[] = []): AssignableClip {
  const dt = 0.2
  const n = Math.floor(duration / dt)
  const times = Array.from({ length: n }, (_, i) => i * dt)
  const interest = times.map((t) => (peakAt === null ? 0.3 : 0.25 + 0.6 * Math.exp(-(((t - peakAt) / 0.5) ** 2))))
  const flat = (v: number) => times.map(() => v)
  const analysis: ClipAnalysis = {
    duration,
    width: 1920,
    height: 1080,
    fps: 30,
    times,
    motion: interest.map((v) => v * 0.9),
    brightness: flat(0.5),
    sharpness: flat(0.6),
    loudness: flat(0),
    focusX: flat(0.5),
    focusY: flat(0.5),
    interest,
    cuts,
  }
  return { id, kind: 'video', analysis }
}

const clips = [fakeClip('a', 20, 4), fakeClip('b', 20, 12, [8]), fakeClip('c', 15, null), fakeClip('hero', 12, 6.4), fakeClip('d', 25, 18)]
// Make the hero clip's peak the best moment in the set.
clips[3].analysis.interest = clips[3].analysis.interest.map((v, i) => (Math.abs(i * 0.2 - 6.4) < 0.5 ? 1 : v))

describe('chooseWindow', () => {
  it('puts the biggest drop early in a short edit', () => {
    const w = chooseWindow(song, 20)
    expect(w.end - w.start).toBeGreaterThan(17)
    expect(w.end - w.start).toBeLessThan(23)
    const drop = song.drops.find((d) => d.time > w.start && d.time < w.end)
    expect(drop).toBeDefined()
    const pos = (drop!.time - w.start) / (w.end - w.start)
    expect(pos).toBeGreaterThan(0.1)
    expect(pos).toBeLessThan(0.55)
  })

  it('uses the whole song for "full"', () => {
    expect(chooseWindow(song, 'full')).toEqual({ start: 0, end: song.duration })
  })
})

describe('speed ramps', () => {
  it('integrates constant and ramped speeds', () => {
    expect(sourceOffset({ kind: 'constant', speed: 0.5 }, 2, 4)).toBeCloseTo(1)
    const v = { kind: 'velocity', fast: 2, slow: 0.25 } as const
    const total = sourceDuration(v, 2)
    expect(total).toBeGreaterThan(2 * 0.25)
    expect(total).toBeLessThan(2 * 2)
    // Monotonic: source time never runs backwards.
    let prev = -1
    for (let u = 0; u <= 2; u += 0.05) {
      const s = sourceOffset(v, u, 2)
      expect(s).toBeGreaterThan(prev)
      prev = s
    }
  })
})

for (const style of STYLES) {
  describe(`makePlan (${style.name})`, () => {
    const plan = makePlan(song, clips, { style: style.id, length: 30, order: 'best', variety: 0.5, seed: 42 })
    const beatPeriod = 60 / song.bpm

    it('covers the edit with back-to-back shots', () => {
      expect(plan.shots.length).toBeGreaterThan(4)
      expect(plan.shots[0].start).toBeCloseTo(0, 3)
      for (let i = 1; i < plan.shots.length; i++) expect(plan.shots[i].start).toBeCloseTo(plan.shots[i - 1].end, 6)
      expect(plan.shots.at(-1)!.end).toBeCloseTo(plan.songEnd - plan.songStart, 3)
    })

    it('cuts on beats or half-beats', () => {
      const beatTimes = song.beats.map((b) => b.time - plan.songStart)
      for (const s of plan.shots.slice(1)) {
        const nearest = Math.min(...beatTimes.map((b) => Math.min(Math.abs(b - s.start), Math.abs(b + beatPeriod / 2 - s.start))))
        expect(nearest).toBeLessThan(0.03)
      }
    })

    it('never plays the same clip twice in a row', () => {
      for (let i = 1; i < plan.shots.length; i++) expect(plan.shots[i].clipId).not.toBe(plan.shots[i - 1].clipId)
    })

    it('never runs a shot across a cut inside a clip', () => {
      for (const s of plan.shots.filter((x) => x.clipId === 'b')) {
        const end = s.srcStart + sourceDuration(s.speed, s.end - s.start)
        expect(s.srcStart >= 8 - 0.05 || end <= 8 + 0.05).toBe(true)
      }
    })

    it('stays inside each clip', () => {
      for (const s of plan.shots) {
        const clip = clips.find((c) => c.id === s.clipId)!
        expect(s.srcStart).toBeGreaterThanOrEqual(0)
        expect(s.srcStart + sourceDuration(s.speed, s.end - s.start)).toBeLessThanOrEqual(clip.analysis.duration + 0.01)
      }
    })

    it('puts the best moment on the drop', () => {
      const drop = song.drops.find((d) => d.time > plan.songStart && d.time < plan.songEnd)!
      const hero = plan.shots.find((s) => Math.abs(s.start - (drop.time - plan.songStart)) < 0.03)!
      expect(hero).toBeDefined()
      expect(hero.clipId).toBe('hero')
    })
  })
}

describe('makePlan', () => {
  it('is reproducible from its seed, and remixes change it', () => {
    const opts = { style: 'hype', length: 30, order: 'best', variety: 1 } as const
    const a = makePlan(song, clips, { ...opts, seed: 1 })
    const b = makePlan(song, clips, { ...opts, seed: 1 })
    const c = makePlan(song, clips, { ...opts, seed: 99 })
    const sig = (p: typeof a) => p.shots.map((s) => `${s.clipId}@${s.srcStart.toFixed(2)}:${s.transition.type}`).join()
    expect(sig(a)).toBe(sig(b))
    expect(sig(a)).not.toBe(sig(c))
  })

  it('keeps locked shots through a remix', () => {
    const opts = { style: 'hype', length: 30, order: 'best', variety: 1 } as const
    const a = makePlan(song, clips, { ...opts, seed: 1 })
    const lock = { ...a.shots[3], locked: true }
    const b = makePlan(song, clips, { ...opts, seed: 7, locked: [lock] })
    const kept = b.shots.find((s) => Math.abs(s.start - lock.start) < 0.01)!
    expect(kept.clipId).toBe(lock.clipId)
    expect(kept.srcStart).toBe(lock.srcStart)
    expect(kept.locked).toBe(true)
  })

  it('keeps clips in order in story mode', () => {
    const plan = makePlan(song, clips, { style: 'cinematic', length: 30, order: 'story', variety: 0, seed: 3 })
    const order = clips.map((c) => c.id)
    const firstHalf = plan.shots.slice(0, Math.floor(plan.shots.length / 3)).map((s) => order.indexOf(s.clipId))
    const lastThird = plan.shots.slice(Math.floor((plan.shots.length * 2) / 3)).map((s) => order.indexOf(s.clipId))
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    expect(mean(firstHalf)).toBeLessThan(mean(lastThird))
  })
})

describe('frameAt', () => {
  const plan = makePlan(song, clips, { style: 'smooth', length: 30, order: 'best', variety: 0.5, seed: 5 })
  it('blends two shots during a transition and one otherwise', () => {
    const withTrans = plan.shots.find((s, i) => i > 0 && s.transition.duration > 0)!
    const mid = frameAt(plan, withTrans.start)
    expect(mid.transition).not.toBeNull()
    expect(mid.b?.shot.id).toBe(withTrans.id)
    expect(mid.transition!.progress).toBeCloseTo(0.5, 2)
    const plain = frameAt(plan, withTrans.start + withTrans.transition.duration)
    expect(plain.a?.shot.id).toBe(withTrans.id)
  })
  it('advances source time with the shot', () => {
    const s = plan.shots[1]
    const f0 = frameAt(plan, s.start + 0.2)
    const f1 = frameAt(plan, s.start + 0.3)
    if (f0.a?.shot.id === s.id && f1.a?.shot.id === s.id) expect(f1.a.srcTime).toBeGreaterThan(f0.a.srcTime)
  })
})

describe('transitions', () => {
  it('cuts straight between shots of the same footage', () => {
    for (const style of STYLES) {
      const one = makePlan(song, [fakeClip('only', 120, 30)], { style: style.id, length: 30, order: 'best', variety: 0.5, seed: 3 })
      expect(one.shots.length).toBeGreaterThan(4)
      for (const shot of one.shots) if (shot.transition.type !== 'panels') expect(shot.transition).toEqual({ type: 'cut', duration: 0 })
    }
  })

  it('opens on a collage when the style or you ask for one', () => {
    const opts = { length: 30 as const, order: 'best' as const, variety: 0.5, seed: 3 }
    const panels = (p: ReturnType<typeof makePlan>) => p.shots.filter((x) => x.transition.type === 'panels')
    const smooth = makePlan(song, clips, { ...opts, style: 'smooth' })
    expect(panels(smooth).length).toBeGreaterThan(0)
    for (const shot of panels(smooth)) expect(['intro', 'tease']).toContain(shot.phase)
    expect(panels(makePlan(song, clips, { ...opts, style: 'smooth', collage: false }))).toHaveLength(0)
    expect(panels(makePlan(song, clips, { ...opts, style: 'hype', collage: true })).length).toBeGreaterThan(0)
  })

  it('treats moments cut from one clip as the same footage', () => {
    const moments = [
      { ...fakeClip('m1', 20, 4), source: 'long' },
      { ...fakeClip('m2', 20, 12), source: 'long' },
    ]
    const plan = makePlan(song, moments, { style: 'hype', length: 30, order: 'best', variety: 0.5, seed: 3 })
    for (const shot of plan.shots) expect(shot.transition.type).toBe('cut')
  })
})
