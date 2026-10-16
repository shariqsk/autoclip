// Reading an edit against its own music, then turning one or more readings into a style. The edit's
// cuts are lined up with the song's beats, hits and drop: how long shots are in each part of the arc,
// whether cuts land on the beat, between beats or on hits, and what the picture does on the drop.

import type { SongAnalysis, TransitionType } from '../types'
import { STYLES, type StylePreset } from '../edit/presets'
import type { FrameEvents, FrameSample } from './frames'
import { clamp, mean, median, quantizeBeats } from './stats'

export type RefPhase = 'cold' | 'intro' | 'build' | 'hero' | 'flurry' | 'ride' | 'outro'
type Into = 'cut' | 'flash' | 'dip'

export interface MeasuredShot {
  start: number
  end: number
  beats: number
  phase: RefPhase
  /** How the edit got into this shot. */
  into: Into
}

/** What one reference edit does, in numbers. Plain data, so it can be saved. */
export interface EditMeasure {
  name: string
  duration: number
  bpm: number
  /** How sure the beat tracker was, 0–1. */
  beatConfidence: number
  /** Seconds the picture sits off the beat grid overall (corrected for when judging cuts). */
  offset: number
  /** The drop the edit is built around, or null when there isn't a clear one. */
  drop: number | null
  shots: MeasuredShot[]
  cuts: { total: number; onBeat: number; onHalf: number; onHit: number }
  /** Fraction of frames in black and white before the drop, after it and overall. */
  mono: { intro: number; after: number; overall: number }
  /** After the drop: mean colourfulness (0–1) and warmth (−1–1). */
  saturation: number
  warmth: number
  /** Fraction of frames with cinema bars. */
  letterbox: number
  flashes: number
  flashesInBuild: number
  flashAtDrop: boolean
  freezes: number
  freezeAtDrop: boolean
  shakes: number
  zooms: number
  dips: number
  coldOpen: boolean
}

export interface WatchedFrames {
  duration: number
  dt: number
  cuts: number[]
  frames: FrameSample[]
  events: FrameEvents
}

/** Signed distance from x to the nearest value in a sorted list (x minus that value). */
function nearestSigned(sorted: number[], x: number): number {
  let lo = 0
  let hi = sorted.length - 1
  if (hi < 0) return Infinity
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sorted[mid] < x) lo = mid + 1
    else hi = mid
  }
  const a = x - sorted[lo]
  const b = lo > 0 ? x - sorted[lo - 1] : Infinity
  return Math.abs(a) <= Math.abs(b) ? a : b
}

const nearestDistance = (sorted: number[], x: number) => Math.abs(nearestSigned(sorted, x))

/**
 * How far the picture sits from the beat grid overall. Encoders, platforms and the beat tracker
 * each shift things by a few tens of milliseconds; an editor cutting on the beat still shows up as
 * a tight cluster of offsets, just not around zero. Returns the cluster's centre, or 0 when there
 * isn't one.
 */
export function syncOffset(cuts: number[], beats: number[], bp: number): number {
  const offs = cuts.map((c) => nearestSigned(beats, c)).filter((o) => Math.abs(o) < 0.25 * bp)
  if (offs.length < 5) return 0
  const centre = median(offs)
  const tight = offs.filter((o) => Math.abs(o - centre) < 0.06).length / offs.length
  return tight >= 0.5 && Math.abs(centre) <= 0.12 ? centre : 0
}

/**
 * The drop the edit is built around: the strongest one the song analysis found with room on both
 * sides; failing that (a short excerpt can hide a drop from it), the biggest jump in loudness,
 * backed up by the picture changing at the same moment (colour slamming back in, a flash).
 */
