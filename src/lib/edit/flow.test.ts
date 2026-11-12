import { describe, expect, it } from 'vitest'
import { analyzeSong } from '../audio/analyze'
import { synthesizeDemoSong } from '../demo/song'
import type { ClipAnalysis } from '../types'
import type { AssignableClip, Flow } from './assign'
import { MIX_PRESETS } from '../../state/settings'
import { CONTENT_KINDS } from '../content/classify'
import type { ContentKind, EditPlan, Shot } from '../types'
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

const plan = (clips: AssignableClip[], seed = 3, mix = MIX_PRESETS[0].mix, flow: Flow = 'peaks') =>
  makePlan(song, clips, { style: 'hype', length: 30, flow, hitCuts: true, variety: 0.5, seed, mix })
const story = (clips: AssignableClip[], seed = 3) => plan(clips, seed, MIX_PRESETS[0].mix, 'story')

/** The seconds of its clip a shot shows. */
const range = (s: Shot): [number, number] => [s.srcStart, s.srcStart + sourceDuration(s.speed, s.end - s.start)]
/** The shots that tell the story: everything but the drop and the cold open, which may reach ahead. */
const walk = (p: EditPlan) => p.shots.filter((s) => s.phase !== 'hero' && s.phase !== 'tease')

describe('story flow', () => {
  const fight = clip('fight', 300, [20, 80, 150, 290])

  it('moves through one long clip from its start to its end', () => {
    for (const seed of [1, 2, 3, 4]) {
      const shots = walk(story([fight], seed))
      for (let i = 1; i < shots.length; i++) expect(shots[i].srcStart).toBeGreaterThanOrEqual(range(shots[i - 1])[1] - 0.05)
      expect(shots[0].srcStart).toBeLessThan(60)
      expect(range(shots.at(-1)!)[1]).toBeGreaterThan(240)
    }
  })

  it('never shows the same seconds twice', () => {
    for (const seed of [1, 2, 3]) {
      const ranges = story([fight], seed)
        .shots.map(range)
        .sort((a, b) => a[0] - b[0])
      for (let i = 1; i < ranges.length; i++) expect(ranges[i][0]).toBeGreaterThanOrEqual(ranges[i - 1][1] - 0.05)
    }
  })

  it('plays the clips in the order they are in, each from its start', () => {
    const shots = walk(story([clip('a', 60, [10, 30, 50]), clip('b', 40, [5, 15, 30]), clip('c', 50, [12, 40])]))
    const ids = shots.map((s) => s.clipId)
    expect([...new Set(ids)]).toEqual(['a', 'b', 'c'])
    expect(ids).toEqual([...ids].sort())
    for (let i = 1; i < shots.length; i++)
      if (shots[i].clipId === shots[i - 1].clipId) expect(shots[i].srcStart).toBeGreaterThanOrEqual(shots[i - 1].srcStart)
  })

  it('still lands a peak of the action on the drop', () => {
    const hero = story([fight]).shots.find((s) => s.phase === 'hero')!
    const [from, to] = range(hero)
    expect([20, 80, 150, 290].some((peak) => peak > from - 0.5 && peak < to + 0.5)).toBe(true)
  })

  it('gives each clip the share of the edit you set', () => {
    const a = { ...clip('a', 60, [10, 30, 50]), share: 80 }
    const b = clip('b', 60, [5, 25, 45])
    for (const flow of ['story', 'peaks'] as const) {
      const p = plan([a, b], 3, MIX_PRESETS[0].mix, flow)
      const onA = p.shots.filter((s) => s.clipId === 'a').reduce((t, s) => t + s.end - s.start, 0)
      const part = onA / (p.songEnd - p.songStart)
      expect(part).toBeGreaterThan(0.65)
      expect(part).toBeLessThan(0.95)
    }
  })

  it('leaves out a clip given no share', () => {
    const p = story([clip('a', 60, [10, 30]), { ...clip('b', 60, [5, 25]), share: 0 }])
    expect(p.shots.every((s) => s.clipId === 'a')).toBe(true)
  })

  it('follows the star through a montage, skipping the stretches of other people', () => {
    const montage = clip(
      'montage',
      200,
      Array.from({ length: 60 }, (_, i) => 1.5 + i * 3),
    )
    // The star is in the first and last minute; the middle is somebody else.
    const theirs = (t: number) => t < 60 || t > 140
    montage.star = montage.analysis.times.map((t) => (theirs(t) ? 0.8 : 0))
    montage.others = montage.analysis.times.map((t) => (theirs(t) ? 0 : 0.8))
    const shots = story([montage]).shots
    const off = shots.filter((s) => !theirs(s.srcStart)).reduce((t, s) => t + s.end - s.start, 0)
    expect(off).toBeLessThan(2)
    expect(shots.some((s) => s.srcStart > 140)).toBe(true)
  })
})

