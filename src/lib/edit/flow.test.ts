import { describe, expect, it } from 'vitest'
import { analyzeSong } from '../audio/analyze'
import { synthesizeDemoSong } from '../demo/song'
import type { ClipAnalysis } from '../types'
import type { AssignableClip } from './assign'
import { makePlan } from './plan'

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