function chooseDrop(song: SongAnalysis, duration: number, frames: FrameSample[], flashes: number[]): number | null {
  const inside = song.drops.filter((d) => d.time > 1.5 && d.time < duration - 1.5)
  if (inside.length) return inside.reduce((a, b) => (b.strength > a.strength ? b : a)).time
  const section = song.sections.find((s) => s.label === 'drop' && s.start > 1.5 && s.start < duration - 1.5)
  if (section) return section.start

  const env = song.envelope
  const rate = song.envelopeRate || 0.05
  if (env.length < 20) return null
  const avg = (from: number, to: number) => {
    const a = Math.max(0, Math.round(from / rate))
    const b = Math.min(env.length, Math.round(to / rate))
    return b > a ? mean(env.slice(a, b)) : 0
  }
  const sat = (from: number, to: number) => mean(frames.filter((f) => f.t >= from && f.t < to).map((f) => f.saturation))
  let best = { t: -1, score: 0 }
  for (const b of song.beats) {
    if (b.kind !== 'downbeat' || b.time < 2 || b.time > duration - 2) continue
    const gain = avg(b.time, b.time + 1.5) - avg(b.time - 3, b.time)
    const colour = sat(b.time, b.time + 1) - sat(b.time - 2, b.time)
    const flash = flashes.some((x) => Math.abs(x - b.time) < 0.25) ? 0.08 : 0
    const score = gain + 0.6 * Math.max(0, colour) + flash
    if (score > best.score) best = { t: b.time, score }
  }
  return best.score > 0.18 && avg(best.t, best.t + 1.5) > 0.5 ? best.t : null
}

export function measureEdit(name: string, watched: WatchedFrames, song: SongAnalysis): EditMeasure {
  const { duration, frames, events } = watched
  const bp = 60 / Math.max(40, song.bpm)
  const beats = song.beats.map((b) => b.time)
  const halves = beats.slice(1).map((b, i) => (b + beats[i]) / 2)
  const hits = (song.hits ?? []).map((h) => h.time)
  const tol = Math.min(0.07, 0.18 * bp)
  const cuts = watched.cuts.filter((c) => c > 0.05 && c < duration - 0.05)
  const offset = syncOffset(cuts, beats, bp)

  // Where the cuts land, once the picture is lined up with the music.
  let onBeat = 0
  let onHalf = 0
  let onHit = 0
  for (const cut of cuts) {
    const c = cut - offset
    const beat = nearestDistance(beats, c) <= tol
    const half = !beat && nearestDistance(halves, c) <= tol
    if (beat) onBeat++
    else if (half) onHalf++
    if (!beat && nearestDistance(hits, c) <= 0.06) onHit++
  }

  // Shots, placed in the arc.
  const drop = chooseDrop(song, duration, frames, events.flashes)
  const bounds = [0, ...cuts, duration]
  const near = (list: number[], t: number, before: number, after: number) => list.some((x) => x >= t - before && x <= t + after)
  const shots: MeasuredShot[] = []
  for (let i = 0; i < bounds.length - 1; i++) {
    const start = bounds[i]
    const end = bounds[i + 1]
    const into: Into =
      i === 0 ? 'cut' : near(events.flashes, start, 0.12, 0.15) ? 'flash' : near(events.dips, start, 0.35, 0.1) ? 'dip' : 'cut'
    shots.push({ start, end, beats: (end - start) / bp, phase: 'ride', into })
  }
  const buildStart = drop !== null ? drop - 8 * bp : -1
  let heroEnd = -1
  for (const [i, s] of shots.entries()) {
    if (drop === null) s.phase = 'ride'
    else if (heroEnd < 0 && s.start >= drop - 0.3 * bp) {
      s.phase = 'hero'
      heroEnd = s.end
    } else if (heroEnd >= 0) s.phase = s.start < heroEnd + 32 * bp ? 'flurry' : 'ride'
    else if (s.start < buildStart - 0.25 * bp) s.phase = 'intro'
    else s.phase = 'build'
    if (i === shots.length - 1 && shots.length >= 4 && s.phase !== 'hero') s.phase = 'outro'
  }
  const coldOpen = shots.length > 3 && shots[0].beats < 0.9 && (drop === null || drop > 8 * bp)
  if (coldOpen) shots[0].phase = 'cold'

  // The picture.
  const split = drop ?? duration * 0.3
  const before = frames.filter((f) => f.t < split)
  const after = frames.filter((f) => f.t >= split)
  const monoOf = (fs: FrameSample[]) => mean(fs.map((f) => (f.saturation < 0.045 ? 1 : 0)))
  const letterboxed = (f: FrameSample) => f.barTop >= 0.04 && f.barTop <= 0.22 && f.barBottom >= 0.04 && f.barBottom <= 0.22

  return {
    name,
    duration,
    bpm: song.bpm,
    beatConfidence: song.confidence,
    offset,
    drop,
    shots,
    cuts: { total: cuts.length, onBeat, onHalf, onHit },
    mono: { intro: monoOf(before), after: monoOf(after), overall: monoOf(frames) },
    saturation: mean(after.map((f) => f.saturation)),
    warmth: mean(after.map((f) => f.warmth)),
    letterbox: mean(frames.map((f) => (letterboxed(f) ? 1 : 0))),
    flashes: events.flashes.length,
    flashesInBuild: drop === null ? 0 : events.flashes.filter((t) => t >= buildStart && t < drop - 0.1).length,
    flashAtDrop: drop !== null && near(events.flashes, drop, 0.25, 0.25),
    freezes: events.freezes.length,
    freezeAtDrop: drop !== null && events.freezes.some(([s]) => s >= drop - 0.3 && s <= drop + 3),
    shakes: events.shakes.length,
    zooms: events.zooms.length,
    dips: events.dips.length,
    coldOpen,
  }
}

