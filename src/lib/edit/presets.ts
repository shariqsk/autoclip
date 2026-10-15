// Edit styles. Each one is a full set of editing decisions: how often to cut in calm, mid and loud
// parts, how to cut into drops, which transitions and effects to reach for, the look and the
// caption style. The planner reads these; nothing else is style-specific.

import type { CaptionStyle, Grade, SpeedRamp, TransitionType } from '../types'

export type StyleId = 'hype' | 'phonk' | 'velocity' | 'cinematic' | 'smooth' | 'throwback'

type Weights = Partial<Record<TransitionType, number>>

export interface StylePreset {
  id: StyleId
  name: string
  tagline: string
  /** Good for, in plain words. */
  bestFor: string
  /** Beats per shot in quiet, middle and loud parts of the song. */
  pacing: { low: number; mid: number; high: number }
  /** Cuts speed up across the bars before a drop. */
  buildRoll: boolean
  /** Chance a strong beat in a loud part gets an extra cut halfway through. */
  doubleTime: number
  /** How long the first shot of a drop holds, in beats. */
  heroBeats: number
  transitions: { within: Weights; section: Weights; drop: Weights }
  /** Transition length in beats. */
  transitionBeats: number
  fx: { pulse: number; shake: number; rgb: number; flash: number; push: number }
  /** Speed of the hero shot on the drop. */
  heroSpeed: SpeedRamp
  /** Speed ramps on loud shots that are long enough to feel them. */
  velocity: boolean
  /** Playback speed in calm parts. */
  calmSpeed: number
  look: { grade: Grade; grain: number; vignette: number; letterbox: boolean }
  captions: CaptionStyle
}

