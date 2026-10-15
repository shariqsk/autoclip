// Slots: the empty shots of the edit, before any footage is chosen. This is where the music decides
// the rhythm: every boundary sits on a beat, quiet parts hold longer, drops cut on every beat, builds
// accelerate into the drop, and the first shot of each drop is held as the hero moment.

import type { Hit, SectionLabel, SongAnalysis } from '../types'
import type { StylePreset } from './presets'
import type { Rng } from './rng'
import type { SongWindow } from './window'

export type SlotRole = 'hero' | 'build' | 'drop' | 'normal' | 'calm' | 'intro'

export interface Slot {
  /** Seconds from the edit's start. */
  start: number
  end: number
  /** Loudness under the slot, 0–1. */
  energy: number
  section: SectionLabel
  role: SlotRole
  /** First slot of a section: a good place for a bigger transition. */
  sectionStart: boolean
  /** First slot of a drop. */
  dropStart: boolean
  /** Human-readable "why this cut is here". */
  reason: string
}

type Level = 'low' | 'mid' | 'high'

function levelOf(label: SectionLabel, energy: number): Level {
  if (label === 'drop' || energy >= 0.75) return 'high'
  if (label === 'intro' || label === 'outro' || label === 'break' || energy < 0.45) return 'low'
  return 'mid'
}

