// The auto-editor: song analysis + clip analyses + a style → a complete edit plan.

import type { CaptionLine, EditPlan, Shot, ShotFx, SongAnalysis, SpeedRamp, Transition, TransitionType } from '../types'
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
}

const FX_SCALE: Record<Slot['role'], number> = { hero: 1, drop: 1, build: 0.85, normal: 0.6, intro: 0.45, calm: 0.3 }

function speedFor(slot: Slot, style: StylePreset, beatPeriod: number): SpeedRamp {
  const beats = (slot.end - slot.start) / beatPeriod
  if (slot.role === 'hero') return style.heroSpeed
  if (style.velocity && slot.role === 'drop' && beats >= 1.9) return { kind: 'velocity', fast: 1.6, slow: 0.35 }
  if (slot.role === 'calm' || slot.role === 'intro') return { kind: 'constant', speed: style.calmSpeed }
  return { kind: 'constant', speed: 1 }
}

function transitionFor(slots: Slot[], i: number, style: StylePreset, beatPeriod: number, rng: Rng): Transition {
  if (i === 0) return { type: 'cut', duration: 0 }
  const slot = slots[i]
  const weights = slot.dropStart ? style.transitions.drop : slot.sectionStart ? style.transitions.section : style.transitions.within
  // Builds stay as hard cuts; the acceleration is the effect.
  const type: TransitionType = slot.role === 'build' ? 'cut' : weightedPick(rng, weights)
  if (type === 'cut') return { type, duration: 0 }
  const shortest = Math.min(slot.end - slot.start, slots[i - 1].end - slots[i - 1].start)
  const duration = Math.max(0.08, Math.min(style.transitionBeats * beatPeriod, shortest * 0.45))
  return { type, duration }
}

function fxFor(slot: Slot, style: StylePreset): ShotFx {
  const k = FX_SCALE[slot.role]
  const loud = slot.role === 'hero' || slot.role === 'drop' || slot.role === 'build'
  return {
    pulse: style.fx.pulse * k,
    shake: loud ? style.fx.shake * k : 0,
    rgb: slot.role === 'hero' || slot.role === 'drop' ? style.fx.rgb * k : 0,
    flash: slot.dropStart ? style.fx.flash : 0,
    push: style.fx.push * (loud ? 0.5 : 1),
  }
}

let shotCounter = 0
const shotId = () => `s${Date.now().toString(36)}${(shotCounter++).toString(36)}`

export function makePlan(song: SongAnalysis, clips: AssignableClip[], opts: PlanOptions): EditPlan {
  const style = getStyle(opts.style)
  const rng = createRng(opts.seed)
  const window = opts.window ?? chooseWindow(song, opts.length)
  const beatPeriod = 60 / Math.max(40, song.bpm)

  const slots = buildSlots(song, window, style, rng)
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

  const assignments = assignFootage(slots, speeds, clips, rng, { order: opts.order, variety: opts.variety, fixed })
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
    })
  })

  return {
    songStart: window.start,
    songEnd: window.end,
    shots,
    hits: buildHits(song, window),
    captions: opts.captions ?? [],
    seed: opts.seed,
  }
}

export { type SongWindow }
