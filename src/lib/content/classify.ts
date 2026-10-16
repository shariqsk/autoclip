// Shot types, from CLIP: an image fingerprint is compared with fingerprints of short descriptions of
// each type (see scripts/content-prompts.json), and the closest type wins, with odds for the rest.
// Pure functions, shared by the worker and the tests.

import type { ClipAnalysis, ClipContent, ContentKind } from '../types'

export const CONTENT_KINDS: ContentKind[] = ['finish', 'action', 'broll', 'celebrate', 'talk', 'text']

export const CONTENT_NAMES: Record<ContentKind, { name: string; note: string }> = {
  finish: { name: 'Big moments', note: 'The peaks: the goal, the trick that lands, the finish' },
  action: { name: 'Action', note: 'The main thing in full flow: the game, the ride, the dance' },
  broll: { name: 'B-roll', note: 'Setting the scene: places, crowds, details, getting ready' },
  celebrate: { name: 'Celebration', note: 'Cheers, hugs, trophies, arms in the air' },
  talk: { name: 'Talking', note: 'Interviews, talking to camera, people chatting' },
  text: { name: 'Text & graphics', note: 'Title cards, logos, scoreboards' },
}

const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

/**
 * Odds for each shot type from a normalized image fingerprint. Each type scores the mean of its two
 * best-matching descriptions (one odd description can't swing it), and a softmax turns scores into
 * odds that sum to one.
 */
export function classify(image: ArrayLike<number>, prompts: Record<ContentKind, number[][]>, sharpness = 60): number[] {
  const scores = CONTENT_KINDS.map((k) => {
    const s = prompts[k].map((t) => dot(t, image)).sort((a, b) => b - a)
    return (s[0] + (s[1] ?? s[0])) / 2
  })
  const top = Math.max(...scores)
  const ex = scores.map((s) => Math.exp((s - top) * sharpness))
  const z = ex.reduce((a, b) => a + b, 0)
  return ex.map((x) => Math.round((x / z) * 1000) / 1000)
}

/**
 * One reading per scene: a shot doesn't change type halfway through, so the odds of every sample
 * between two cuts are averaged. Steadier than frame by frame, and a stray frame can't flip a shot.
 */
export function smoothByScene(content: ClipContent, cuts: number[]): ClipContent {
  const bounds = [-Infinity, ...cuts, Infinity]
  const probs = content.probs.map((p) => [...p])
  for (let b = 0; b < bounds.length - 1; b++) {
    const idx = content.times
      .map((t, i) => [t, i] as const)
      .filter(([t]) => t >= bounds[b] && t < bounds[b + 1])
      .map(([, i]) => i)
    if (idx.length < 2) continue
    const mean = CONTENT_KINDS.map((_, k) => idx.reduce((a, i) => a + content.probs[i][k], 0) / idx.length)
    for (const i of idx) probs[i] = mean.map((v) => Math.round(v * 1000) / 1000)
  }
  return { ...content, probs }
}

/** The odds of each shot type at every sample of a clip's analysis (nearest content sample). */
export function contentSeries(a: ClipAnalysis, content: ClipContent | undefined): Record<ContentKind, number[]> | null {
  if (!content || !content.times.length) return null
  const out = Object.fromEntries(CONTENT_KINDS.map((k) => [k, [] as number[]])) as Record<ContentKind, number[]>
  let j = 0
  for (const t of a.times) {
    while (j < content.times.length - 1 && Math.abs(content.times[j + 1] - t) <= Math.abs(content.times[j] - t)) j++
    CONTENT_KINDS.forEach((k, ki) => out[k].push(content.probs[j][ki]))
  }
  return out
}

/** Share of a clip's footage that is mostly each type (for showing what's in it). */
export function contentShares(content: ClipContent): Record<ContentKind, number> {
  const counts = Object.fromEntries(CONTENT_KINDS.map((k) => [k, 0])) as Record<ContentKind, number>
  for (const p of content.probs) counts[CONTENT_KINDS[p.indexOf(Math.max(...p))]]++
  const n = content.probs.length || 1
  return Object.fromEntries(CONTENT_KINDS.map((k) => [k, counts[k] / n])) as Record<ContentKind, number>
}
