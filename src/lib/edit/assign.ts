// Footage matching: decide which part of which clip fills each slot.
//
// The highest-stakes slots are filled first (the drop's hero shot gets the single best moment in
// all your footage), loud slots get high-motion moments and calm slots get steadier ones, moments
// are never reused while fresh ones remain, the same clip never plays twice in a row, and a shot
// never runs across a hard cut that's already inside a clip.

import { CONTENT_KINDS } from '../content/classify'
import type { ClipAnalysis, ClipKind, ContentKind, ContentMix, SpeedRamp } from '../types'
import type { Rng } from './rng'
import type { Slot, SlotRole } from './slots'
import { sourceDuration, sourceOffset } from './speed'

export interface AssignableClip {
  id: string
  kind: ClipKind
  analysis: ClipAnalysis
  pin?: 'hero' | 'skip'
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

export interface AssignOptions {
  /** 'best' puts the strongest moments where they hit hardest; 'story' keeps your clips in order. */
  order: 'best' | 'story'
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
  }
  used: [number, number][]
  uses: number
}

function prefixSum(xs: number[]): Float64Array {
  const p = new Float64Array(xs.length + 1)
  for (let i = 0; i < xs.length; i++) p[i + 1] = p[i] + xs[i]
  return p
}

function index(clips: AssignableClip[]): Indexed[] {
  return clips.map((clip, order) => {
    const a = clip.analysis
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
      },
      used: [],
      uses: 0,
    }
  })
}

