// Edit styles. Each one is a director's playbook for the whole arc of an edit: how the intro sets the
// mood, how the build tightens, what happens on the drop, how the action is cut after it and how it
// ends. The planner reads these; nothing else is style-specific.

import type { CaptionStyle, Grade, SpeedRamp, TransitionType } from '../types'

export type BuiltInStyleId = 'hype' | 'phonk' | 'velocity' | 'cinematic' | 'smooth' | 'throwback'
/** Styles learned from the user's own reference edits get ids like `learned-…`. */
export type StyleId = BuiltInStyleId | `learned-${string}`

type Weights = Partial<Record<TransitionType, number>>

export interface StylePreset {
  id: StyleId
  name: string
  tagline: string
  /** Good for, in plain words. */
  bestFor: string
  intro: {
    /** Beats per shot before the build. Long holds let the viewer meet the subject. */
    beats: number
    speed: number
    /** 0–1: drain the colour so the drop can bring it back. */
    mono: number
    transition: Weights
  }
  build: {
    /** Bars of build before each drop. */
    bars: number
    /** Shot lengths in beats, in order, filling the build: they speed up into the drop. */
    pattern: number[]
    strobe: number
  }
  hero: {
    beats: number
    speed: SpeedRamp
    transition: Weights
  }
  /** The action after the drop: shot lengths to pick from, landing cuts on the strongest beats. */
  flurry: { bars: number; choices: number[]; transition: Weights }
  /** Between drops, or after the flurry: a steadier ride. */
  ride: { choices: number[]; transition: Weights }
  outro: { beats: number; speed: number; fade: number }
  /** Open with a split-second flash of the action, to hook the scroll. */
  coldOpen: boolean
  /** Cutting on hits in the music: at most one run of hit cuts per this many bars. */
  hitCuts: { everyBars: number }
  /** Transition length in beats. */
  transitionBeats: number
  fx: { pulse: number; shake: number; rgb: number; flash: number; push: number }
  /** Speed ramps on flurry shots long enough to feel them. */
  velocity: boolean
  look: { grade: Grade; grain: number; vignette: number; letterbox: boolean }
  captions: CaptionStyle
}

