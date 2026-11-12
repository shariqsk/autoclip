// How the edit is split between your clips.

/** How long a still counts for when footage is shared out, in seconds. */
export const STILL = 3

export interface Shareable {
  /** Seconds of footage worth using. */
  duration: number
  /** The share you gave it, 0–100. Unset: it takes its part of whatever is left. */
  share?: number
}

/**
 * The fraction of the edit each clip gets, summing to one. Shares you set are kept as they are; what
 * they leave is split between the other clips by how much footage each has. A long clip counts for
 * more, but by its square root, so a ten-minute montage doesn't drown out a ten-second clip.
 */
export function footageShares(clips: Shareable[]): number[] {
  const set = clips.map((c) => (c.share === undefined ? null : Math.max(0, c.share) / 100))
  const weight = clips.map((c, i) => (set[i] === null ? Math.sqrt(Math.max(0, c.duration)) : 0))
  const weights = weight.reduce((a, b) => a + b, 0)
  const left = Math.max(0, 1 - set.reduce<number>((a, b) => a + (b ?? 0), 0))
  const raw = clips.map((_, i) => set[i] ?? (weights ? (weight[i] / weights) * left : 0))
  const total = raw.reduce((a, b) => a + b, 0)
  return total > 0 ? raw.map((v) => v / total) : clips.map(() => 1 / clips.length)
}
