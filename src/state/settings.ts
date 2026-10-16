// Every user-facing choice, with defaults. Settings are saved to localStorage; media never is.

import type { StyleId } from '../lib/edit/presets'
import type { LengthChoice } from '../lib/edit/window'
import type { AspectId, CaptionPosition, CaptionStyle, ContentMix, FitMode, Grade, TitleAt, TitleLook } from '../lib/types'

export type CaptionSource = 'off' | 'auto' | 'file' | 'text'

export interface VoiceoverSettings {
  enabled: boolean
  text: string
  voice: string
  speed: number
  /** Where the line plays: before the music hits, or right on the first drop. */
  placement: 'intro' | 'drop'
}

export interface Settings {
  style: StyleId
  length: LengthChoice
  aspect: AspectId
  /** How footage of another shape is framed. 'style' follows the edit style. */
  framing: FitMode | 'style'
  order: 'best' | 'story'
  /** Cut on standout hits in the music (strums, stabs, fills), not only the beat. */
  hitCuts: boolean
  /** How much of each shot type (big moments, action, b-roll…) the edit uses. */
  mix: ContentMix
  variety: number
  /** 'style' follows the edit style's look. */
  grade: Grade | 'style'
  grain: number | 'style'
  vignette: number | 'style'
  letterbox: boolean | 'style'
  glow: number | 'style'
  leaks: number | 'style'
  blur: number | 'style'
  /** Open on a collage of picture-in-picture panels. 'style' follows the edit style. */
  collage: boolean | 'style'
  intensity: number
  sfx: boolean
  sfxVolume: number
  clipAudio: 'off' | 'hero' | 'all'
  musicVolume: number
  captions: {
    source: CaptionSource
    style: CaptionStyle | 'style'
    position: CaptionPosition
    scale: number
    accent: string
    model: string
    /** Free text: one word per beat into the drop. */
    beatText: string
    /** Big title card. */
    title: string
    titleAt: TitleAt
    /** 'style' follows the edit style. */
    titleLook: TitleLook | 'style'
    /** Draw the title behind the people in shot. 'style' follows the edit style. */
    titleBehind: boolean | 'style'
  }
  /** Fighter nameplate that slams in on the drop. */
  nameplate: { name: string; sub: string }
  /** "@handle" watermark in the corner. */
  handle: string
  voiceover: VoiceoverSettings
  export: {
    resolution: 720 | 1080 | 1440 | 2160
    fps: 24 | 30 | 60
    quality: 'standard' | 'high' | 'max'
    /** Keep the file under this many MB (Discord's limit), or null for no limit. */
    limitMb: number | null
  }
}

export const DEFAULT_SETTINGS: Settings = {
  style: 'hype',
  length: 30,
  aspect: '9:16',
  framing: 'style',
  order: 'best',
  hitCuts: true,
  mix: { finish: 'some', action: 'some', broll: 'some', celebrate: 'some', talk: 'some', text: 'none' },
  variety: 0.6,
  grade: 'style',
  grain: 'style',
  vignette: 'style',
  letterbox: 'style',
  glow: 'style',
  leaks: 'style',
  blur: 'style',
  collage: 'style',
  intensity: 1,
  sfx: true,
  sfxVolume: 0.7,
  clipAudio: 'off',
  musicVolume: 1,
  captions: {
    source: 'off',
    style: 'style',
    position: 'bottom',
    scale: 1,
    accent: '#ffd60a',
    model: 'onnx-community/whisper-base.en_timestamped',
    beatText: '',
    title: '',
    titleAt: 'start',
    titleLook: 'style',
    titleBehind: 'style',
  },
  nameplate: { name: '', sub: '' },
  handle: '',
  voiceover: { enabled: false, text: 'Remember the name.', voice: 'am_michael', speed: 1, placement: 'intro' },
  export: { resolution: 1080, fps: 30, quality: 'high', limitMb: null },
}

export const ASPECTS: { id: AspectId; label: string; note: string; w: number; h: number }[] = [
  { id: '9:16', label: 'Vertical', note: 'TikTok, Reels, Shorts', w: 9, h: 16 },
  { id: '16:9', label: 'Widescreen', note: 'YouTube, X', w: 16, h: 9 },
  { id: '1:1', label: 'Square', note: 'Feed posts', w: 1, h: 1 },
  { id: '4:5', label: 'Portrait', note: 'Instagram feed', w: 4, h: 5 },
]

export const LENGTHS: { value: LengthChoice; label: string }[] = [
  { value: 15, label: '15s' },
  { value: 30, label: '30s' },
  { value: 45, label: '45s' },
  { value: 60, label: '60s' },
  { value: 'full', label: 'Full song' },
]

/** Output pixel size for an aspect at a resolution (the short side), rounded to even numbers. */
export function outputSize(aspect: AspectId, shortSide: number): { width: number; height: number } {
  const a = ASPECTS.find((x) => x.id === aspect)!
  const even = (n: number) => Math.round(n / 2) * 2
  return a.w >= a.h
    ? { width: even((shortSide * a.w) / a.h), height: shortSide }
    : { width: shortSide, height: even((shortSide * a.h) / a.w) }
}

const KEY = 'autoclip:settings'

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_SETTINGS
    const saved = JSON.parse(raw) as Partial<Settings> & { fit?: FitMode }
    // Framing used to be a plain choice; a crop was the default, anything else was picked on purpose.
    if (saved.fit && !saved.framing && saved.fit !== 'fill') saved.framing = saved.fit
    delete saved.fit
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      captions: { ...DEFAULT_SETTINGS.captions, ...saved.captions },
      voiceover: { ...DEFAULT_SETTINGS.voiceover, ...saved.voiceover },
      nameplate: { ...DEFAULT_SETTINGS.nameplate, ...saved.nameplate },
      export: { ...DEFAULT_SETTINGS.export, ...saved.export },
      mix: { ...DEFAULT_SETTINGS.mix, ...saved.mix },
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* private mode or full storage: settings just won't persist */
  }
}

/** One-tap mixes for the usual asks. */
export const MIX_PRESETS: { id: string; name: string; note: string; mix: ContentMix }[] = [
  {
    id: 'everything',
    name: 'Everything',
    note: 'A bit of it all, in the right places',
    mix: { finish: 'some', action: 'some', broll: 'some', celebrate: 'some', talk: 'some', text: 'none' },
  },
  {
    id: 'highlights',
    name: 'Highlights + B-roll',
    note: 'The big moments, with some b-roll around them',
    mix: { finish: 'more', action: 'some', broll: 'some', celebrate: 'some', talk: 'none', text: 'none' },
  },
  {
    id: 'action',
    name: 'Just the action',
    note: 'Big moments and action, nothing else',
    mix: { finish: 'more', action: 'more', broll: 'none', celebrate: 'none', talk: 'none', text: 'none' },
  },
  {
    id: 'story',
    name: 'The story',
    note: 'Set the scene, the action, the peak, the celebration',
    mix: { finish: 'more', action: 'some', broll: 'more', celebrate: 'more', talk: 'none', text: 'none' },
  },
]
