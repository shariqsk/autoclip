// How the edit is split between your clips.

/** How long a still counts for when footage is shared out, in seconds. */
export const STILL = 3

export interface Shareable {
  /** Seconds of footage worth using. */
  duration: number
  /** The share you gave it, 0–100. Unset: it takes its part of whatever is left. */
  share?: number
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

/**
 * The fraction of the edit each clip gets, summing to one. Shares you set are kept as they are; what
 * they leave is split between the other clips by how much footage each has. A long clip counts for
 * more, but by its square root, so a ten-minute montage doesn't drown out a ten-second clip.
 *
 * With `needed` (the seconds of footage the edit takes), no clip is given more of the edit than it
 * has footage for: what it can't fill goes to the clips that can.
 */
export function footageShares(clips: Shareable[], needed?: number): number[] {
  const set = clips.map((c) => (c.share === undefined ? null : Math.max(0, c.share) / 100))
  const weight = clips.map((c, i) => (set[i] === null ? Math.sqrt(Math.max(0, c.duration)) : 0))
  const weights = sum(weight)
  const left = Math.max(0, 1 - sum(set.map((v) => v ?? 0)))
  let shares = clips.map((_, i) => set[i] ?? (weights ? (weight[i] / weights) * left : 0))
  const total = sum(shares)
  if (total <= 0) return clips.map(() => 1 / clips.length)
  shares = shares.map((v) => v / total)
  if (!needed) return shares

  const most = clips.map((c) => c.duration / needed)
  for (let pass = 0; pass < clips.length; pass++) {
    const spare = sum(shares.map((v, i) => Math.max(0, v - most[i])))
    const room = shares.map((v, i) => Math.max(0, most[i] - v))
    if (spare < 1e-6 || sum(room) < 1e-6) break
    const moved = Math.min(spare, sum(room))
    shares = shares.map((v, i) => Math.min(v, most[i]) + (room[i] / sum(room)) * moved)
  }
  // Too little footage for the edit altogether: split it by what there is.
  const fits = sum(shares.map((v, i) => Math.min(v, most[i])))
  return fits < 1 - 1e-6 ? shares.map((v, i) => Math.min(v, most[i]) / fits) : shares
}
