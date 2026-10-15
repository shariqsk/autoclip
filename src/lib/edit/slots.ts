// Slots: the empty shots of the edit, before any footage is chosen.
//
// An edit is planned as an arc, the way people cut fight and sports edits by hand:
//
//   tease   a split-second flash of the action to stop the scroll (some styles)
//   intro   long holds, often slowed and in black and white, to meet the subject
//   build   the bars before the drop, cutting faster and faster, flickering with tension
//   hero    the drop itself: the single best moment in the footage, held, often frozen
//   flurry  the action after the drop, cut on the strongest beats, not on a fixed grid
//   ride    steadier cutting between drops
//   outro   one last held shot, slowed, fading out
//
// Every boundary sits on a beat (half-beats only in the last moments of a build).

import type { Hit, ShotPhase, SongAnalysis } from '../types'
import type { StylePreset } from './presets'
import type { Rng } from './rng'
import type { SongWindow } from './window'

export type SlotRole = ShotPhase

export interface Slot {
  /** Seconds from the edit's start. */
  start: number
  end: number
  /** Loudness under the slot, 0–1. */
  energy: number
  role: SlotRole
  /** First slot of a phase: a good place for a bigger transition. */
  sectionStart: boolean
  /** First slot of a drop. */
  dropStart: boolean
  /** Seconds after `start` where the strongest beat inside the slot lands: the action should hit here. */
  accent: number
  /** 0–1 position inside the build (for ramping effects). */
  buildProgress?: number
  /** This shot starts on a hit in the music (a strum, a stab, a fill), not just a beat. */
  hit?: boolean
  /** Human-readable "why this cut is here". */
  reason: string
}

interface Region {
  start: number
  end: number
  phase: SlotRole
}

const MAX_ANCHORS = 3

export interface SlotOptions {
  /** Cut on standout hits in the music (strums, stabs, fills), not only on the beat grid. */
  hitCuts?: boolean
}

