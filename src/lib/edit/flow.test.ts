import { describe, expect, it } from 'vitest'
import { analyzeSong } from '../audio/analyze'
import { synthesizeDemoSong } from '../demo/song'
import type { ClipAnalysis } from '../types'
import type { AssignableClip } from './assign'
import { makePlan } from './plan'
import { sourceDuration } from './speed'

const song = analyzeSong(synthesizeDemoSong(22050).samples, { sampleRate: 22050 })

/** A clip with action peaks at the given times, and scene cuts. */
function clip(id: string, duration: number, peaks: number[], cuts: number[] = [], base = 0.3): AssignableClip {
  const dt = 0.2
  const times = Array.from({ length: Math.floor(duration / dt) }, (_, i) => i * dt)
  const interest = times.map((t) => Math.min(1, base + peaks.reduce((s, p) => s + 0.6 * Math.exp(-(((t - p) / 0.8) ** 2)), 0)))
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

const plan = (clips: AssignableClip[], seed = 3) =>
  makePlan(song, clips, { style: 'hype', length: 30, order: 'best', hitCuts: true, variety: 0.5, seed })

describe('flow', () => {
  it('plays a montage forward instead of jumping around it', () => {
    // One long montage, with scenes every few seconds and action all through it.
    const cuts = Array.from({ length: 40 }, (_, i) => (i + 1) * 4.5)
    const peaks = Array.from({ length: 60 }, (_, i) => 1.5 + i * 3)
    for (const seed of [1, 2, 3, 4]) {
      const p = plan([clip('montage', 185, peaks, cuts)], seed)
      const story = p.shots.filter((s) => s.phase !== 'hero' && s.phase !== 'tease').map((s) => s.srcStart)
      expect(story.length).toBeGreaterThan(8)
      for (let i = 1; i < story.length; i++) expect(story[i]).toBeGreaterThanOrEqual(story[i - 1])
      // Moments never straddle a scene cut.
      for (const s of p.shots) {
        const len = sourceDuration(s.speed, s.end - s.start)
        const crossed = cuts.filter((c) => c > s.srcStart + 0.05 && c < s.srcStart + len - 0.05)
        expect({ phase: s.phase, srcStart: s.srcStart, len, crossed }).toMatchObject({ crossed: [] })
      }
    }
  })
})

describe('the cast', () => {
  it('builds the edit around the star, not whoever else is on screen', () => {
    const fighter = { ...clip('fighter', 60, [10, 30, 50]), star: [] as number[], others: [] as number[] }
    const crowd = { ...clip('crowd', 60, [8, 20, 33, 45], [], 0.45), star: [] as number[], others: [] as number[] }
    fighter.star = fighter.analysis.times.map(() => 0.8)
    fighter.others = fighter.analysis.times.map(() => 0)
    // Busier footage, but of other people.
    crowd.star = crowd.analysis.times.map(() => 0)
    crowd.others = crowd.analysis.times.map(() => 0.8)
    const p = plan([fighter, crowd])
    expect(p.shots.find((s) => s.phase === 'hero')!.clipId).toBe('fighter')
    const share = p.shots.filter((s) => s.clipId === 'fighter').length / p.shots.length
    expect(share).toBeGreaterThan(0.75)
  })
})