// ---------------------------------------------------------------------------------------------------

type Weights = Partial<Record<TransitionType, number>>

const lengthsOf = (ms: EditMeasure[], phase: RefPhase) => ms.flatMap((m) => m.shots.filter((s) => s.phase === phase).map((s) => s.beats))

/** A spread of shot lengths, as the planner's list of choices: commoner lengths appear more often. */
function choicesFrom(lengths: number[], fallback: number[]): number[] {
  if (lengths.length < 3) return fallback
  const counts = new Map<number, number>()
  for (const l of lengths) counts.set(quantizeBeats(l), (counts.get(quantizeBeats(l)) ?? 0) + 1)
  const ranked = [...counts].sort((a, b) => b[1] - a[1]).filter(([, n], i) => i === 0 || n / lengths.length >= 0.15)
  const total = ranked.reduce((a, [, n]) => a + n, 0)
  const out: number[] = []
  for (const [len, n] of ranked) for (let k = 0; k < Math.max(1, Math.round((n / total) * 4)); k++) out.push(len)
  return out.sort((a, b) => a - b).slice(0, 5)
}

function lengthOr(lengths: number[], fallback: number, lo: number, hi: number): number {
  return lengths.length ? clamp(quantizeBeats(median(lengths)), lo, hi) : fallback
}

/** Transition mix: what was seen (cuts, flashes, dips), plus a little of the base style's flavour. */
function weightsFrom(ms: EditMeasure[], phases: RefPhase[], base: Weights): Weights {
  const into = ms.flatMap((m) => m.shots.filter((s, i) => i > 0 && phases.includes(s.phase)).map((s) => s.into))
  if (into.length < 2) return base
  const out: Weights = {}
  for (const t of ['cut', 'flash', 'dip'] as const) {
    const n = into.filter((x) => x === t).length
    if (n) out[t] = (n / into.length) * 10
  }
  const baseTotal = Object.values(base).reduce((a, b) => a + (b ?? 0), 0) || 1
  for (const [k, v] of Object.entries(base) as [TransitionType, number][]) {
    if (k === 'cut' || k === 'flash' || k === 'dip' || !v) continue
    out[k] = (v / baseTotal) * 3
  }
  out.cut = Math.max(out.cut ?? 0, 1)
  return out
}

/** The four counts below in one place, per reference, then averaged. */
function rates(ms: EditMeasure[]) {
  const per = (f: (m: EditMeasure) => number) => mean(ms.map(f))
  const cutsOf = (m: EditMeasure) => Math.max(1, m.cuts.total)
  const beatsOf = (m: EditMeasure) => Math.max(1, m.duration / (60 / m.bpm))
  return {
    onBeat: per((m) => m.cuts.onBeat / cutsOf(m)),
    onHalf: per((m) => m.cuts.onHalf / cutsOf(m)),
    onHit: per((m) => m.cuts.onHit / cutsOf(m)),
    flashPerCut: per((m) => m.flashes / cutsOf(m)),
    shakePerCut: per((m) => m.shakes / cutsOf(m)),
    zoomPerBeat: per((m) => m.zooms / beatsOf(m)),
    perMinute: (f: (m: EditMeasure) => number) => per((m) => (f(m) / m.duration) * 60),
  }
}

const majority = (ms: EditMeasure[], f: (m: EditMeasure) => boolean) => ms.filter(f).length * 2 > ms.length

