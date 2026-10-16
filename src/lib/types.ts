// Shared shapes for the whole pipeline: song analysis → clip analysis → edit plan → render.
// Everything here is plain data, so it can cross worker boundaries and be unit-tested.

/** Where a beat sits in the song: a bar's first beat, a regular beat, or an off-beat subdivision. */
export type BeatKind = 'downbeat' | 'beat'

export interface Beat {
  /** Seconds from the start of the song. */
  time: number
  kind: BeatKind
  /** Index of the bar this beat belongs to. */
  bar: number
  /** Onset strength at the beat, 0–1 across the song. */
  strength: number
  /** Loudness around the beat, 0–1 across the song. */
  energy: number
}

export type SectionLabel = 'intro' | 'verse' | 'build' | 'drop' | 'break' | 'outro'

export interface Section {
  start: number
  end: number
  label: SectionLabel
  /** Mean loudness, 0–1 relative to the loudest section. */
  energy: number
}

export interface Drop {
  /** The exact hit: the downbeat where the energy lands. */
  time: number
  /** How hard it hits, 0–1. The biggest drop in the song is 1. */
  strength: number
}

export interface SongAnalysis {
  duration: number
  bpm: number
  /** 0–1: how sure the tempo tracker is. Low for ambient or rubato music. */
  confidence: number
  beats: Beat[]
  sections: Section[]
  drops: Drop[]
  /** Attacks that stand out from their surroundings (strums, stabs, fills), on or off the grid. */
  hits?: { time: number; strength: number }[]
  /** Smoothed loudness envelope, one value per `envelopeRate` seconds, 0–1. */
  envelope: number[]
  envelopeRate: number
  /** A small min/max waveform for drawing, `peaks.length / 2` buckets across the song. */
  peaks: number[]
}

export type ClipKind = 'video' | 'image'

/** What we learned from looking at (and listening to) one clip. */
export interface ClipAnalysis {
  duration: number
  width: number
  height: number
  fps: number
  /** Sample times in seconds. All arrays below are aligned with this. */
  times: number[]
  /** Frame-to-frame change, 0–1 within this clip's own range and absolute-ish across clips. */
  motion: number[]
  /** Mean luma, 0–1. */
  brightness: number[]
  /** Edge detail, 0–1; low means blurry or a flat frame. */
  sharpness: number[]
  /** Loudness of the clip's own soundtrack (crowd roar, impact), 0–1. Zero when silent. */
  loudness: number[]
  /** Where the action is horizontally / vertically, 0–1, used for smart reframing. */
  focusX: number[]
  focusY: number[]
  /** Combined "this is a highlight" score, 0–1. */
  interest: number[]
  /** Hard cuts inside the clip (it may already be an edit). A shot never spans one of these. */
  cuts: number[]
}

export interface Clip {
  id: string
  name: string
  kind: ClipKind
  file: File
  /** Object URL for previews. */
  url: string
  /** Small poster frames for the UI. */
  thumbs: string[]
  analysis: ClipAnalysis | null
  status: 'queued' | 'analyzing' | 'ready' | 'error'
  progress: number
  error?: string
  /** Users can mark a clip as a must-use hero or exclude it without deleting it. */
  pin?: 'hero' | 'skip'
  /**
   * For a moment cut from a longer clip: where it starts in the file, in seconds. The analysis and
   * every shot use the moment's own time (from zero); playback adds this when it seeks the file.
   */
  offset?: number
  /** The clip a moment was cut from. */
  momentOf?: string
}

export type TransitionType = 'cut' | 'fade' | 'flash' | 'zoom' | 'whip' | 'glitch' | 'dip' | 'spin'

export interface Transition {
  type: TransitionType
  /** Seconds. Centered on the cut: half before, half after. */
  duration: number
}

/** How playback speed changes across a shot. */
export type SpeedRamp =
  | { kind: 'constant'; speed: number }
  /** Fast → slow → fast: the classic "velocity" edit. */
  | { kind: 'velocity'; fast: number; slow: number }
  /** Starts slow and snaps to speed: lands a hit in slow motion. */
  | { kind: 'ease-in'; from: number; to: number }
  /** Slow motion into the impact, then the frame freezes: the "aura" hold on a knockout. */
  | { kind: 'freeze'; from: number; at: number }

