// Footage matching: decide which part of which clip fills each slot.
//
// Every slot takes the window of footage that suits it best: loud slots get high-motion moments
// whose peak lands on the accent, calm slots get steadier ones, the drop gets the strongest moment
// of all. A moment is never shown twice while fresh footage remains, a shot never runs across a hard
// cut inside a clip, and it never stops just short of the action it was building to.
//
// In 'story' flow the edit also moves through the footage from start to end: each clip owns a
// stretch of the edit (its share), and the shots walk forward through it. In 'peaks' flow the
// strongest moments go wherever the music hits hardest.

import { CONTENT_KINDS } from '../content/classify'
import type { ClipAnalysis, ClipKind, ContentKind, ContentMix, SpeedRamp } from '../types'
import type { Rng } from './rng'
import { footageShares } from './shares'
import type { Slot, SlotRole } from './slots'
import { sourceDuration, sourceOffset } from './speed'

export interface AssignableClip {
  id: string
  kind: ClipKind
  analysis: ClipAnalysis
  pin?: 'hero' | 'skip'
  /** The clip this one was cut from, for moments: shots from the same footage are one source. */
  source?: string
  /** Where a moment starts in its source, in seconds, so moments of one clip can't replay each other. */
  offset?: number
  /** The share of the edit you gave this clip, 0–100. Unset: split by how much footage there is. */
  share?: number
  /** 0–1 per analysis sample: one of your stars on screen (see lib/people). */
  star?: number[]
  /** 0–1 per analysis sample: someone you cut on screen. */
  avoid?: number[]
  /** 0–1 per analysis sample: someone else on screen with none of your stars. */
  others?: number[]
  /** Odds of each shot type per analysis sample (see lib/content). */
  content?: Record<ContentKind, number[]>
}

export interface Assignment {
  clipId: string
  srcStart: number
  speed: SpeedRamp
}

export type Flow = 'story' | 'peaks'

export interface AssignOptions {
  /** 'story' moves through the footage from start to end; 'peaks' puts the strongest moments on the biggest hits. */
  flow: Flow
  /** 0–1: how much randomness a remix adds. */
  variety: number
  /** Slots already decided (locked shots), by slot index. */
  fixed?: Map<number, Assignment>
  /** How much of each shot type to use. */
  mix?: ContentMix
}

// How much each part of the arc wants your stars on screen: the drop is theirs, and the intro is
// where the viewer meets them.
const STAR_WEIGHT: Record<SlotRole, number> = { hero: 2.6, tease: 1.4, intro: 1.8, build: 1.1, flurry: 1.1, ride: 1, outro: 1.4 }

// Which shot types suit each part of the arc, before your mix: b-roll to open, the big moment on the
// drop, action through the build and after it, a celebration to close. Talking heads and text are
// rarely what an edit wants, so they lean out unless you ask for more.
const CONTENT_FIT: Record<SlotRole, Partial<Record<ContentKind, number>>> = {
  intro: { broll: 0.7, celebrate: 0.1, finish: -0.2, talk: -0.4, text: -0.6 },
  tease: { finish: 0.6, action: 0.3, talk: -0.6, text: -0.8 },
  build: { action: 0.5, finish: 0.2, broll: 0.1, talk: -0.5, text: -0.8 },
  hero: { finish: 1.2, action: 0.4, celebrate: -0.2, broll: -0.4, talk: -1, text: -1 },
  flurry: { action: 0.6, finish: 0.6, talk: -0.6, text: -0.8 },
  ride: { action: 0.4, broll: 0.2, talk: -0.3, text: -0.6 },
  outro: { celebrate: 0.8, broll: 0.4, talk: -0.2, text: -0.4 },
}
const MIX_WEIGHT = { none: -3, some: 0, more: 1 } as const

// How much movement each part of the arc wants, and the order slots are filled in: the drop gets
// first pick of everything, the cold open gets the next-best flash of action, and so on.
const TARGET_MOTION: Record<SlotRole, number> = { tease: 0.95, intro: 0.22, build: 0.65, hero: 1, flurry: 0.85, ride: 0.55, outro: 0.3 }
const PRIORITY: Record<SlotRole, number> = { hero: 6, tease: 4, flurry: 3, build: 2, intro: 1.6, outro: 1.5, ride: 1 }

