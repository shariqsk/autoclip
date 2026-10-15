import { describe, expect, it } from 'vitest'
import { analyzeSong } from '../audio/analyze'
import { synthesizeDemoSong } from '../demo/song'
import type { ClipAnalysis } from '../types'
import type { AssignableClip } from './assign'
import { makePlan } from './plan'
import { createRng } from './rng'
import { buildSlots } from './slots'
import { getStyle } from './presets'
import { chooseWindow } from './window'

const song = analyzeSong(synthesizeDemoSong(22050).samples, { sampleRate: 22050 })
const bp = 60 / song.bpm

function clip(id: string, duration: number, peak: number, cuts: number[] = []): AssignableClip {
  const times = Array.from({ length: Math.floor(duration / 0.2) }, (_, i) => i * 0.2)
  const curve = times.map((t) => 0.2 + 0.7 * Math.exp(-(((t - peak) / 0.6) ** 2)))
  const flat = (v: number) => times.map(() => v)
  const analysis: ClipAnalysis = {
    duration,
    width: 1280,
    height: 720,
    fps: 30,
    times,
    motion: curve,
    brightness: flat(0.5),
    sharpness: flat(0.6),
    loudness: flat(0),
    focusX: flat(0.5),
    focusY: flat(0.5),
    interest: curve,
    cuts,
  }
  return { id, kind: 'video', analysis }
}
const clips = [clip('a', 12, 3), clip('b', 12, 8), clip('c', 12, 5), clip('d', 12, 10), clip('e', 12, 2)]

describe('the edit arc', () => {
  const window = chooseWindow(song, 30)
  const slots = buildSlots(song, window, getStyle('hype'), createRng(4))
  const drop = song.drops.find((d) => d.time > window.start && d.time < window.end)!.time - window.start

  it('holds long in the intro and cuts faster through the build', () => {
    const intro = slots.filter((s) => s.role === 'intro')
    const build = slots.filter((s) => s.role === 'build')
    expect(intro.length).toBeGreaterThan(0)
    expect(build.length).toBeGreaterThan(2)
    const mean = (xs: { start: number; end: number }[]) => xs.reduce((a, s) => a + s.end - s.start, 0) / xs.length
    expect(mean(intro)).toBeGreaterThan(mean(build) * 1.8)
    // Builds accelerate: the last build shot is the shortest.
    expect(build.at(-1)!.end - build.at(-1)!.start).toBeLessThanOrEqual(build[0].end - build[0].start)
    expect(build.at(-1)!.end).toBeCloseTo(drop, 2)
  })

  it('puts the hero exactly on the drop and opens cold', () => {
    const hero = slots.find((s) => s.role === 'hero')!
    expect(hero.start).toBeCloseTo(drop, 2)
    expect(slots[0].role).toBe('tease')
    expect(slots[0].end - slots[0].start).toBeLessThan(bp * 1.5)
  })

  it('cuts the flurry on varied lengths, not a fixed grid', () => {
    const lens = new Set(slots.filter((s) => s.role === 'flurry').map((s) => Math.round((s.end - s.start) / bp)))
    expect(lens.size).toBeGreaterThan(1)
  })

  it('ends on a held outro', () => {
    const last = slots.at(-1)!
    expect(['outro', 'flurry', 'ride']).toContain(last.role)
    expect(last.end).toBeCloseTo(window.end - window.start, 3)
  })

  it('runs the intro in black and white and brings the colour back on the drop', () => {
    const plan = makePlan(song, clips, { style: 'hype', length: 30, order: 'best', variety: 0.3, seed: 2 })
    const intro = plan.shots.filter((s) => s.phase === 'intro')
    const hero = plan.shots.find((s) => s.phase === 'hero')!
    expect(intro.every((s) => (s.fx.mono ?? 0) > 0.9)).toBe(true)
    expect(hero.fx.mono ?? 0).toBe(0)
    expect(hero.speed.kind).toBe('freeze')
    expect(plan.fadeOut).toBeGreaterThan(0)
  })

  it('still finds a centre of gravity in a song with no drop', () => {
    const flat = { ...song, drops: [] }
    const s = buildSlots(flat, { start: 0, end: 30 }, getStyle('cinematic'), createRng(1))
    expect(s.some((x) => x.role === 'hero')).toBe(true)
  })
})
