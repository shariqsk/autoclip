// Small statistics helpers for reading edits.

export function median(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

/** Shot lengths an edit style speaks in: half a beat up to two bars. */
export const BEAT_STEPS = [0.5, 1, 2, 4, 8] as const

/** The nearest musical length (in beats), judged on a log scale so 1.4 beats rounds to 1, not 2. */
export function quantizeBeats(beats: number): number {
  let best: number = BEAT_STEPS[0]
  for (const s of BEAT_STEPS) if (Math.abs(Math.log2(beats / s)) < Math.abs(Math.log2(beats / best))) best = s
  return best
}
