// The auto-editor: song analysis + clip analyses + a style → a complete edit plan.

import type { CaptionLine, ContentMix, EditPlan, Hit, Shot, ShotFx, SongAnalysis, SpeedRamp, Transition, TransitionType } from '../types'
import { assignFootage, type AssignableClip, type Assignment } from './assign'
import { getStyle, type StyleId, type StylePreset } from './presets'
import { createRng, weightedPick, type Rng } from './rng'
import { buildHits, buildSlots, type Slot } from './slots'
import { chooseWindow, type LengthChoice, type SongWindow } from './window'

export interface PlanOptions {
  style: StyleId
  length: LengthChoice
  order: 'best' | 'story'
  /** 0–1: how adventurous a remix is. */
  variety: number
  seed: number
  /** Force a song range instead of choosing one. */
  window?: SongWindow
  /** Shots from the previous version that the user locked. */
  locked?: Shot[]
  captions?: CaptionLine[]
  /** Cut on standout hits in the music, not only on the beat grid. Defaults to on. */
  hitCuts?: boolean
  /** How much of each shot type to use (when the footage has been read for them). */
  mix?: ContentMix
}

const FX_SCALE: Record<Slot['role'], number> = { tease: 1, intro: 0.35, build: 0.8, hero: 1, flurry: 1, ride: 0.6, outro: 0.3 }

function speedFor(slot: Slot, style: StylePreset, beatPeriod: number): SpeedRamp {
  const beats = (slot.end - slot.start) / beatPeriod
  switch (slot.role) {
    case 'hero':
      return style.hero.speed
    case 'intro':
      return { kind: 'constant', speed: style.intro.speed }
    case 'outro':
      return { kind: 'constant', speed: style.outro.speed }
    case 'flurry':
      if (style.velocity && beats >= 1.9) return { kind: 'velocity', fast: 1.6, slow: 0.35 }
      return { kind: 'constant', speed: 1 }
    default:
      return { kind: 'constant', speed: 1 }
  }
}

function transitionFor(slots: Slot[], i: number, style: StylePreset, beatPeriod: number, rng: Rng): Transition {
  if (i === 0) return { type: 'cut', duration: 0 }
  const slot = slots[i]
  let weights: Partial<Record<TransitionType, number>>
  switch (slot.role) {
    case 'hero':
      weights = style.hero.transition
      break
    case 'intro':
    case 'outro':
      weights = style.intro.transition
      break
    case 'flurry':
      weights = style.flurry.transition
      break
    case 'ride':
      weights = style.ride.transition
      break
    default:
      // Builds and the cold open are hard cuts: the acceleration is the effect.
      weights = { cut: 1 }
  }
  const type: TransitionType = weightedPick(rng, weights)
  if (type === 'cut') return { type, duration: 0 }
  const shortest = Math.min(slot.end - slot.start, slots[i - 1].end - slots[i - 1].start)
  const duration = Math.max(0.08, Math.min(style.transitionBeats * beatPeriod, shortest * 0.45))
  return { type, duration }
}

function fxFor(slot: Slot, style: StylePreset): ShotFx {
  const k = FX_SCALE[slot.role]
  const loud = slot.role === 'hero' || slot.role === 'flurry' || slot.role === 'build' || slot.role === 'tease'
  return {
    pulse: style.fx.pulse * k,
    shake: loud ? style.fx.shake * k : 0,
    rgb: slot.role === 'hero' || slot.role === 'flurry' || slot.role === 'tease' ? style.fx.rgb * k : 0,
    flash: slot.dropStart ? style.fx.flash : slot.role === 'tease' ? style.fx.flash * 0.6 : slot.hit ? style.fx.flash * 0.25 : 0,
    push: style.fx.push * (loud ? 0.5 : 1),
    // Black and white until the drop brings the colour back.
    mono: slot.role === 'intro' || slot.role === 'build' || slot.role === 'tease' ? style.intro.mono : 0,
    strobe: slot.role === 'build' ? style.build.strobe * (0.3 + 0.7 * (slot.buildProgress ?? 0)) : 0,
  }
}

