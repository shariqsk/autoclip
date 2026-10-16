// Evaluate an edit plan at any instant: which shots are on screen, where in their clips, and what the
// effects are doing. The live preview and the exporter both render from this, so what you see is
// exactly what you get.

import type { EditPlan, Hit, Shot, TransitionType } from '../types'
import { sourceOffset } from './speed'

export interface Layer {
  shot: Shot
  /** Seconds into the source clip. */
  srcTime: number
  /** 0–1 through the shot (for slow pushes on stills and video). */
  progress: number
}

export interface FrameFx {
  /** Extra zoom from beat punches and slow push, 0 = none. */
  zoom: number
  shakeX: number
  shakeY: number
  rotate: number
  /** 0–1 white flash. */
  flash: number
  /** 0–1 chromatic aberration. */
  rgb: number
  /** 0–1 colour drained to black and white. */
  mono: number
  /** 0–1 darkening: strobes and the final fade. */
  dim: number
  /** 0–1: a light leak sweeping across on a new shot (drawn only when the look has leaks). */
  leak: number
}

export interface FrameState {
  a: Layer | null
  /** The incoming shot during a transition. */
  b: Layer | null
  transition: { type: TransitionType; progress: number } | null
  fx: FrameFx
}

const decay = (dt: number, tau: number) => (dt < 0 ? 0 : Math.exp(-dt / tau))

/** Find the shot playing at `t` (the last one that has started). */
export function shotIndexAt(shots: Shot[], t: number): number {
  let lo = 0
  let hi = shots.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (shots[mid].start <= t + 1e-6) {
      ans = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return ans
}

export function layerAt(shot: Shot, t: number, clipDuration = Infinity): Layer {
  const dur = shot.end - shot.start
  const u = t - shot.start
  const src = shot.srcStart + sourceOffset(shot.speed, u, dur)
  return {
    shot,
    srcTime: Math.max(0, Math.min(src, clipDuration - 0.04)),
    progress: dur > 0 ? Math.min(1, Math.max(0, u / dur)) : 0,
  }
}

/** Deterministic wobble so shakes look organic but render identically every time. */
function wobble(t: number, seed: number): number {
  return Math.sin(t * 61.3 + seed) * 0.6 + Math.sin(t * 97.1 + seed * 2.3) * 0.4
}

function hitsNear(hits: Hit[], t: number, window = 0.6): Hit[] {
  // Hits are sorted by time; a short linear scan around the binary-searched position is plenty.
  let lo = 0
  let hi = hits.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (hits[mid].time < t - window) lo = mid + 1
    else hi = mid
  }
  const out: Hit[] = []
  for (let i = lo; i < hits.length && hits[i].time <= t; i++) out.push(hits[i])
  return out
}

export function frameAt(plan: EditPlan, t: number, clipDurations: Record<string, number> = {}): FrameState {
  const { shots } = plan
  const none: FrameState = {
    a: null,
    b: null,
    transition: null,
    fx: { zoom: 0, shakeX: 0, shakeY: 0, rotate: 0, flash: 0, rgb: 0, mono: 0, dim: 0, leak: 0 },
  }
  if (!shots.length) return none
  const i = Math.max(0, shotIndexAt(shots, t))
  const cur = shots[i]
  const next = shots[i + 1]
  const dur = (s: Shot) => clipDurations[s.clipId] ?? Infinity

  let a: Layer = layerAt(cur, t, dur(cur))
  let b: Layer | null = null
  let transition: FrameState['transition'] = null

  // Transitions are centered on the cut: the outgoing shot runs a little past its end ("handle") and
  // the incoming one starts a little before its own.
  const inTrans = cur.transition.duration > 0 && t < cur.start + cur.transition.duration / 2 && i > 0
  const outTrans = next && next.transition.duration > 0 && t >= next.start - next.transition.duration / 2
  if (inTrans) {
    const prev = shots[i - 1]
    const d = cur.transition.duration
    a = layerAt(prev, t, dur(prev))
    b = layerAt(cur, t, dur(cur))
    transition = { type: cur.transition.type, progress: (t - (cur.start - d / 2)) / d }
  } else if (outTrans) {
    const d = next.transition.duration
    b = layerAt(next, t, dur(next))
    transition = { type: next.transition.type, progress: (t - (next.start - d / 2)) / d }
  }

  // The shot whose effects apply: whichever is dominant on screen.
  const active = transition && transition.progress >= 0.5 && b ? b.shot : a.shot
  const fx = active.fx
  let zoom = 0
  let shake = 0
  let rgb = 0
  for (const h of hitsNear(plan.hits, t)) {
    const dt = t - h.time
    const k = h.kind === 'drop' ? 1.8 : h.kind === 'downbeat' ? 1.15 : 0.8
    zoom += fx.pulse * h.strength * k * decay(dt, 0.11)
    if (h.strength > 0.55) {
      shake += fx.shake * h.strength * k * decay(dt, 0.09)
      rgb += fx.rgb * h.strength * k * decay(dt, 0.07)
    }
  }
  const sinceStart = t - active.start
  const flash = fx.flash * decay(sinceStart, 0.14)
  const progress = active === a.shot ? a.progress : (b?.progress ?? 0)
  zoom += fx.push * progress
  const seed = active.start * 13.7

  // Colour comes back across a transition, not in a jump.
  const monoA = a.shot.fx.mono ?? 0
  const monoB = b ? (b.shot.fx.mono ?? 0) : monoA
  const mono = transition ? monoA + (monoB - monoA) * Math.min(1, Math.max(0, transition.progress)) : (active.fx.mono ?? 0)

  // Tempo-locked flicker on eighth notes, and the fade to black at the very end.
  let dim = 0
  const strobe = active.fx.strobe ?? 0
  if (strobe > 0) {
    const eighth = 60 / Math.max(40, plan.bpm ?? 120) / 2
    if ((t / eighth) % 1 > 0.5) dim = 0.55 * strobe
  }
  const total = plan.songEnd - plan.songStart
  if (plan.fadeOut && t > total - plan.fadeOut) dim = Math.max(dim, (t - (total - plan.fadeOut)) / plan.fadeOut)
  return {
    a,
    b,
    transition,
    fx: {
      zoom,
      shakeX: shake * 0.035 * wobble(t, seed),
      shakeY: shake * 0.035 * wobble(t + 3.1, seed + 1.7),
      rotate: shake * 0.012 * wobble(t + 7.7, seed + 4.2),
      flash: Math.min(1, flash),
      rgb: Math.min(1, rgb),
      mono: Math.min(1, Math.max(0, mono)),
      dim: Math.min(1, dim),
      // Light washes over each new shot, a little before the cut lands.
      leak: i === 0 && !transition ? 0 : Math.max(decay(t - cur.start + 0.08, 0.45), next ? decay(next.start - t - 0.08, 0.12) * 0.5 : 0),
    },
  }
}

/** Total edit length in seconds. */
export function planDuration(plan: EditPlan): number {
  return plan.songEnd - plan.songStart
}
