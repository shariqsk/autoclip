// Hand edits for director mode. Each takes a plan and returns a new one (plans are immutable, which
// is what makes undo trivial).

import type { ClipAnalysis, EditPlan, Shot, SpeedRamp } from '../types'
import { sourceDuration, sourceOffset } from './speed'

const MIN_SHOT = 0.12

let counter = 0
const newId = () => `s${Date.now().toString(36)}h${(counter++).toString(36)}`

function replaceShot(plan: EditPlan, id: string, fn: (s: Shot) => Shot): EditPlan {
  return { ...plan, shots: plan.shots.map((s) => (s.id === id ? fn(s) : s)) }
}

export function updateShot(plan: EditPlan, id: string, patch: Partial<Shot>): EditPlan {
  return replaceShot(plan, id, (s) => ({ ...s, ...patch }))
}

/**
 * Roll the cut at the start of shot `index` to time `t`: the shot before gets longer or shorter,
 * and this shot's in-point moves with the cut so what's on screen after it doesn't jump.
 */
export function rollCut(plan: EditPlan, index: number, t: number): EditPlan {
  if (index <= 0 || index >= plan.shots.length) return plan
  const prev = plan.shots[index - 1]
  const cur = plan.shots[index]
  const clamped = Math.max(prev.start + MIN_SHOT, Math.min(cur.end - MIN_SHOT, t))
  if (Math.abs(clamped - cur.start) < 1e-4) return plan
  const delta = clamped - cur.start
  const speed = cur.speed.kind === 'constant' ? cur.speed.speed : 1
  const shots = [...plan.shots]
  shots[index - 1] = { ...prev, end: clamped }
  shots[index] = { ...cur, start: clamped, srcStart: Math.max(0, cur.srcStart + delta * speed) }
  return { ...plan, shots }
}

/** Split a shot in two at time `t`; the second half continues from the same source moment. */
export function splitShot(plan: EditPlan, id: string, t: number): EditPlan {
  const i = plan.shots.findIndex((s) => s.id === id)
  if (i < 0) return plan
  const s = plan.shots[i]
  if (t - s.start < MIN_SHOT || s.end - t < MIN_SHOT) return plan
  const flat: SpeedRamp = s.speed.kind === 'constant' ? s.speed : { kind: 'constant', speed: 1 }
  const srcAtT = s.srcStart + sourceOffset(flat, t - s.start, s.end - s.start)
  const first: Shot = { ...s, end: t, speed: flat }
  const second: Shot = {
    ...s,
    id: newId(),
    start: t,
    srcStart: srcAtT,
    speed: flat,
    transition: { type: 'cut', duration: 0 },
    fx: { ...s.fx, flash: 0 },
    reason: 'Split by hand',
    locked: false,
  }
  const shots = [...plan.shots]
  shots.splice(i, 1, first, second)
  return { ...plan, shots }
}

/** Remove a shot; the one before it (or after, for the first shot) grows to fill the gap. */
export function removeShot(plan: EditPlan, id: string): EditPlan {
  const i = plan.shots.findIndex((s) => s.id === id)
  if (i < 0 || plan.shots.length < 2) return plan
  const shots = [...plan.shots]
  const gone = shots[i]
  if (i > 0) shots[i - 1] = { ...shots[i - 1], end: gone.end }
  else shots[1] = { ...shots[1], start: 0, srcStart: Math.max(0, shots[1].srcStart - (shots[1].start - gone.start)) }
  shots.splice(i, 1)
  return { ...plan, shots }
}

export interface MomentClip {
  id: string
  kind: 'video' | 'image'
  analysis: ClipAnalysis
}

/** The best in-point for a shot of this length in a clip, avoiding moments already on screen. */
export function bestMoment(clip: MomentClip, srcDur: number, used: [number, number][], after = -1): number {
  const a = clip.analysis
  if (clip.kind === 'image' || a.times.length < 2) return 0
  const dt = a.times[1] - a.times[0]
  let best = { score: -Infinity, s: 0 }
  for (let s = 0; s + srcDur <= a.duration - 0.04; s += Math.max(0.1, dt / 2)) {
    if (a.cuts.some((c) => c > s + 0.04 && c < s + srcDur - 0.04)) continue
    const i0 = Math.floor(s / dt)
    const i1 = Math.max(i0 + 1, Math.ceil((s + srcDur) / dt))
    let sum = 0
    for (let i = i0; i < Math.min(a.interest.length, i1); i++) sum += a.interest[i]
    let score = sum / (i1 - i0)
    for (const [u0, u1] of used) score -= 1.2 * (Math.max(0, Math.min(s + srcDur, u1) - Math.max(s, u0)) / srcDur)
    // "Next best": skip the current pick and anything that scores better than it.
    if (after >= 0 && Math.abs(s - after) < srcDur * 0.6) score -= 2
    if (score > best.score) best = { score, s }
  }
  return best.s
}

function usedWindows(plan: EditPlan, clipId: string, except: string): [number, number][] {
  return plan.shots
    .filter((s) => s.clipId === clipId && s.id !== except)
    .map((s) => [s.srcStart, s.srcStart + sourceDuration(s.speed, s.end - s.start)])
}

/** Swap a shot to another clip, at that clip's best unused moment for this length. */
export function swapClip(plan: EditPlan, id: string, clip: MomentClip): EditPlan {
  const s = plan.shots.find((x) => x.id === id)
  if (!s) return plan
  let speed = s.speed
  let srcDur = sourceDuration(speed, s.end - s.start)
  if (clip.kind === 'video' && srcDur > clip.analysis.duration - 0.05) {
    speed = { kind: 'constant', speed: Math.max(0.25, (clip.analysis.duration - 0.05) / (s.end - s.start)) }
    srcDur = sourceDuration(speed, s.end - s.start)
  }
  const srcStart = bestMoment(clip, srcDur, usedWindows(plan, clip.id, id))
  return updateShot(plan, id, { clipId: clip.id, srcStart, speed, reason: 'Clip picked by hand' })
}

/** Try the next-best moment in the same clip. */
export function repick(plan: EditPlan, id: string, clip: MomentClip): EditPlan {
  const s = plan.shots.find((x) => x.id === id)
  if (!s) return plan
  const srcDur = sourceDuration(s.speed, s.end - s.start)
  const srcStart = bestMoment(clip, srcDur, usedWindows(plan, clip.id, id), s.srcStart)
  return updateShot(plan, id, { srcStart, reason: 'Moment re-picked' })
}

/** Snap a time to the nearest beat (or half-beat) if it's close, in edit time. */
export function snapToBeat(t: number, beats: number[], halfBeats = true, tolerance = 0.12): number {
  let best = t
  let bestD = tolerance
  for (let i = 0; i < beats.length; i++) {
    const cands = [beats[i]]
    if (halfBeats && i + 1 < beats.length) cands.push((beats[i] + beats[i + 1]) / 2)
    for (const c of cands) {
      const d = Math.abs(c - t)
      if (d < bestD) {
        bestD = d
        best = c
      }
    }
  }
  return best
}