export interface ShotFx {
  /** Push-in punches on every beat inside the shot. */
  pulse: number
  /** Camera shake on hits, 0–1. */
  shake: number
  /** Chromatic aberration on hits, 0–1. */
  rgb: number
  /** White flash at the start, 0–1. */
  flash: number
  /** Slow push-in across the whole shot, as a fraction of the frame (0.08 = 8%). */
  push: number
  /** Drain the colour, 0–1. Intros often run in black and white until the drop hits. */
  mono?: number
  /** Tempo-locked flicker, 0–1, for tension in builds. */
  strobe?: number
}

/** Where a shot sits in the edit's arc. */
export type ShotPhase = 'tease' | 'intro' | 'build' | 'hero' | 'flurry' | 'ride' | 'outro'

export interface Shot {
  id: string
  clipId: string
  /** Position in the edit, seconds from the edit's start. */
  start: number
  end: number
  /** Where in the clip this shot starts, in seconds. */
  srcStart: number
  speed: SpeedRamp
  /** Transition from the previous shot into this one. */
  transition: Transition
  fx: ShotFx
  /** The beat-sync reason, shown in the director's view. */
  reason: string
  /** Locked shots survive a remix. */
  locked?: boolean
  /** The energy of the music under this shot, 0–1. */
  energy: number
  phase?: ShotPhase
}

/** A rhythmic accent inside the edit: drives zoom punches, shakes and flashes. */
export interface Hit {
  time: number
  strength: number
  kind: 'beat' | 'downbeat' | 'drop'
}

export type CaptionStyle = 'pop' | 'karaoke' | 'impact' | 'clean' | 'glitch' | 'typewriter'
export type CaptionPosition = 'top' | 'center' | 'bottom'

export interface CaptionWord {
  text: string
  start: number
  end: number
}

export interface CaptionLine {
  id: string
  start: number
  end: number
  words: CaptionWord[]
  /** Title cards are big, centered and always styled 'impact'. */
  title?: boolean
  /** A fighter nameplate: the words are the name, `sub` the line under it (record, nickname). */
  nameplate?: { sub: string }
}

export interface EditPlan {
  /** Where the edit starts and ends in the song, seconds. */
  songStart: number
  songEnd: number
  shots: Shot[]
  hits: Hit[]
  captions: CaptionLine[]
  seed: number
  /** Tempo, for tempo-locked effects. */
  bpm?: number
  /** Seconds of fade to black at the very end. */
  fadeOut?: number
}

export type AspectId = '9:16' | '16:9' | '1:1' | '4:5'
export type FitMode = 'fill' | 'blur'

export type Grade = 'none' | 'punch' | 'teal-orange' | 'mono' | 'warm' | 'cold' | 'vintage' | 'neon'

/** One face seen in one sampled frame of a clip. */
export interface FaceSighting {
  /** Seconds, in the clip's own time. */
  t: number
  /** Normalized box: left, top, width, height (0–1 of the frame). */
  box: [number, number, number, number]
  /** Detector confidence, 0–1. */
  score: number
  /** 128-number identity fingerprint: near for the same person, far for different people. */
  descriptor: Float32Array
  /** The person it was grouped into, once people are found. */
  personId?: string
}

/** The faces found in a clip, sampled every `step` seconds. */
export interface ClipFaces {
  step: number
  sightings: FaceSighting[]
}

export type CastRole = 'star' | 'cut' | null

/** Someone who keeps showing up across the footage. */
export interface Person {
  id: string
  name: string
  /** Star: build the edit around them. Cut: keep them out. */
  role: CastRole
  /**
   * Their fingerprints (one per look: a person merged by hand, or seen front-on and side-on, has
   * several), to recognize them again when more footage comes in.
   */
  centroids: number[][]
  sightings: number
  /** Seconds of footage they're in, roughly. */
  seconds: number
  clipIds: string[]
  /** Their clearest, biggest face, for the portrait. */
  best: { clipId: string; t: number; box: [number, number, number, number] }
  /** The portrait (an object URL), once grabbed. */
  thumb?: string
}