/** The built-in style closest to what was measured, to borrow whatever can't be measured. */
function nearestBuiltIn(flurryBeats: number, mono: number, flash: number, letterbox: boolean): StylePreset {
  let best = STYLES[0]
  let bestD = Infinity
  for (const s of STYLES) {
    const d =
      Math.abs(Math.log2(flurryBeats / mean(s.flurry.choices))) +
      Math.abs(mono - s.intro.mono) +
      0.5 * Math.abs(flash - s.fx.flash) +
      (letterbox !== s.look.letterbox ? 1 : 0)
    if (d < bestD) {
      bestD = d
      best = s
    }
  }
  return best
}

export interface LearnedStyle {
  preset: StylePreset
  /** Plain-words facts about what was learned, for the user. */
  facts: string[]
  /** The built-in style it borrowed the rest from. */
  basedOn: string
}

const withDropCount = (ms: EditMeasure[]) => ms.filter((m) => m.drop !== null).length

const beatWord = (b: number) => (b === 0.5 ? 'half-beat' : b === 1 ? '1-beat' : `${b}-beat`)

export function learnStyle(measures: EditMeasure[], opts: { id: string; name: string }): LearnedStyle {
  if (!measures.length) throw new Error('Nothing to learn from')
  const ms = measures
  const r = rates(ms)
  // After the drop; for edits without one, their steady cutting is the same thing.
  const flurryLens = lengthsOf(ms, 'flurry').length >= 3 ? lengthsOf(ms, 'flurry') : lengthsOf(ms, 'ride')
  const anyLens = ms.flatMap((m) => m.shots.slice(1, -1).map((s) => s.beats))
  const flurryMedian = median(flurryLens.length >= 3 ? flurryLens : anyLens) || 2
  const introMono = mean(ms.map((m) => m.mono.intro))
  const overallMono = mean(ms.map((m) => m.mono.overall))
  const letterbox = mean(ms.map((m) => m.letterbox)) > 0.5
  const flash = clamp(r.flashPerCut * 1.5, 0.1, 1)
  const base = nearestBuiltIn(quantizeBeats(flurryMedian), introMono > 0.5 ? 1 : 0, flash, letterbox)
  const p: StylePreset = structuredClone(base)

  p.id = opts.id as StylePreset['id']
  p.name = opts.name

  // Intro.
  p.intro.beats = lengthOr(lengthsOf(ms, 'intro'), base.intro.beats, 1, 8)
  p.intro.mono = introMono > 0.6 ? 1 : introMono > 0.3 ? 0.5 : 0
  p.intro.transition = weightsFrom(ms, ['intro'], base.intro.transition)

  // Build: the shots before the drop, counted back from it.
  const withDrop = ms.filter((m) => m.drop !== null)
  const pattern: number[] = []
  for (let k = 0; k < 16; k++) {
    const at = withDrop.map((m) => m.shots.filter((s) => s.phase === 'build').reverse()[k]).filter(Boolean)
    if (!at.length || at.length * 2 < withDrop.length) break
    pattern.unshift(quantizeBeats(median(at.map((s) => s.beats))))
    if (pattern.reduce((a, b) => a + b, 0) >= 16) break
  }
  // A build only ever tightens into the drop: a stray short shot early on is noise, not the pattern.
  for (let i = pattern.length - 2; i >= 0; i--) pattern[i] = Math.max(pattern[i], pattern[i + 1])
  if (pattern.length >= 2) {
    p.build.pattern = pattern
    p.build.bars = clamp(Math.ceil(pattern.reduce((a, b) => a + b, 0) / 4), 1, 4)
  }
  const buildBeats = Math.max(1, mean(withDrop.map(() => p.build.bars * 4)))
  p.build.strobe = withDrop.length ? clamp((mean(withDrop.map((m) => m.flashesInBuild)) / buildBeats) * 3, 0, 1) : base.build.strobe

  // The drop.
  p.hero.beats = lengthOr(lengthsOf(ms, 'hero'), base.hero.beats, 1, 8)
  if (withDrop.length && majority(withDrop, (m) => m.freezeAtDrop)) p.hero.speed = { kind: 'freeze', from: 0.4, at: 0.45 }
  else if (base.hero.speed.kind === 'freeze') p.hero.speed = { kind: 'constant', speed: 1 }
  p.hero.transition =
    withDrop.length && majority(withDrop, (m) => m.flashAtDrop) ? { flash: 6, cut: 1 } : weightsFrom(ms, ['hero'], base.hero.transition)

  // After it.
  p.flurry.choices = choicesFrom(flurryLens, base.flurry.choices)
  p.flurry.transition = weightsFrom(ms, ['flurry'], base.flurry.transition)
  // Between drops: what the edits did there, or a steadier version of the flurry.
  const rideLens = ms.filter((m) => m.drop !== null).flatMap((m) => m.shots.filter((s) => s.phase === 'ride').map((s) => s.beats))
  p.ride.choices = choicesFrom(
    rideLens,
    p.flurry.choices.map((c) => Math.min(8, c * 2)),
  )
  p.ride.transition = weightsFrom(ms, ['ride'], base.ride.transition)
  p.outro.beats = lengthOr(lengthsOf(ms, 'outro'), base.outro.beats, 2, 8)
  p.coldOpen = majority(ms, (m) => m.coldOpen)

  // Cutting on hits between the beats.
  p.hitCuts.everyBars = r.onHit >= 0.2 ? 1 : r.onHit >= 0.08 ? 2 : 4

  // Effects and look.
  p.fx.flash = flash
  p.fx.shake = clamp(r.shakePerCut * 1.5, 0, 1)
  p.fx.pulse = 0.015 + 0.075 * clamp(r.zoomPerBeat * 3, 0, 1)
  if (overallMono > 0.75) p.fx.rgb = Math.max(p.fx.rgb, 0.3)
  const sat = mean(ms.map((m) => m.saturation))
  const warmth = mean(ms.map((m) => m.warmth))
  p.look = {
    ...p.look,
    grade:
      overallMono > 0.75
        ? 'mono'
        : sat > 0.32
          ? 'punch'
          : warmth > 0.05
            ? 'warm'
            : warmth < -0.03
              ? 'cold'
              : base.look.grade === 'mono'
                ? 'punch'
                : base.look.grade,
    letterbox,
  }

  // In plain words.
  const facts: string[] = []
  const after = quantizeBeats(flurryMedian)
  facts.push(
    `Cuts on ${beatWord(after)} shots${withDropCount(ms) ? ' after the drop' : ''}${p.flurry.choices.length > 1 ? `, mixing ${[...new Set(p.flurry.choices)].map(beatWord).join(' and ')}` : ''}`,
  )
  facts.push(
    `${Math.round(r.onBeat * 100)}% of cuts on the beat, ${Math.round(r.onHalf * 100)}% between beats, ${Math.round(r.onHit * 100)}% on hits`,
  )
  if (lengthsOf(ms, 'intro').length)
    facts.push(
      `Intro holds ${beatWord(p.intro.beats)} shots${p.intro.mono >= 1 ? ' in black and white' : p.intro.mono > 0 ? ' with the colour drained' : ''}`,
    )
  if (pattern.length >= 2) facts.push(`Build speeds up: ${pattern.map((b) => (b === 0.5 ? '½' : b)).join(' → ')} beats into the drop`)
  if (withDrop.length) {
    const hero = [
      p.hero.speed.kind === 'freeze' ? 'a freeze-frame' : `a ${beatWord(p.hero.beats)} hero shot`,
      p.hero.transition.flash ? 'a flash' : null,
    ].filter(Boolean)
    facts.push(`On the drop: ${hero.join(' and ')}`)
  } else facts.push('No clear drop: cut steadily all the way')
  const fx = [
    [r.perMinute((m) => m.flashes), 'flashes'],
    [r.perMinute((m) => m.shakes), 'shakes'],
    [r.perMinute((m) => m.zooms), 'zoom punches'],
  ]
    .filter(([n]) => (n as number) >= 1)
    .map(([n, w]) => `${Math.round(n as number)} ${w}`)
  if (fx.length) facts.push(`${fx.join(', ')} a minute`)
  const look = { mono: 'black and white', punch: 'punchy colour', warm: 'warm colour', cold: 'cool colour' }[p.look.grade as string]
  facts.push(
    `${look ? look[0].toUpperCase() + look.slice(1) : 'Colour from ' + base.name}${letterbox ? ', cinema bars' : ''}${p.coldOpen ? ', opens with a flash of the action' : ''}`,
  )

  p.tagline = facts[0]
  p.bestFor = `Edits like the ${ms.length === 1 ? 'one' : ms.length} you showed it`
  return { preset: p, facts, basedOn: base.name }
}