export const STYLES: StylePreset[] = [
  {
    id: 'hype',
    name: 'Aura',
    tagline: 'Black-and-white walkout, colour slams in on the knockout',
    bestFor: 'UFC, boxing, fighter tributes, highlight reels',
    intro: { beats: 8, speed: 0.7, mono: 1, transition: { cut: 4, flash: 1, dip: 1 } },
    build: { bars: 2, pattern: [2, 2, 1, 1, 1, 0.5, 0.5], strobe: 0.7 },
    hero: { beats: 4, speed: { kind: 'freeze', from: 0.4, at: 0.42 }, transition: { flash: 6, glitch: 2 } },
    flurry: { bars: 8, choices: [1, 2, 2], transition: { cut: 12, zoom: 1, flash: 1 } },
    ride: { choices: [2, 4], transition: { cut: 6, whip: 1, zoom: 1 } },
    outro: { beats: 8, speed: 0.6, fade: 1.2 },
    coldOpen: true,
    hitCuts: { everyBars: 2 },
    transitionBeats: 0.5,
    fx: { pulse: 0.07, shake: 0.7, rgb: 0.45, flash: 0.9, push: 0.05 },
    velocity: false,
    look: { grade: 'punch', grain: 0.14, vignette: 0.4, letterbox: false },
    captions: 'impact',
  },
  {
    id: 'phonk',
    name: 'Phonk',
    tagline: 'Cowbell cuts, RGB splits and hard shakes, all in black and white',
    bestFor: 'Aggressive sports edits, cars, gym',
    intro: { beats: 4, speed: 0.8, mono: 1, transition: { cut: 4, glitch: 1 } },
    build: { bars: 2, pattern: [1, 1, 1, 1, 1, 1, 0.5, 0.5, 0.5, 0.5], strobe: 1 },
    hero: { beats: 2, speed: { kind: 'freeze', from: 0.35, at: 0.5 }, transition: { glitch: 4, flash: 4 } },
    flurry: { bars: 8, choices: [1, 1, 2], transition: { cut: 10, glitch: 2, flash: 1 } },
    ride: { choices: [1, 2], transition: { cut: 6, glitch: 2 } },
    outro: { beats: 4, speed: 0.7, fade: 0.8 },
    coldOpen: true,
    hitCuts: { everyBars: 1 },
    transitionBeats: 0.35,
    fx: { pulse: 0.09, shake: 1, rgb: 0.9, flash: 1, push: 0.02 },
    velocity: false,
    look: { grade: 'mono', grain: 0.22, vignette: 0.55, letterbox: false },
    captions: 'glitch',
  },
  {
    id: 'velocity',
    name: 'Velocity',
    tagline: 'Speed ramps that slow on the hit and rip back up',
    bestFor: 'Skate, dance, cars, anything with motion',
    intro: { beats: 4, speed: 1, mono: 0, transition: { cut: 3, zoom: 2 } },
    build: { bars: 2, pattern: [2, 2, 2, 1, 1], strobe: 0.2 },
    hero: { beats: 4, speed: { kind: 'velocity', fast: 1.8, slow: 0.3 }, transition: { zoom: 4, flash: 2 } },
    flurry: { bars: 8, choices: [2, 2, 4], transition: { cut: 5, zoom: 3, whip: 2 } },
    ride: { choices: [2, 4], transition: { cut: 4, zoom: 2, whip: 2 } },
    outro: { beats: 4, speed: 0.8, fade: 0.8 },
    coldOpen: false,
    hitCuts: { everyBars: 2 },
    transitionBeats: 0.5,
    fx: { pulse: 0.05, shake: 0.25, rgb: 0.25, flash: 0.6, push: 0.03 },
    velocity: true,
    look: { grade: 'teal-orange', grain: 0.08, vignette: 0.3, letterbox: false },
    captions: 'pop',
  },
  {
    id: 'cinematic',
    name: 'Cinematic',
    tagline: 'Letterbox, slow pushes and a hero shot that breathes',
    bestFor: 'Trailers, retirement tributes, travel films',
    intro: { beats: 8, speed: 0.75, mono: 0.35, transition: { fade: 3, dip: 2, cut: 1 } },
    build: { bars: 2, pattern: [4, 2, 2], strobe: 0 },
    hero: { beats: 8, speed: { kind: 'constant', speed: 0.5 }, transition: { dip: 3, flash: 2 } },
    flurry: { bars: 8, choices: [2, 4], transition: { cut: 5, fade: 2 } },
    ride: { choices: [4, 8], transition: { cut: 3, fade: 3 } },
    outro: { beats: 8, speed: 0.6, fade: 2 },
    coldOpen: false,
    hitCuts: { everyBars: 4 },
    transitionBeats: 1,
    fx: { pulse: 0.015, shake: 0.08, rgb: 0, flash: 0.35, push: 0.07 },
    velocity: false,
    look: { grade: 'teal-orange', grain: 0.1, vignette: 0.45, letterbox: true },
    captions: 'clean',
  },
  {
    id: 'smooth',
    name: 'Smooth',
    tagline: 'Whip pans and easy rhythm, nothing jarring',
    bestFor: 'Travel, vlogs, day-in-the-life, product reels',
    intro: { beats: 4, speed: 1, mono: 0, transition: { whip: 3, cut: 2 } },
    build: { bars: 1, pattern: [2, 1, 1], strobe: 0 },
    hero: { beats: 4, speed: { kind: 'constant', speed: 1 }, transition: { whip: 3, zoom: 3 } },
    flurry: { bars: 8, choices: [2, 4], transition: { cut: 4, whip: 3, fade: 1 } },
    ride: { choices: [4], transition: { cut: 3, whip: 3 } },
    outro: { beats: 4, speed: 0.9, fade: 1 },
    coldOpen: false,
    hitCuts: { everyBars: 2 },
    transitionBeats: 0.5,
    fx: { pulse: 0.025, shake: 0, rgb: 0, flash: 0.2, push: 0.05 },
    velocity: false,
    look: { grade: 'warm', grain: 0.04, vignette: 0.2, letterbox: false },
    captions: 'karaoke',
  },
  {
    id: 'throwback',
    name: 'Throwback',
    tagline: 'Film grain, warm fades, memories cut slow',
    bestFor: 'Recaps, friends, old footage, birthdays',
    intro: { beats: 8, speed: 0.9, mono: 0.5, transition: { fade: 3, dip: 1 } },
    build: { bars: 1, pattern: [2, 2], strobe: 0 },
    hero: { beats: 4, speed: { kind: 'constant', speed: 0.8 }, transition: { flash: 3, fade: 2 } },
    flurry: { bars: 8, choices: [2, 4], transition: { cut: 4, fade: 3 } },
    ride: { choices: [4, 8], transition: { fade: 3, dip: 1 } },
    outro: { beats: 8, speed: 0.8, fade: 2 },
    coldOpen: false,
    hitCuts: { everyBars: 4 },
    transitionBeats: 1,
    fx: { pulse: 0.02, shake: 0.1, rgb: 0.1, flash: 0.5, push: 0.05 },
    velocity: false,
    look: { grade: 'vintage', grain: 0.35, vignette: 0.5, letterbox: false },
    captions: 'typewriter',
  },
]

// Learned styles live with the user (see state/styles.ts); the planner finds them here.
let learned: StylePreset[] = []

export function setLearnedStyles(list: StylePreset[]) {
  learned = list
}

export function getStyle(id: StyleId): StylePreset {
  return STYLES.find((s) => s.id === id) ?? learned.find((s) => s.id === id) ?? STYLES[0]
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
