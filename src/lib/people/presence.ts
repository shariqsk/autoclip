// Where the cast is on screen, as series aligned with a clip's analysis samples: how strongly the
// stars (or the people to keep out) are in each moment, and where the stars' faces are, for framing.

import type { ClipAnalysis, ClipFaces } from '../types'

export interface Presence {
  /** 0–1 per analysis sample: a star on screen, more for a bigger face. */
  star: number[]
  /** 0–1 per analysis sample: someone you cut is on screen. */
  avoid: number[]
  /** 0–1 per analysis sample: someone else (not a star, not cut) is on screen, with no star. */
  others: number[]
  /** Where the biggest star face is (frame fraction), or null when none is. */
  focus: ({ x: number; y: number } | null)[]
}

const strength = (faceHeight: number) => Math.min(1, 0.45 + faceHeight * 3.5)

export function presence(a: ClipAnalysis, faces: ClipFaces | undefined, starIds: Set<string>, cutIds: Set<string>): Presence | null {
  if (!faces || (!starIds.size && !cutIds.size)) return null
  const reach = faces.step * 0.75 + 0.05
  const star: number[] = []
  const avoid: number[] = []
  const others: number[] = []
  const focus: Presence['focus'] = []
  let k = 0
  const list = [...faces.sightings].sort((x, y) => x.t - y.t)
  for (const t of a.times) {
    while (k < list.length && list[k].t < t - reach) k++
    let s = 0
    let v = 0
    let o = 0
    let at: { x: number; y: number; h: number } | null = null
    for (let j = k; j < list.length && list[j].t <= t + reach; j++) {
      const f = list[j]
      const h = f.box[3]
      // A face nobody was grouped with is a passer-by: someone else, just a little less certain.
      if (!f.personId) {
        o = Math.max(o, 0.7 * strength(h))
        continue
      }
      if (starIds.has(f.personId)) {
        s = Math.max(s, strength(h))
        if (!at || h > at.h) at = { x: f.box[0] + f.box[2] / 2, y: f.box[1] + f.box[3] / 2, h }
      }
      if (cutIds.has(f.personId)) v = Math.max(v, strength(h))
      else if (!starIds.has(f.personId)) o = Math.max(o, strength(h))
    }
    star.push(s)
    avoid.push(v)
    // Someone else sharing the frame with a star is fine (an opponent, a coach); alone, they're not.
    others.push(s > 0 ? 0 : o)
    focus.push(at ? { x: at.x, y: at.y } : null)
  }
  return { star, avoid, others, focus }
}

/** The analysis with framing pulled onto the stars' faces wherever they're on screen. */
export function framedOnStars(a: ClipAnalysis, p: Presence | null): ClipAnalysis {
  if (!p || !p.focus.some(Boolean)) return a
  const fx = a.focusX.map((x, i) => (p.focus[i] ? 0.25 * x + 0.75 * p.focus[i]!.x : x))
  const fy = a.focusY.map((y, i) => (p.focus[i] ? 0.25 * y + 0.75 * p.focus[i]!.y : y))
  // Glide between samples rather than snap.
  const glide = (xs: number[]) => xs.map((_, i) => (xs[Math.max(0, i - 1)] + 2 * xs[i] + xs[Math.min(xs.length - 1, i + 1)]) / 4)
  return { ...a, focusX: glide(fx), focusY: glide(fy) }
}