/** How close on the timeline a moment may come back: a replay this soon looks like a glitch. */
const REPLAY_GAP = 3
/** Skipping less than this within one scene reads as a dropped frame, not a cut. */
const JUMP_CUT = 1
/** How far past the end of a shot to look for the action it was building to. */
const PAYOFF = 1.2
/** How long a still counts for when footage is shared out. */
const STILL = 3

/** Which scene of a clip a time falls in (clips that are already edits have several). */
const sceneOf = (cuts: number[], t: number) => cuts.filter((c) => c <= t + 0.02).length

interface Indexed {
  clip: AssignableClip
  order: number
  dt: number
  prefix: {
    interest: Float64Array
    motion: Float64Array
    sharp: Float64Array
    bright: Float64Array
    star: Float64Array | null
    avoid: Float64Array | null
    others: Float64Array | null
    content: Record<ContentKind, Float64Array> | null
    /** Footage worth showing: not someone else, not someone you cut, not a shot type you ruled out. */
    usable: Float64Array
  }
  /** This clip's stretch of the edit, as fractions of it. */
  from: number
  to: number
  uses: number
  /** Seconds on screen so far. */
  screen: number
}

function prefixSum(xs: number[]): Float64Array {
  const p = new Float64Array(xs.length + 1)
  for (let i = 0; i < xs.length; i++) p[i + 1] = p[i] + xs[i]
  return p
}

function index(clips: AssignableClip[], cast: boolean, mix: ContentMix | undefined): Indexed[] {
  const out = CONTENT_KINDS.filter((k) => mix?.[k] === 'none')
  return clips.map((clip, order) => {
    const a = clip.analysis
    const usable = a.times.map((_, i) => {
      const people = (1 - (clip.avoid?.[i] ?? 0)) * (cast ? 1 - (clip.others?.[i] ?? 0) : 1)
      const ruledOut = clip.content ? out.reduce((s, k) => s + clip.content![k][i], 0) : 0
      return Math.max(0.02, people * (1 - Math.min(1, ruledOut)))
    })
    return {
      clip,
      order,
      dt: a.times.length > 1 ? a.times[1] - a.times[0] : 1,
      prefix: {
        interest: prefixSum(a.interest),
        motion: prefixSum(a.motion),
        sharp: prefixSum(a.sharpness),
        bright: prefixSum(a.brightness),
        star: clip.star ? prefixSum(clip.star) : null,
        avoid: clip.avoid ? prefixSum(clip.avoid) : null,
        others: clip.others ? prefixSum(clip.others) : null,
        content: clip.content
          ? (Object.fromEntries(CONTENT_KINDS.map((k) => [k, prefixSum(clip.content![k])])) as Record<ContentKind, Float64Array>)
          : null,
        usable: prefixSum(usable),
      },
      from: 0,
      to: 1,
      uses: 0,
      screen: 0,
    }
  })
}

function meanOver(p: Float64Array, dt: number, from: number, to: number): number {
  const n = p.length - 1
  const i0 = Math.max(0, Math.min(n - 1, Math.floor(from / dt)))
  const i1 = Math.max(i0 + 1, Math.min(n, Math.ceil(to / dt)))
  return (p[i1] - p[i0]) / (i1 - i0)
}

/** How far through a clip's usable footage a time is, 0–1. */
function progressAt(c: Indexed, t: number): number {
  const p = c.prefix.usable
  const n = p.length - 1
  if (c.clip.kind === 'image' || n < 1) return 0.5
  const x = Math.max(0, Math.min(n, t / c.dt))
  const i = Math.min(n - 1, Math.floor(x))
  return (p[i] + (x - i) * (p[i + 1] - p[i])) / p[n]
}

