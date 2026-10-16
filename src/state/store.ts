// App state: the song, the clips, the drafts (every version of the edit you've made) and settings.
// A tiny external store read through useSyncExternalStore, so any component can subscribe to just
// the slice it needs.

import { useSyncExternalStore } from 'react'
import type { StyleId } from '../lib/edit/presets'
import type { CaptionLine, CaptionWord, Clip, ClipFaces, EditPlan, Person, SongAnalysis } from '../lib/types'
import { loadSettings, saveSettings, type Settings } from './settings'

export interface Song {
  name: string
  file: File | null
  buffer: AudioBuffer | null
  analysis: SongAnalysis | null
  status: 'decoding' | 'analyzing' | 'ready' | 'error'
  progress: number
  stage: string
  error?: string
}

export interface Draft {
  id: string
  name: string
  style: StyleId
  plan: EditPlan
  createdAt: number
  thumb?: string
  starred?: boolean
  /** Hand-edited captions replace the generated ones. */
  captionsOverride?: CaptionLine[]
  /** Undo/redo for hand edits in director mode. */
  past: EditPlan[]
  future: EditPlan[]
  /** True once you've changed anything by hand. */
  edited?: boolean
}

export interface Toast {
  id: number
  text: string
  tone: 'info' | 'error' | 'success'
  action?: { label: string; run: () => void }
}

/** A link being imported by the desktop app. */
export interface Download {
  id: string
  site: string
  mode: 'audio' | 'video'
  stage: string
  fraction: number | null
  error?: string
}

export interface AppState {
  song: Song | null
  clips: Clip[]
  drafts: Draft[]
  activeDraftId: string | null
  /** The take you were on before this one, for quick A/B comparing. */
  prevDraftId: string | null
  settings: Settings
  /** Word timings from Whisper, in song time, keyed by the song range they cover. */
  words: { key: string; words: CaptionWord[] } | null
  /** Captions imported from a .srt/.lrc file, in song time. */
  fileCaptions: CaptionLine[] | null
  fileCaptionsName: string | null
  /** Generated voiceover, keyed by text + voice + speed. */
  voice: { key: string; buffer: AudioBuffer } | null
  /** A song range picked by hand on the waveform, instead of the automatic choice. */
  windowOverride: { start: number; end: number } | null
  /** The drop, set by hand on the tape (song seconds), when the detected one is wrong. */
  dropOverride: number | null
  director: boolean
  exportOpen: boolean
  helpOpen: boolean
  /** The learn-a-style dialog: open fresh, or to add references to a learned style. */
  learn: { styleId: StyleId | null } | null
  /** The moments picker for a long clip. */
  moments: { clipId: string } | null
  /** Faces found in each clip, by clip id. */
  faces: Record<string, ClipFaces>
  /** The people found across the footage, and who's the star. */
  people: Person[]
  /** Looking for people: how far along, or null when idle. */
  peopleScan: { done: number; total: number; fraction: number } | null
  selectedShotId: string | null
  selectedCaptionId: string | null
  demoLoading: number | null
  downloads: Download[]
  /** The import-from-link dialog, open with a starting link and target. */
  linkDialog: { url: string; mode: 'audio' | 'video' | null } | null
  toasts: Toast[]
}

const initial: AppState = {
  song: null,
  clips: [],
  drafts: [],
  activeDraftId: null,
  prevDraftId: null,
  settings: loadSettings(),
  words: null,
  fileCaptions: null,
  fileCaptionsName: null,
  voice: null,
  windowOverride: null,
  dropOverride: null,
  director: false,
  exportOpen: false,
  helpOpen: false,
  learn: null,
  moments: null,
  faces: {},
  people: [],
  peopleScan: null,
  selectedShotId: null,
  selectedCaptionId: null,
  demoLoading: null,
  downloads: [],
  linkDialog: null,
  toasts: [],
}

let state: AppState = initial
const listeners = new Set<() => void>()

export function getState(): AppState {
  return state
}

export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
  const next = typeof patch === 'function' ? patch(state) : patch
  const settingsChanged = next.settings && next.settings !== state.settings
  state = { ...state, ...next }
  if (settingsChanged) saveSettings(state.settings)
  for (const l of listeners) l()
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useApp<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state))
}

export function updateSettings(patch: Partial<Settings> | ((s: Settings) => Partial<Settings>)) {
  setState((s) => ({ settings: { ...s.settings, ...(typeof patch === 'function' ? patch(s.settings) : patch) } }))
}

export function activeDraft(s: AppState = state): Draft | null {
  return s.drafts.find((d) => d.id === s.activeDraftId) ?? null
}

export function updateClip(id: string, patch: Partial<Clip>) {
  setState((s) => ({ clips: s.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))
}

export function updateDraft(id: string, patch: Partial<Draft> | ((d: Draft) => Partial<Draft>)) {
  setState((s) => ({ drafts: s.drafts.map((d) => (d.id === id ? { ...d, ...(typeof patch === 'function' ? patch(d) : patch) } : d)) }))
}

let toastId = 1
export function toast(text: string, tone: Toast['tone'] = 'info', action?: Toast['action']) {
  const id = toastId++
  setState((s) => ({ toasts: [...s.toasts, { id, text, tone, action }].slice(-4) }))
  setTimeout(() => dismissToast(id), tone === 'error' || action ? 7000 : 3800)
}

export function dismissToast(id: number) {
  setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}
