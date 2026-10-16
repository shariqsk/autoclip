// Every user-facing choice, with defaults. Settings are saved to localStorage; media never is.

import type { StyleId } from '../lib/edit/presets'
import type { LengthChoice } from '../lib/edit/window'
import type { AspectId, CaptionPosition, CaptionStyle, FitMode, Grade } from '../lib/types'

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
  fit: FitMode
  order: 'best' | 'story'
  /** Cut on standout hits in the music (strums, stabs, fills), not only the beat. */
  hitCuts: boolean
  variety: number
  /** 'style' follows the edit style's look. */
  grade: Grade | 'style'
  grain: number | 'style'
  vignette: number | 'style'
  letterbox: boolean | 'style'
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
    /** Big title card at the start. */
    title: string
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
  fit: 'fill',
  order: 'best',
  hitCuts: true,
  variety: 0.6,
  grade: 'style',
  grain: 'style',
  vignette: 'style',
  letterbox: 'style',
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
  },
  nameplate: { name: '', sub: '' },
  handle: '',
  voiceover: { enabled: false, text: 'Ladies and gentlemen… this is the main event.', voice: 'am_michael', speed: 1, placement: 'intro' },
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
    const saved = JSON.parse(raw) as Partial<Settings>
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      captions: { ...DEFAULT_SETTINGS.captions, ...saved.captions },
      voiceover: { ...DEFAULT_SETTINGS.voiceover, ...saved.voiceover },
      nameplate: { ...DEFAULT_SETTINGS.nameplate, ...saved.nameplate },
      export: { ...DEFAULT_SETTINGS.export, ...saved.export },
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