export function buildSlots(song: SongAnalysis, window: SongWindow, style: StylePreset, rng: Rng, opts: SlotOptions = {}): Slot[] {
  const { start: w0, end: w1 } = window
  const W = w1 - w0
  const bp = 60 / Math.max(40, song.bpm)
  const bar = bp * 4

  const beats = song.beats.filter((b) => b.time >= w0 - 0.02 && b.time < w1 - 0.05).map((b) => ({ ...b, t: Math.max(0, b.time - w0) }))
  const beatT = beats.map((b) => b.t)
  if (!beatT.length || beatT[0] > 0.05) beatT.unshift(0)
  const downT = beats.filter((b) => b.kind === 'downbeat').map((b) => b.t)

  const useHits = opts.hitCuts !== false
  const hitsIn = useHits
    ? (song.hits ?? []).filter((h) => h.time >= w0 && h.time < w1).map((h) => ({ t: h.time - w0, strength: h.strength }))
    : []

  const nearest = (xs: number[], t: number) => xs.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a), xs[0] ?? t)
  const snap = (t: number) => (t >= W - 0.05 ? W : nearest(beatT, t))
  const strengthAt = (t: number) => beats.find((b) => Math.abs(b.t - t) < 0.03)?.strength ?? 0
  const env = (a: number, b: number) => {
    const i0 = Math.max(0, Math.floor((a + w0) / song.envelopeRate))
    const i1 = Math.max(i0 + 1, Math.floor((b + w0) / song.envelopeRate))
    let s = 0
    for (let i = i0; i < i1; i++) s += song.envelope[i] ?? 0
    return s / (i1 - i0)
  }

  // ——— Anchors: the moments the edit is built around ———
  let anchors = song.drops
    .map((d) => ({ t: d.time - w0, strength: d.strength }))
    .filter((d) => d.t > bar * 0.9 && d.t < W - bar)
    .sort((a, b) => b.strength - a.strength)
  if (!anchors.length) {
    // No detected drop in range: use the biggest lift in loudness, or a third of the way in.
    let best = { t: nearest(downT.length ? downT : beatT, W * 0.35), strength: 0 }
    for (const t of downT.length ? downT : beatT) {
      if (t < W * 0.2 || t > W * 0.6) continue
      const lift = env(t, t + 2) - env(t - 2, t)
      if (lift > best.strength) best = { t, strength: lift }
    }
    anchors = [{ t: best.t, strength: 1 }]
  }
  const kept: typeof anchors = []
  for (const a of anchors) if (kept.length < MAX_ANCHORS && kept.every((k) => Math.abs(k.t - a.t) >= bar * 8)) kept.push(a)
  kept.sort((a, b) => a.t - b.t)

  // ——— Regions ———
  const regions: Region[] = []
  let cursor = 0
  // Reserve the ending first, so the action never runs straight into the last frame.
  // Short edits get a short outro: about a seventh of the edit, in whole bars or half bars.
  const outroBeats = Math.max(2, Math.min(style.outro.beats, Math.round(((W / bp) * 0.15) / 2) * 2))
  const lastHero = kept[kept.length - 1].t + style.hero.beats * bp
  const reserveOutro = W - lastHero > outroBeats * bp + bar
  const outroAt = reserveOutro ? nearest(downT.length ? downT : beatT, W - outroBeats * bp) : W
  const teaseLen = style.coldOpen && kept[0].t >= bar * 4 ? snap(bp) : 0
  if (teaseLen > 0) {
    regions.push({ start: 0, end: teaseLen, phase: 'tease' })
    cursor = teaseLen
  }
  kept.forEach((a, i) => {
    const buildStart = Math.max(cursor, snap(a.t - style.build.bars * bar))
    if (buildStart - cursor > bp * 0.9) regions.push({ start: cursor, end: buildStart, phase: i === 0 ? 'intro' : 'ride' })
    if (a.t - buildStart > bp * 0.9) regions.push({ start: buildStart, end: a.t, phase: 'build' })
    const heroEnd = Math.min(W, snap(a.t + style.hero.beats * bp))
    regions.push({ start: a.t, end: heroEnd, phase: 'hero' })
    const nextBuild = kept[i + 1] ? snap(kept[i + 1].t - style.build.bars * bar) : outroAt
    const flurryEnd = Math.min(nextBuild, W, snap(heroEnd + style.flurry.bars * bar))
    if (flurryEnd - heroEnd > bp * 0.9) regions.push({ start: heroEnd, end: flurryEnd, phase: 'flurry' })
    cursor = Math.max(heroEnd, flurryEnd)
  })
  // The ending: whatever's left rides, then one held outro shot on a bar line.
  const outroStart = reserveOutro ? Math.max(outroAt, cursor) : W
  if (outroStart - cursor > bp * 0.9) regions.push({ start: cursor, end: outroStart, phase: 'ride' })
  if (W - Math.max(cursor, outroStart) > bp * 0.9) regions.push({ start: Math.max(cursor, outroStart), end: W, phase: 'outro' })
  else if (regions.length) regions[regions.length - 1].end = W

  // ——— Cuts inside each region ———
  const slots: Slot[] = []
  const push = (start: number, end: number, role: SlotRole, first: boolean, extra: Partial<Slot> = {}) => {
    if (end - start < 0.05) return
    // The strongest beat inside the slot is where the action should land.
    let accent = 0
    let accentStrength = -1
    for (const b of beats) {
      if (b.t < start - 0.01 || b.t >= end - 0.05) continue
      if (b.strength > accentStrength + 0.08) {
        accentStrength = b.strength
        accent = b.t - start
      }
    }
    slots.push({ start, end, role, energy: env(start, end), sectionStart: first, dropStart: role === 'hero', accent, reason: '', ...extra })
  }

  for (const r of regions) {
    switch (r.phase) {
      case 'tease':
      case 'hero':
      case 'outro':
        push(r.start, r.end, r.phase, true)
        break
      case 'intro': {
        // Long holds starting on bar lines.
        let t = r.start
        let first = true
        while (t < r.end - 0.05) {
          let next = snap(t + style.intro.beats * bp)
          const onBar = downT.filter((d) => d > t + bp * 2 && d <= next + bp * 1.5)
          if (onBar.length) next = onBar[onBar.length - 1]
          if (next <= t + 0.05 || r.end - next < bp * 1.5) next = r.end
          push(t, Math.min(next, r.end), 'intro', first)
          first = false
          t = next
        }
        break
      }
      case 'build': {
        // Lay the acceleration pattern backwards from the drop so the fastest cuts land right before it.
        const len = r.end - r.start
        const cuts: number[] = []
        let t = r.end
        for (const beatsLen of [...style.build.pattern].reverse()) {
          const prev = t - beatsLen * bp
          if (prev < r.start + bp * 0.4) break
          cuts.unshift(beatsLen >= 1 ? snap(prev) : prev)
          t = prev
        }
        const bounds = [r.start, ...cuts.filter((c) => c > r.start + 0.05 && c < r.end - 0.05), r.end]
        for (let i = 0; i < bounds.length - 1; i++) {
          push(bounds[i], bounds[i + 1], 'build', i === 0, { buildProgress: len > 0 ? (bounds[i] - r.start) / len : 0 })
        }
        break
      }
      case 'flurry':
      case 'ride': {
        // Cut on accents: from each cut, try the allowed shot lengths and take the one that lands on
        // the strongest beat (with a little variety), instead of counting a fixed grid.
        const quiet = r.phase === 'ride' && env(r.start, r.end) < 0.45
        const choices = (r.phase === 'flurry' ? style.flurry.choices : style.ride.choices).map((c) => (quiet ? c * 2 : c))
        let t = r.start
        let first = true
        while (t < r.end - 0.05) {
          let best = { at: r.end, score: -Infinity }
          for (const c of choices) {
            const at = snap(t + c * bp)
            if (at <= t + 0.05) continue
            const score = strengthAt(at) + rng() * 0.35 + (at >= r.end - 0.05 ? 0.2 : 0)
            if (score > best.score) best = { at: Math.min(at, r.end), score }
          }
          // A standout hit in range (a stab, a fill) beats a plain beat, off the grid or not.
          const shortest = Math.min(...choices) * bp
          for (const h of hitsIn) {
            if (h.t < t + shortest * 0.75 || h.t > t + Math.max(...choices) * bp + 0.01 || h.t > r.end - bp * 0.5) continue
            if (h.strength < 0.35) continue
            const score = 0.6 + h.strength * 1.2 + rng() * 0.2
            if (score > best.score) best = { at: h.t, score }
          }
          let next = best.at
          if (r.end - next < bp * 0.6) next = r.end
          push(t, next, r.phase, first)
          first = false
          t = next
        }
        break
      }
    }
  }

  if (useHits && hitsIn.length) addHitCuts(slots, hitsIn, style, bp)

  // Merge any sliver into its neighbour.
  for (let i = slots.length - 1; i > 0; i--) {
    if (slots[i].end - slots[i].start < bp * 0.3 && slots[i].role !== 'build' && !slots[i].hit) {
      slots[i - 1].end = slots[i].end
      slots.splice(i, 1)
    }
  }

  const beatsOf = (s: Slot) => {
    const n = Math.round(((s.end - s.start) / bp) * 2) / 2
    return n === 1 ? '1 beat' : `${n} beats`
  }
  for (const s of slots) {
    if (s.hit) {
      s.reason = 'Cut on a hit in the music'
      continue
    }
    s.reason = {
      tease: 'Cold open: a flash of the action to stop the scroll',
      intro: `Intro: held for ${beatsOf(s)} so the viewer meets the subject`,
      build: 'Build: cuts tighten into the drop',
      hero: 'The drop: the best moment in your footage lands right on it',
      flurry: `After the drop: cut on the strongest beat, ${beatsOf(s)}`,
      ride: `Riding the track: ${beatsOf(s)}`,
      outro: 'Outro: one last held shot to land the edit',
    }[s.role]
  }
  return slots
}

