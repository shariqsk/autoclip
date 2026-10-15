// Which part of the song to use. A 30-second edit shouldn't be the first 30 seconds: it should open
// a few bars before the biggest drop, so the build gets room to breathe and the drop lands early
// enough to carry the rest, and it should start and end on bar lines.

import type { SongAnalysis } from '../types'

export type LengthChoice = number | 'full'

export interface SongWindow {
  start: number
  end: number
}

export function chooseWindow(song: SongAnalysis, length: LengthChoice): SongWindow {
  if (length === 'full' || song.duration <= (length as number) + 1) return { start: 0, end: song.duration }
  const target = length
  const downbeats = song.beats.filter((b) => b.kind === 'downbeat').map((b) => b.time)
  if (downbeats.length < 2) return { start: 0, end: Math.min(song.duration, target) }

  const sectionStarts = song.sections.map((s) => s.start)
  const nearSectionStart = (t: number) => sectionStarts.some((s) => Math.abs(s - t) < 0.25)
  const energyAt = (t: number) => song.envelope[Math.min(song.envelope.length - 1, Math.floor(t / song.envelopeRate))] ?? 0

  let best: SongWindow & { score: number } = { start: 0, end: target, score: -Infinity }
  for (const start of downbeats) {
    // The downbeat closest to the target length (edits end on a bar line, not mid-bar).
    const endCandidates = downbeats.filter((d) => d > start + target * 0.85 && d < start + target * 1.15)
    const end = endCandidates.length
      ? endCandidates.reduce((a, b) => (Math.abs(b - start - target) < Math.abs(a - start - target) ? b : a))
      : Math.min(song.duration, start + target)
    if (end > song.duration + 0.01) continue
    const len = end - start

    // Average energy, sampled cheaply.
    let energy = 0
    const samples = 24
    for (let i = 0; i < samples; i++) energy += energyAt(start + (len * (i + 0.5)) / samples)
    energy /= samples

    // Reward a drop that lands 20–45% of the way in: build first, payoff, then ride it out.
    let dropScore = 0
    for (const d of song.drops) {
      if (d.time <= start || d.time >= end) continue
      const pos = (d.time - start) / len
      const placement = pos >= 0.2 && pos <= 0.45 ? 1 : pos < 0.2 ? pos / 0.2 : Math.max(0, 1 - (pos - 0.45) / 0.45)
      dropScore = Math.max(dropScore, d.strength * placement)
    }

    const score =
      0.9 * energy +
      1.4 * dropScore +
      (nearSectionStart(start) ? 0.15 : 0) +
      (nearSectionStart(end) || Math.abs(end - song.duration) < 0.5 ? 0.1 : 0) -
      // A slight preference for earlier windows when everything else ties.
      0.02 * (start / song.duration)
    if (score > best.score) best = { start, end, score }
  }
  return { start: best.start, end: best.end }
}