/** The strongest the action gets between two times. */
function peakIn(c: Indexed, from: number, to: number): number {
  const xs = c.clip.analysis.interest
  let peak = 0
  for (let i = Math.max(0, Math.ceil(from / c.dt)); i < xs.length && i * c.dt <= to; i++) peak = Math.max(peak, xs[i])
  return peak
}

/** Seconds into the source where the peak of the action should be, so it lands on the slot's accent. */
function alignmentOffset(speed: SpeedRamp, duration: number, accent: number): number {
  // Slow-motion valleys and freeze-frames should hold the peak of the action.
  if (speed.kind === 'velocity') return sourceOffset(speed, duration / 2, duration)
  if (speed.kind === 'ease-in') return sourceOffset(speed, duration * 0.2, duration)
  if (speed.kind === 'freeze') return sourceOffset(speed, duration * speed.at, duration)
  return sourceOffset(speed, accent, duration) + 0.04
}

interface Candidate {
  clip: Indexed
  score: number
  srcStart: number
  speed: SpeedRamp
}

export function assignFootage(
  slots: Slot[],
  speeds: SpeedRamp[],
  clips: AssignableClip[],
  rng: Rng,
  opts: AssignOptions,
): (Assignment | null)[] {
  const result: (Assignment | null)[] = slots.map(() => null)
  const wanted = clips.filter((c) => c.pin !== 'skip')
  // Once there's a star, footage of anyone else is the wrong footage, however good it is.
  const cast = wanted.some((c) => c.star?.some((v) => v > 0))
  // Once you've ruled shot types out, footage nobody has looked at is a weaker pick.
  const filtering = !!opts.mix && Object.values(opts.mix).includes('none') && wanted.some((c) => c.content)
  const all = index(wanted, cast, opts.mix)
  const footage = (c: Indexed) => (c.clip.kind === 'image' ? STILL : c.prefix.usable[c.prefix.usable.length - 1] * c.dt)
  const share = footageShares(all.map((c) => ({ duration: footage(c), share: c.clip.share })))
  const pool = all.filter((_, i) => share[i] > 0)
  if (!pool.length) return result
  let at = 0
  for (const c of pool) {
    c.from = at
    at += share[all.indexOf(c)]
    c.to = at
  }

  const story = opts.flow === 'story'
  const budgeted = pool.some((c) => c.clip.share !== undefined)
  const total = slots.length ? slots[slots.length - 1].end : 0
  const fixed = opts.fixed ?? new Map<number, Assignment>()
  // With less footage than music, everything plays a little slower before anything plays twice.
  const have = pool.reduce((a, c) => a + (c.clip.kind === 'image' ? STILL : c.clip.analysis.duration), 0)
  const need = slots.reduce((a, s, i) => a + sourceDuration(speeds[i], s.end - s.start), 0)
  const slow = Math.max(0.6, Math.min(1, have / (need * 1.1)))
  const paced = speeds.map((sp, i) => (slow < 1 && sp.kind === 'constant' && !fixed.has(i) ? { ...sp, speed: sp.speed * slow } : sp))

  // What's already on screen, by source file and in its time, with the slot each range fills.
  const used = new Map<string, [number, number, number][]>()
  const usedOf = (c: Indexed) => {
    const key = c.clip.source ?? c.clip.id
    if (!used.has(key)) used.set(key, [])
    return used.get(key)!
  }
  const take = (i: number, c: Indexed, a: Assignment) => {
    const dur = slots[i].end - slots[i].start
    const from = a.srcStart + (c.clip.offset ?? 0)
    result[i] = a
    usedOf(c).push([from, from + sourceDuration(a.speed, dur), i])
    c.uses++
    c.screen += dur
  }
  for (const [i, a] of fixed) {
    const c = pool.find((p) => p.clip.id === a.clipId)
    if (c) take(i, c, a)
    else result[i] = a
  }

  // The drop and the cold open pick first. After that a story is told in order; otherwise the
  // highest-stakes slots keep picking first.
  const lead = (i: number) => slots[i].role === 'hero' || slots[i].role === 'tease'
  const rank = (i: number) => (story && !lead(i) ? -i : PRIORITY[slots[i].role] + slots[i].energy)
  const open = slots.map((_, i) => i).filter((i) => !result[i])
  open.sort((a, b) => rank(b) - rank(a))

  const sceneKey = (a: Assignment | null | undefined) => {
    if (!a) return null
    const c = pool.find((p) => p.clip.id === a.clipId)
    return c ? `${a.clipId}#${sceneOf(c.clip.analysis.cuts, a.srcStart)}` : a.clipId
  }
  // Where the story has got to: the clip, and the second of it, the last shot ended on.
  let cursor = { order: -1, end: 0, scene: -1 }

  for (const si of open) {
    const slot = slots[si]
    const dur = slot.end - slot.start
    const target = slot.hit ? 0.75 : TARGET_MOTION[slot.role]
    const neighbours = [result[si - 1], result[si + 1]]
    const neighbourClips = neighbours.map((n) => n?.clipId)
    const neighbourScenes = neighbours.map(sceneKey)
    // A shot cut on a hit wants something happening the moment it starts.
    const action = slot.role === 'hero' || slot.role === 'tease' || slot.role === 'flurry' || !!slot.hit
    const calm = (slot.role === 'intro' || slot.role === 'outro') && !slot.hit
    const walk = story && !lead(si)
    // Where in the edit this slot sits, and how much of it the slot covers.
    const here = total > 0 ? (slot.start + slot.end) / 2 / total : 0
    const span = Math.max(0.02, total > 0 ? dur / total : 1)
    let best: Candidate | null = null

    /** What it costs a shot to be out of place in the story: far from its part of the footage, or behind it. */
    const misplaced = (c: Indexed, s: number, len: number) => {
      if (!story || slot.role === 'tease') return 0
      const off = Math.abs(c.from + progressAt(c, s + len / 2) * (c.to - c.from) - here)
      if (!walk) return 0.6 * off
      const behind = c.order < cursor.order || (c.order === cursor.order && s < cursor.end - 0.02)
      return 0.3 * Math.min(9, (off / span) ** 2) + (behind ? 3 : 0)
    }

    for (const c of pool) {
      const a = c.clip.analysis
      const image = c.clip.kind === 'image'
      let speed = paced[si]
      let srcDur = sourceDuration(speed, dur)
      let base = -(image ? 0.18 : story ? 0 : 0.06) * c.uses
      if (c.clip.pin === 'hero') base += slot.role === 'hero' ? 0.6 : 0.08
      if (!story) {
        if (neighbourClips.includes(c.clip.id)) base -= 0.15
        // Shares you set are a budget: a clip short of its screen time goes first, one past it goes last.
        if (budgeted && total > 0) base += 8 * (c.to - c.from - (c.screen + dur) / total)
      }

      if (image) {
        const score =
          base + 0.38 + (1 - Math.abs(0.15 - target)) * 0.25 + (calm ? 0.1 : -0.1) + rng() * 0.12 * opts.variety - misplaced(c, 0, 0)
        if (!best || score > best.score) best = { clip: c, score, srcStart: 0, speed: { kind: 'constant', speed: 1 } }
        continue
      }

      // Too short for this slot at this speed: slow it down to fit, if that's still watchable.
      if (srcDur > a.duration - 0.05) {
        const factor = (a.duration - 0.05) / srcDur
        if (factor < 0.45) continue
        speed = { kind: 'constant', speed: Math.max(0.4, (speed.kind === 'constant' ? speed.speed : 1) * factor) }
        srcDur = sourceDuration(speed, dur)
      }

      const step = Math.max(0.1, c.dt / 2)
      const align = alignmentOffset(speed, dur, slot.accent)
      const shown = usedOf(c)
      const offset = c.clip.offset ?? 0
      for (let s = 0; s + srcDur <= a.duration - 0.04; s += step) {
        const e = s + srcDur
        if (a.cuts.some((cut) => cut > s + 0.04 && cut < e - 0.04)) continue
        const interest = meanOver(c.prefix.interest, c.dt, s, e)
        const motion = meanOver(c.prefix.motion, c.dt, s, e)
        const sharp = meanOver(c.prefix.sharp, c.dt, s, e)
        const bright = meanOver(c.prefix.bright, c.dt, s, e)
        // How strong the action is right where the music hits.
        const hitPoint = s + align
        const hitInterest = meanOver(c.prefix.interest, c.dt, hitPoint - c.dt, hitPoint + c.dt)
        // Impact: how much the action jumps at the hit compared with the second before it. A punch
        // landing reads harder than motion that was there all along.
        const impact = Math.max(0, hitInterest - meanOver(c.prefix.interest, c.dt, hitPoint - 1.4, hitPoint - 0.3))

        let score = base - (bright < 0.1 ? 0.35 : bright < 0.18 ? 0.1 : 0)
        if (calm) {
          // Intros and outros want steady, crisp shots: faces, walkouts, the crowd, the arena.
          score += 0.32 * (1 - Math.abs(motion - target)) + 0.3 * sharp + 0.12 * interest
        } else {
          score += 0.4 * interest + 0.2 * (1 - Math.abs(motion - target)) + 0.1 * sharp + (action ? 0.6 : 0.2) * hitInterest
          if (slot.role === 'hero' || slot.role === 'tease') score += 0.9 * impact
          // A shot that stops just before the action peaks is a setup with no payoff.
          const sceneEnd = a.cuts.find((cut) => cut > e - 0.04) ?? a.duration
          score -= 2 * Math.max(0, peakIn(c, e, Math.min(e + PAYOFF, sceneEnd)) - peakIn(c, s, e))
        }

        // Your cast: stars pull the shot their way (hardest on the drop), people you cut push it away.
        if (c.prefix.star) score += STAR_WEIGHT[slot.role] * meanOver(c.prefix.star, c.dt, s, e)
        else if (cast) score -= 0.25 * STAR_WEIGHT[slot.role]
        if (c.prefix.avoid) score -= 1.4 * meanOver(c.prefix.avoid, c.dt, s, e)
        // What kind of shot it is: what this part of the arc wants, and how much of it you asked for.
        if (c.prefix.content) {
          for (const k of CONTENT_KINDS) {
            const w = (CONTENT_FIT[slot.role][k] ?? 0) + (opts.mix ? MIX_WEIGHT[opts.mix[k]] : 0)
            if (w) score += w * meanOver(c.prefix.content[k], c.dt, s, e)
          }
        } else if (filtering) score -= 0.25
        if (cast && c.prefix.others) score -= 1.3 * meanOver(c.prefix.others, c.dt, s, e)

        const scene = sceneOf(a.cuts, s)
        if (walk) {
          // Carrying straight on from the last shot is fine; hopping a moment ahead in it is a glitch.
          const skipped = s - cursor.end
          if (c.order === cursor.order && scene === cursor.scene && skipped > 0.05 && skipped < JUMP_CUT) score -= 0.6
        } else if (neighbourScenes.includes(`${c.clip.id}#${scene}`)) score -= 0.6
        // A moment already on screen stays used: any overlap is a repeat the viewer sees, and one a
        // few shots apart is a glitch, not a callback.
        let overlap = 0
        let soon = false
        for (const [u0, u1, j] of shown) {
          const o = Math.max(0, Math.min(e, u1 - offset) - Math.max(s, u0 - offset)) / srcDur
          overlap = Math.max(overlap, o)
          if ((o > 0 || Math.abs(s + offset - u0) < 0.8) && Math.abs(si - j) <= REPLAY_GAP) soon = true
        }
        score -= (overlap > 0 ? 4 + overlap : 0) + (soon ? 4 : 0) + misplaced(c, s, srcDur)
        score += rng() * 0.12 * opts.variety
        if (!best || score > best.score) best = { clip: c, score, srcStart: s, speed }
      }
    }

    if (!best) {
      // Nothing fits (every clip is far too short): play the longest one from the top, slowed down.
      const longest = pool.reduce((a, b) => (b.clip.analysis.duration > a.clip.analysis.duration ? b : a))
      const sp = Math.max(0.25, Math.min(1, (longest.clip.analysis.duration - 0.05) / dur))
      best = { clip: longest, score: 0, srcStart: 0, speed: { kind: 'constant', speed: sp } }
    }
    take(si, best.clip, { clipId: best.clip.clip.id, srcStart: best.srcStart, speed: best.speed })
    if (walk) {
      const end = best.srcStart + sourceDuration(best.speed, dur)
      cursor = { order: best.clip.order, end, scene: sceneOf(best.clip.clip.analysis.cuts, best.srcStart) }
    }
  }
  return story ? result : inStoryOrder(result, slots, pool, fixed)
}