export const STYLES: StylePreset[] = [
  {
    id: 'hype',
    name: 'Hype',
    tagline: 'Hard cuts, flashes and punches on every hit',
    bestFor: 'UFC, boxing, basketball, football highlights',
    pacing: { low: 4, mid: 4, high: 2 },
    buildRoll: true,
    doubleTime: 0.35,
    heroBeats: 2,
    transitions: {
      within: { cut: 10, flash: 1, zoom: 1 },
      section: { whip: 3, glitch: 2, zoom: 3, flash: 2 },
      drop: { flash: 5, zoom: 3, glitch: 2 },
    },
    transitionBeats: 0.5,
    fx: { pulse: 0.07, shake: 0.6, rgb: 0.4, flash: 0.85, push: 0.04 },
    heroSpeed: { kind: 'ease-in', from: 0.35, to: 1 },
    velocity: false,
    calmSpeed: 1,
    look: { grade: 'punch', grain: 0.12, vignette: 0.35, letterbox: false },
    captions: 'impact',
  },
  {
    id: 'phonk',
    name: 'Phonk',
    tagline: 'Black-and-white, RGB splits, shake on the cowbell',
    bestFor: 'Aggressive sports edits, car edits, gym edits',
    pacing: { low: 2, mid: 1, high: 1 },
    buildRoll: true,
    doubleTime: 0.32,
    heroBeats: 2,
    transitions: {
      within: { cut: 8, glitch: 2, flash: 1 },
      section: { glitch: 4, flash: 3, spin: 1 },
      drop: { glitch: 4, flash: 4, zoom: 2 },
    },
    transitionBeats: 0.35,
    fx: { pulse: 0.09, shake: 0.9, rgb: 0.85, flash: 1, push: 0.02 },
    heroSpeed: { kind: 'ease-in', from: 0.3, to: 1 },
    velocity: false,
    calmSpeed: 1,
    look: { grade: 'mono', grain: 0.22, vignette: 0.55, letterbox: false },
    captions: 'glitch',
  },
  {
    id: 'velocity',
    name: 'Velocity',
    tagline: 'Speed ramps that slow on the hit and rip back up',
    bestFor: 'Skate, dance, cars, anything with motion',
    pacing: { low: 4, mid: 4, high: 2 },
    buildRoll: true,
    doubleTime: 0,
    heroBeats: 4,
    transitions: {
      within: { cut: 6, zoom: 3, whip: 2 },
      section: { zoom: 4, whip: 3 },
      drop: { zoom: 4, flash: 2 },
    },
    transitionBeats: 0.5,
    fx: { pulse: 0.05, shake: 0.25, rgb: 0.25, flash: 0.6, push: 0.03 },
    heroSpeed: { kind: 'velocity', fast: 1.8, slow: 0.3 },
    velocity: true,
    calmSpeed: 1,
    look: { grade: 'teal-orange', grain: 0.08, vignette: 0.3, letterbox: false },
    captions: 'pop',
  },
  {
    id: 'cinematic',
    name: 'Cinematic',
    tagline: 'Letterbox, slow pushes, fades on the phrase',
    bestFor: 'Trailers, travel films, tributes, retirement edits',
    pacing: { low: 8, mid: 4, high: 2 },
    buildRoll: false,
    doubleTime: 0,
    heroBeats: 4,
    transitions: {
      within: { cut: 6, fade: 3 },
      section: { dip: 4, fade: 3 },
      drop: { flash: 2, dip: 2, cut: 2 },
    },
    transitionBeats: 1,
    fx: { pulse: 0.015, shake: 0.08, rgb: 0, flash: 0.35, push: 0.07 },
    heroSpeed: { kind: 'constant', speed: 0.5 },
    velocity: false,
    calmSpeed: 0.75,
    look: { grade: 'teal-orange', grain: 0.1, vignette: 0.45, letterbox: true },
    captions: 'clean',
  },
  {
    id: 'smooth',
    name: 'Smooth',
    tagline: 'Whip pans and match cuts, easy on the eyes',
    bestFor: 'Travel, vlogs, day-in-the-life, product reels',
    pacing: { low: 4, mid: 4, high: 2 },
    buildRoll: false,
    doubleTime: 0,
    heroBeats: 4,
    transitions: {
      within: { cut: 5, whip: 3, fade: 1 },
      section: { whip: 4, zoom: 2, fade: 1 },
      drop: { whip: 3, zoom: 3 },
    },
    transitionBeats: 0.5,
    fx: { pulse: 0.025, shake: 0, rgb: 0, flash: 0.2, push: 0.05 },
    heroSpeed: { kind: 'constant', speed: 1 },
    velocity: false,
    calmSpeed: 1,
    look: { grade: 'warm', grain: 0.04, vignette: 0.2, letterbox: false },
    captions: 'karaoke',
  },
  {
    id: 'throwback',
    name: 'Throwback',
    tagline: 'Film grain, warm fades, a little light leak',
    bestFor: 'Memories, recaps, friends, old footage',
    pacing: { low: 8, mid: 4, high: 2 },
    buildRoll: false,
    doubleTime: 0,
    heroBeats: 4,
    transitions: {
      within: { cut: 5, fade: 3, dip: 1 },
      section: { fade: 3, dip: 3 },
      drop: { flash: 3, fade: 2 },
    },
    transitionBeats: 1,
    fx: { pulse: 0.02, shake: 0.1, rgb: 0.1, flash: 0.5, push: 0.05 },
    heroSpeed: { kind: 'constant', speed: 0.8 },
    velocity: false,
    calmSpeed: 0.9,
    look: { grade: 'vintage', grain: 0.35, vignette: 0.5, letterbox: false },
    captions: 'typewriter',
  },
]

export function getStyle(id: StyleId): StylePreset {
  return STYLES.find((s) => s.id === id) ?? STYLES[0]
}

export const TRANSITION_NAMES: Record<TransitionType, string> = {
  cut: 'Hard cut',
  fade: 'Crossfade',
  flash: 'White flash',
  zoom: 'Zoom punch',
  whip: 'Whip pan',
  glitch: 'Glitch',
  dip: 'Dip to black',
  spin: 'Spin',
}