let shotCounter = 0
const shotId = () => `s${Date.now().toString(36)}${(shotCounter++).toString(36)}`

export function makePlan(song: SongAnalysis, clips: AssignableClip[], opts: PlanOptions): EditPlan {
  const style = getStyle(opts.style)
  const rng = createRng(opts.seed)
  const window = opts.window ?? chooseWindow(song, opts.length)
  const beatPeriod = 60 / Math.max(40, song.bpm)

  const slots = buildSlots(song, window, style, rng, { hitCuts: opts.hitCuts })
  const speeds = slots.map((s) => speedFor(s, style, beatPeriod))

  // Locked shots keep their footage if their slot still exists.
  const fixed = new Map<number, Assignment>()
  for (const shot of opts.locked ?? []) {
    const i = slots.findIndex((s) => Math.abs(s.start - shot.start) < 0.03)
    if (i >= 0 && clips.some((c) => c.id === shot.clipId)) {
      fixed.set(i, { clipId: shot.clipId, srcStart: shot.srcStart, speed: shot.speed })
      speeds[i] = shot.speed
    }
  }

  const assignments = assignFootage(slots, speeds, clips, rng, { order: opts.order, variety: opts.variety, fixed, mix: opts.mix })
  const lockedByIndex = new Map([...fixed.keys()].map((i) => [i, opts.locked!.find((l) => Math.abs(l.start - slots[i].start) < 0.03)!]))

  const shots: Shot[] = []
  slots.forEach((slot, i) => {
    const a = assignments[i]
    if (!a) return
    const kept = lockedByIndex.get(i)
    shots.push({
      id: kept?.id ?? shotId(),
      clipId: a.clipId,
      start: slot.start,
      end: slot.end,
      srcStart: a.srcStart,
      speed: a.speed,
      transition: kept?.transition ?? transitionFor(slots, i, style, beatPeriod, rng),
      fx: kept?.fx ?? fxFor(slot, style),
      reason: slot.reason,
      locked: !!kept,
      energy: slot.energy,
      phase: slot.role,
    })
  })

  // A transition into more of the same footage looks like a glitch, not a change of shot: cut instead.
  const sourceOf = new Map(clips.map((c) => [c.id, c.source ?? c.id]))
  for (let i = 1; i < shots.length; i++) {
    if (!shots[i].locked && sourceOf.get(shots[i].clipId) === sourceOf.get(shots[i - 1].clipId)) {
      shots[i].transition = { type: 'cut', duration: 0 }
    }
  }

  return {
    songStart: window.start,
    songEnd: window.end,
    shots,
    hits: markHeroHits(addHitPunches(buildHits(song, window), slots), slots),
    bpm: song.bpm,
    fadeOut: style.outro.fade,
    captions: opts.captions ?? [],
    seed: opts.seed,
  }
}

/** Each cut on a hit gets its own punch, even off the beat grid. */
function addHitPunches(hits: Hit[], slots: Slot[]): Hit[] {
  for (const s of slots)
    if (s.hit && !hits.some((h) => Math.abs(h.time - s.start) < 0.05)) hits.push({ time: s.start, strength: 0.8, kind: 'beat' })
  return hits.sort((a, b) => a.time - b.time)
}

/** Every hero slot is a drop, even when the song analysis didn't flag one there: punch it like one. */
function markHeroHits(hits: Hit[], slots: Slot[]): Hit[] {
  for (const s of slots.filter((x) => x.role === 'hero')) {
    const h = hits.find((x) => Math.abs(x.time - s.start) < 0.05)
    if (h) {
      h.kind = 'drop'
      h.strength = 1
    } else hits.push({ time: s.start, strength: 1, kind: 'drop' })
  }
  return hits.sort((a, b) => a.time - b.time)
}

export { type SongWindow }