/**
 * Flow: footage is chosen most important slot first, so on its own a montage plays in a jumble
 * (the celebration, then the walkout, then the fight). Editors move forward through the story, so
 * each clip's chosen moments are dealt back out in the order they happen. The drop's hero shot and
 * the cold open keep their moments, and locked shots stay put. A clip whose moments can't be
 * refitted to their new slots (too short, or a cut in the way) keeps the order it had.
 */
export function inStoryOrder(
  result: (Assignment | null)[],
  slots: Slot[],
  pool: { clip: AssignableClip }[],
  fixed: Map<number, Assignment>,
): (Assignment | null)[] {
  const out = [...result]
  for (const { clip } of pool) {
    if (clip.kind === 'image') continue
    const a = clip.analysis
    const idx = out
      .map((_, i) => i)
      .filter((i) => out[i]?.clipId === clip.id && !fixed.has(i) && slots[i].role !== 'hero' && slots[i].role !== 'tease')
    if (idx.length < 2) continue
    const starts = idx.map((i) => out[i]!.srcStart).sort((x, y) => x - y)
    const crosses = (s: number, len: number) => a.cuts.some((x) => x > s + 0.04 && x < s + len - 0.04)
    const moved: [number, Assignment][] = []
    let ok = true
    let prevEnd = 0
    idx.forEach((i, k) => {
      if (!ok) return
      const need = sourceDuration(out[i]!.speed, slots[i].end - slots[i].start)
      // A moment that was used twice would now play twice in a row: carry on from the last one instead.
      let s = Math.min(Math.max(starts[k], prevEnd), a.duration - 0.04 - need)
      // Stay inside one scene: if a cut falls inside, slide to whichever side of it fits.
      const cut = a.cuts.find((x) => x > s + 0.04 && x < s + need - 0.04)
      if (cut !== undefined) s = cut - s < need / 2 && cut + 0.02 + need <= a.duration - 0.04 ? cut + 0.02 : cut - 0.02 - need
      if (s < 0 || crosses(s, need)) ok = false
      else {
        moved.push([i, { ...out[i]!, srcStart: Math.round(s * 1000) / 1000 }])
        prevEnd = s + need
      }
    })
    if (!ok) continue
    // Dealing moments out in order can put a repeat right next to the moment it repeats.
    const trial = [...out]
    for (const [i, x] of moved) trial[i] = x
    if (replaysOf(trial, slots, clip.id) <= replaysOf(out, slots, clip.id)) for (const [i, x] of moved) out[i] = x
  }
  return out
}

/** Pairs of shots from one clip, a few slots apart, that show some of the same seconds. */
function replaysOf(out: (Assignment | null)[], slots: Slot[], clipId: string): number {
  const range = (i: number) => {
    const a = out[i]!
    return [a.srcStart, a.srcStart + sourceDuration(a.speed, slots[i].end - slots[i].start)]
  }
  let n = 0
  for (let i = 0; i < out.length; i++) {
    if (out[i]?.clipId !== clipId) continue
    const [a0, a1] = range(i)
    for (let j = i + 1; j <= i + REPLAY_GAP && j < out.length; j++) {
      if (out[j]?.clipId !== clipId) continue
      const [b0, b1] = range(j)
      if (Math.min(a1, b1) - Math.max(a0, b0) > 0.05) n++
    }
  }
  return n
}