const HIT_SPLIT_ROLES = new Set<SlotRole>(['intro', 'ride', 'outro'])

/**
 * Cut on the hits you can hear. In held parts (intro, ride, outro), a cluster of standout hits (a
 * riff of strums, a run of stabs) gets one cut per hit, then the shot holds again. "Standout" is
 * relative to the part itself, so a quiet intro's strums count and the steady groove doesn't, and
 * each style decides how often it's allowed. Elsewhere, a cut near a hit snaps onto it.
 */
function addHitCuts(slots: Slot[], hits: { t: number; strength: number }[], style: StylePreset, bp: number) {
  const bar = bp * 4
  let lastClusterEnd = -Infinity
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]
    if (!HIT_SPLIT_ROLES.has(slot.role)) continue
    const inside = hits.filter((h) => h.t > slot.start - 0.02 && h.t < slot.end - 0.15)
    if (!inside.length) continue
    // What's typical is judged over a few seconds around the shot, not just the shot itself.
    const context = hits.filter((h) => h.t > slot.start - 2.5 && h.t < slot.end + 2.5).map((h) => h.strength)
    const sorted = context.sort((a, b) => a - b)
    const typical = sorted[Math.floor(sorted.length * 0.4)] ?? 0
    const standout = inside.filter((h) => h.strength >= Math.max(0.22, typical * 1.8))
    // Chains of standouts within a couple of beats of each other.
    const clusters: { t: number; strength: number }[][] = []
    let cur: { t: number; strength: number }[] = []
    for (const h of standout) {
      if (cur.length && h.t - cur[cur.length - 1].t > bp * 1.6) {
        clusters.push(cur)
        cur = []
      }
      cur.push(h)
    }
    if (cur.length) clusters.push(cur)
    const cuts: number[] = []
    for (const c of clusters) {
      // A cluster is two or more hits, or one very loud one; at most four cuts.
      if (c.length < 2 && c[0].strength < 0.55) continue
      if (c[0].t - lastClusterEnd < style.hitCuts.everyBars * bar) continue
      const pick =
        c.length <= 4
          ? c
          : [...c]
              .sort((a, b) => b.strength - a.strength)
              .slice(0, 4)
              .sort((a, b) => a.t - b.t)
      for (const h of pick) if (h.t > slot.start + 0.15 && h.t < slot.end - 0.15) cuts.push(h.t)
      lastClusterEnd = c[c.length - 1].t
    }
    if (!cuts.length) continue
    const bounds = [slot.start, ...cuts.sort((a, b) => a - b), slot.end]
    const pieces: Slot[] = []
    for (let k = 0; k < bounds.length - 1; k++) {
      if (bounds[k + 1] - bounds[k] < 0.15) continue
      pieces.push({ ...slot, start: bounds[k], end: bounds[k + 1], sectionStart: k === 0 && slot.sectionStart, accent: 0, hit: k > 0 })
    }
    if (pieces.length) pieces[pieces.length - 1].end = slot.end
    slots.splice(i, 1, ...pieces)
    i += pieces.length - 1
  }

  // Snap: a cut within a few milliseconds of a hit moves onto it, so it lands on the sound.
  for (let i = 1; i < slots.length; i++) {
    const t = slots[i].start
    if (slots[i].role === 'hero' || slots[i].hit) continue
    const h = hits.find((x) => Math.abs(x.t - t) <= 0.07 && x.strength >= 0.2)
    if (!h || h.t <= slots[i - 1].start + 0.1 || h.t >= slots[i].end - 0.1) continue
    slots[i].start = h.t
    slots[i - 1].end = h.t
  }
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