export function buildSlots(song: SongAnalysis, window: SongWindow, style: StylePreset, rng: Rng): Slot[] {
  const { start: w0, end: w1 } = window
  const beats = song.beats.filter((b) => b.time >= w0 - 0.01 && b.time < w1 - 0.05)
  // Every possible cut point, in song time: the edit edges plus every beat inside.
  const beatTimes = beats.map((b) => b.time)
  if (!beatTimes.length || beatTimes[0] > w0 + 0.05) beatTimes.unshift(w0)
  const beatPeriod = 60 / Math.max(40, song.bpm)

  const sectionAt = (t: number) => song.sections.find((s) => t >= s.start - 0.01 && t < s.end) ?? song.sections.at(-1)!
  const dropTimes = song.drops.map((d) => d.time).filter((t) => t > w0 + 0.1 && t < w1 - 0.1)
  const isDownbeat = (t: number) => beats.some((b) => b.kind === 'downbeat' && Math.abs(b.time - t) < 0.02)
  const energyBetween = (a: number, b: number) => {
    const i0 = Math.floor(a / song.envelopeRate)
    const i1 = Math.max(i0 + 1, Math.floor(b / song.envelopeRate))
    let s = 0
    for (let i = i0; i < i1; i++) s += song.envelope[i] ?? 0
    return s / (i1 - i0)
  }

  // Boundaries in song time, built section by section.
  const cuts = new Set<number>([w0])
  const sections = song.sections.filter((s) => s.end > w0 && s.start < w1)
  for (const sec of sections) {
    const s0 = Math.max(w0, sec.start)
    const s1 = Math.min(w1, sec.end)
    const inSec = beatTimes.filter((t) => t >= s0 - 0.01 && t < s1 - 0.01)
    if (!inSec.length) continue
    cuts.add(inSec[0])
    const level = levelOf(sec.label, sec.energy)
    const step = style.pacing[level]

    // Long holds start on bar lines so the cuts feel phrased, not just counted.
    let i = 0
    if (step >= 4) {
      const firstDown = inSec.findIndex(isDownbeat)
      if (firstDown > 0) {
        cuts.add(inSec[firstDown])
        i = firstDown
      }
    }
    for (; i < inSec.length; i += step) {
      cuts.add(inSec[i])
      // Accents: in loud parts, a strong beat sometimes gets an extra cut halfway through its shot
      // (on the next beat for two-beat shots, on the off-beat for one-beat shots).
      if (level === 'high' && style.doubleTime > 0 && step <= 2 && i + 1 < inSec.length) {
        const beat = beats.find((b) => Math.abs(b.time - inSec[i]) < 0.02)
        if (beat && beat.strength > 0.6 && rng() < style.doubleTime) cuts.add(step === 2 ? inSec[i + 1] : (inSec[i] + inSec[i + 1]) / 2)
      }
    }
  }

  // Build roll: in the two bars before a drop, cut every two beats, then every beat, then every half beat.
  const rollZones: [number, number][] = []
  if (style.buildRoll) {
    for (const drop of dropTimes) {
      const rollStart = Math.max(w0, drop - beatPeriod * 8)
      rollZones.push([rollStart, drop])
      for (const t of [...cuts]) if (t > rollStart + 0.01 && t < drop - 0.01) cuts.delete(t)
      for (let k = 8; k >= 1; k--) {
        const t = drop - k * beatPeriod
        if (t < rollStart - 0.01) continue
        if (k > 4 && k % 2 === 1) continue // every two beats in the first bar
        cuts.add(t)
        if (k <= 2) cuts.add(t + beatPeriod / 2) // half beats on the final two
      }
    }
  }

  // The drop's hero shot: no cuts for `heroBeats` after the drop.
  for (const drop of dropTimes) {
    cuts.add(drop)
    const heroEnd = drop + style.heroBeats * beatPeriod
    for (const t of [...cuts]) if (t > drop + 0.01 && t < heroEnd - 0.01) cuts.delete(t)
    if (heroEnd < w1 - 0.05) cuts.add(heroEnd)
  }

  const sorted = [...cuts].filter((t) => t >= w0 - 0.01 && t < w1 - 0.05).sort((a, b) => a - b)
  // Never leave a sliver: merge anything shorter than a third of a beat into its neighbour.
  const merged: number[] = []
  for (const t of sorted) if (!merged.length || t - merged[merged.length - 1] >= beatPeriod * 0.34) merged.push(t)
  if (merged.length > 1 && w1 - merged[merged.length - 1] < beatPeriod * 0.5) merged.pop()

  return merged.map((t, i) => {
    const end = merged[i + 1] ?? w1
    const sec = sectionAt(t + 0.01)
    const level = levelOf(sec.label, sec.energy)
    const dropStart = dropTimes.some((d) => Math.abs(d - t) < 0.02)
    const inRoll = rollZones.some(([a, b]) => t >= a - 0.01 && t < b - 0.01)
    const sectionStart = i === 0 || song.sections.some((s) => Math.abs(s.start - t) < 0.05)
    let role: SlotRole
    let reason: string
    const beats = Math.round(((end - t) / beatPeriod) * 2) / 2
    const beatsLabel = beats === 1 ? '1 beat' : `${beats} beats`
    if (dropStart) {
      role = 'hero'
      reason = `Drop lands here, so the best moment in your footage goes on it (${beatsLabel})`
    } else if (inRoll) {
      role = 'build'
      reason = 'Build-up: cuts speed up into the drop'
    } else if (i === 0) {
      role = 'intro'
      reason = `Opening shot, held for ${beatsLabel}`
    } else if (level === 'high') {
      role = 'drop'
      reason = end - t < beatPeriod * 0.9 ? 'Extra cut on a strong accent' : `Loud part: a cut every ${beatsLabel}`
    } else if (level === 'low') {
      role = 'calm'
      reason = `Quiet part: shot held for ${beatsLabel}`
    } else {
      role = 'normal'
      reason = `Cut on the beat, ${beatsLabel}`
    }
    return {
      start: t - w0,
      end: end - w0,
      energy: energyBetween(t, end),
      section: sec.label,
      role,
      sectionStart,
      dropStart,
      reason,
    }
  })
}

/** Accents inside the edit that drive zoom punches and shakes. */
export function buildHits(song: SongAnalysis, window: SongWindow): Hit[] {
  const hits: Hit[] = song.beats
    .filter((b) => b.time >= window.start && b.time < window.end)
    .map((b) => ({
      time: b.time - window.start,
      strength: Math.min(1, 0.35 + 0.65 * b.strength) * (0.4 + 0.6 * b.energy),
      kind: b.kind === 'downbeat' ? 'downbeat' : 'beat',
    }))
  for (const d of song.drops) {
    if (d.time < window.start || d.time >= window.end) continue
    const t = d.time - window.start
    const existing = hits.find((h) => Math.abs(h.time - t) < 0.03)
    if (existing) {
      existing.kind = 'drop'
      existing.strength = 1
    } else hits.push({ time: t, strength: 1, kind: 'drop' })
  }
  return hits.sort((a, b) => a.time - b.time)
}