describe('payoffs', () => {
  it("doesn't cut away right before the action it was building to", () => {
    const peaks = [14, 41, 67, 95, 122, 149, 176]
    for (const flow of ['story', 'peaks'] as const) {
      for (const seed of [1, 2, 3]) {
        const p = plan([clip('game', 190, peaks)], seed, MIX_PRESETS[0].mix, flow)
        // A shot that ends inside the second before a peak showed the wind-up and not the hit.
        const teased = p.shots
          .filter((s) => s.phase !== 'intro' && s.phase !== 'outro')
          .filter((s) => peaks.some((peak) => peak - range(s)[1] > 0.4 && peak - range(s)[1] < 1))
        expect(teased.map((s) => `${s.phase}@${s.srcStart}`)).toEqual([])
      }
    }
  })
})

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

/** Every sample of a clip read as one shot type. */
const readAs = (c: AssignableClip, kind: ContentKind): AssignableClip => ({
  ...c,
  content: Object.fromEntries(CONTENT_KINDS.map((k) => [k, c.analysis.times.map(() => (k === kind ? 0.9 : 0.02))])) as Record<
    ContentKind,
    number[]
  >,
})

describe('the content mix', () => {
  const finishes = readAs(clip('finishes', 40, [8, 20, 32]), 'finish')
  const broll = readAs(clip('broll', 40, [10, 30], [], 0.25), 'broll')
  // Lots of movement, but it's a press conference.
  const presser = readAs(clip('presser', 60, [5, 15, 25, 35, 45], [], 0.55), 'talk')

  it('keeps out what you set to none and puts a big moment on the drop', () => {
    const preset = MIX_PRESETS.find((p) => p.id === 'highlights')!
    const p = plan([finishes, broll, presser], 3, preset.mix)
    expect(p.shots.some((s) => s.clipId === 'presser')).toBe(false)
    expect(p.shots.find((s) => s.phase === 'hero')!.clipId).toBe('finishes')
    // A bit of b-roll still makes it in, at the start.
    expect(p.shots.filter((s) => s.phase === 'intro').some((s) => s.clipId === 'broll')).toBe(true)
  })

  it('opens on b-roll and saves the big moment for the drop, even at "some"', () => {
    const p = plan([finishes, broll])
    const intro = p.shots.filter((s) => s.phase === 'intro')
    expect(intro.filter((s) => s.clipId === 'broll').length).toBeGreaterThanOrEqual(intro.length / 2)
    expect(p.shots.find((s) => s.phase === 'hero')!.clipId).toBe('finishes')
  })
})

describe('repeats', () => {
  /** Pairs of shots close together on the timeline that show the same seconds of the same clip. */
  function replays(p: ReturnType<typeof plan>, within = 3) {
    const found: [number, number][] = []
    p.shots.forEach((a, i) => {
      for (let j = i + 1; j <= i + within && j < p.shots.length; j++) {
        const b = p.shots[j]
        if (a.clipId !== b.clipId) continue
        const aEnd = a.srcStart + sourceDuration(a.speed, a.end - a.start)
        const bEnd = b.srcStart + sourceDuration(b.speed, b.end - b.start)
        if (Math.min(aEnd, bEnd) - Math.max(a.srcStart, b.srcStart) > 0.05) found.push([i, j])
      }
    })
    return found
  }

  it('never replays a moment right after itself, even when the footage you want is scarce', () => {
    // A long montage where only a few short scenes are the big moments you asked for.
    const cuts = Array.from({ length: 40 }, (_, i) => (i + 1) * 4.5)
    const peaks = Array.from({ length: 60 }, (_, i) => 1.5 + i * 3)
    const montage = readAs(clip('montage', 185, peaks, cuts), 'talk')
    const big = new Set([9, 10, 21, 22, 33, 34, 35])
    montage.content!.finish = montage.analysis.times.map((t) => (big.has(Math.floor(t / 4.5)) ? 0.9 : 0.02))
    montage.content!.talk = montage.content!.finish.map((v) => (v > 0.5 ? 0.02 : 0.9))
    const preset = MIX_PRESETS.find((p) => p.id === 'highlights')!
    for (const seed of [1, 2, 3, 4, 5]) expect(replays(plan([montage], seed, preset.mix))).toEqual([])
  })

  it('never replays a moment right after itself in a short clip', () => {
    for (const seed of [1, 2, 3]) expect(replays(plan([clip('short', 12, [3, 8])], seed))).toEqual([])
  })
})
