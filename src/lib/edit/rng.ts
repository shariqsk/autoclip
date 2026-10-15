// Seeded randomness, so the same seed always cuts the same edit and "Remix" is reproducible.

export type Rng = () => number

/** mulberry32: tiny, fast and good enough for creative choices. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Pick a key with probability proportional to its weight. */
export function weightedPick<K extends string>(rng: Rng, weights: Partial<Record<K, number>>): K {
  const entries = Object.entries(weights) as [K, number][]
  const total = entries.reduce((a, [, w]) => a + Math.max(0, w), 0)
  let r = rng() * total
  for (const [k, w] of entries) {
    r -= Math.max(0, w)
    if (r <= 0) return k
  }
  return entries[entries.length - 1][0]
}

export function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 31)
}