function meanOver(p: Float64Array, dt: number, from: number, to: number): number {
  const n = p.length - 1
  const i0 = Math.max(0, Math.min(n - 1, Math.floor(from / dt)))
  const i1 = Math.max(i0 + 1, Math.min(n, Math.ceil(to / dt)))
  return (p[i1] - p[i0]) / (i1 - i0)
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
  clipId: string
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
  const pool = index(clips.filter((c) => c.pin !== 'skip'))
  // Once there's a star, footage nobody has looked for faces in is a weaker pick.
  const cast = pool.some((c) => c.prefix.star)
  // Likewise, once you've ruled shot types out, footage nobody has looked at is a weaker pick.
  const filtering = !!opts.mix && Object.values(opts.mix).includes('none') && pool.some((c) => c.prefix.content)
  const result: (Assignment | null)[] = slots.map(() => null)
  if (!pool.length) return result
  const totalFootage = pool.reduce((a, c) => a + (c.clip.kind === 'image' ? 3 : c.clip.analysis.duration), 0)
  const totalNeeded = slots.reduce((a, s, i) => a + sourceDuration(speeds[i], s.end - s.start), 0)
  // When there's less footage than music, reuse has to be allowed, just discouraged.
  const reusePenalty = totalFootage > totalNeeded * 1.3 ? 1.4 : 0.5

  for (const [i, fixed] of opts.fixed ?? []) {
    result[i] = fixed
    const c = pool.find((p) => p.clip.id === fixed.clipId)
    if (c) {
      c.used.push([fixed.srcStart, fixed.srcStart + sourceDuration(fixed.speed, slots[i].end - slots[i].start)])
      c.uses++
    }
  }

  const orderIdx = slots.map((_, i) => i).filter((i) => !result[i])
  orderIdx.sort((a, b) => PRIORITY[slots[b].role] + slots[b].energy - (PRIORITY[slots[a].role] + slots[a].energy))

  const sceneKey = (a: Assignment | null | undefined) => {
    if (!a) return null
    const c = pool.find((p) => p.clip.id === a.clipId)
    return c ? `${a.clipId}#${sceneOf(c.clip.analysis.cuts, a.srcStart)}` : a.clipId
  }

  for (const si of orderIdx) {
    const slot = slots[si]
    const dur = slot.end - slot.start
    const target = slot.hit ? 0.75 : TARGET_MOTION[slot.role]
    const neighbours = [result[si - 1], result[si + 1]]
    const neighbourClips = neighbours.map((n) => n?.clipId)
    const neighbourScenes = neighbours.map(sceneKey)
    const slotPos = slots.length > 1 ? si / (slots.length - 1) : 0
    // A shot cut on a hit wants something happening the moment it starts.
    const action = slot.role === 'hero' || slot.role === 'tease' || slot.role === 'flurry' || !!slot.hit
    const calm = (slot.role === 'intro' || slot.role === 'outro') && !slot.hit
    let best: Candidate | null = null

    for (const c of pool) {
      const a = c.clip.analysis
      let speed = speeds[si]
      let srcDur = sourceDuration(speed, dur)
      let base = 0
      if (neighbourClips.includes(c.clip.id)) base -= 0.15
      base -= (c.clip.kind === 'image' ? 0.18 : 0.06) * c.uses
      if (c.clip.pin === 'hero') base += slot.role === 'hero' ? 0.6 : 0.08
      if (opts.order === 'story' && pool.length > 1) base -= 0.9 * Math.abs(c.order / (pool.length - 1) - slotPos)

      if (c.clip.kind === 'image') {
        const score = base + 0.38 + (1 - Math.abs(0.15 - target)) * 0.25 + (calm ? 0.1 : -0.1) + rng() * 0.12 * opts.variety
        if (!best || score > best.score) best = { clipId: c.clip.id, score, srcStart: 0, speed: { kind: 'constant', speed: 1 } }
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
        // With a star, a shot of somebody else entirely is the wrong shot, however good it is.
        if (cast && c.prefix.others) score -= 1.3 * meanOver(c.prefix.others, c.dt, s, e)

        // Never the same scene twice in a row, and no near-repeats of moments already on screen.
        if (neighbourScenes.includes(`${c.clip.id}#${sceneOf(a.cuts, s)}`)) score -= 0.6
        let overlap = 0
        let near = false
        for (const [u0, u1] of c.used) {
          overlap = Math.max(overlap, Math.max(0, Math.min(e, u1) - Math.max(s, u0)) / srcDur)
          if (Math.abs(s - u0) < 0.8) near = true
        }
        score -= reusePenalty * overlap + (near ? 0.3 : 0)
        score += rng() * 0.12 * opts.variety
        if (!best || score > best.score) best = { clipId: c.clip.id, score, srcStart: s, speed }
      }
    }

    if (!best) {
      // Nothing fits (every clip is far too short): play the longest one from the top, slowed down.
      const longest = pool.reduce((a, b) => (b.clip.analysis.duration > a.clip.analysis.duration ? b : a))
      const sp = Math.max(0.25, Math.min(1, (longest.clip.analysis.duration - 0.05) / dur))
      best = { clipId: longest.clip.id, score: 0, srcStart: 0, speed: { kind: 'constant', speed: sp } }
    }
    result[si] = { clipId: best.clipId, srcStart: best.srcStart, speed: best.speed }
    const c = pool.find((p) => p.clip.id === best.clipId)!
    c.used.push([best.srcStart, best.srcStart + sourceDuration(best.speed, dur)])
    c.uses++
  }
  return inStoryOrder(result, slots, pool, opts.fixed ?? new Map())
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
    idx.forEach((i, k) => {
      if (!ok) return
      const need = sourceDuration(out[i]!.speed, slots[i].end - slots[i].start)
      let s = Math.min(starts[k], a.duration - 0.04 - need)
      // Stay inside one scene: if a cut falls inside, slide to whichever side of it fits.
      const cut = a.cuts.find((x) => x > s + 0.04 && x < s + need - 0.04)
      if (cut !== undefined) s = cut - s < need / 2 && cut + 0.02 + need <= a.duration - 0.04 ? cut + 0.02 : cut - 0.02 - need
      if (s < 0 || crosses(s, need)) ok = false
      else moved.push([i, { ...out[i]!, srcStart: Math.round(s * 1000) / 1000 }])
    })
    if (ok) for (const [i, x] of moved) out[i] = x
  }
  return out
}
