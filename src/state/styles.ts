// Styles learned from the user's own reference edits. Kept on this device (localStorage), alongside
// the measurements they came from so a style can be re-learned with more references later.

import { useSyncExternalStore } from 'react'
import { setLearnedStyles, STYLES, type StyleId, type StylePreset } from '../lib/edit/presets'
import type { EditMeasure } from '../lib/learn/measure'

export interface SavedStyle {
  preset: StylePreset
  facts: string[]
  basedOn: string
  references: EditMeasure[]
  createdAt: number
}

const KEY = 'autoclip:learned-styles'
const listeners = new Set<() => void>()

function load(): SavedStyle[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(list) ? list.filter((s) => s?.preset?.id?.startsWith('learned-')) : []
  } catch {
    return []
  }
}

let saved = load()
let all: StylePreset[] = []

function publish() {
  setLearnedStyles(saved.map((s) => s.preset))
  all = [...STYLES, ...saved.map((s) => s.preset)]
  listeners.forEach((l) => l())
}
publish()

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved))
  } catch {
    // Full storage: keep the style for this session anyway.
  }
  publish()
}

export function newLearnedId(name: string): StyleId {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 24) || 'style'
  return `learned-${slug}-${Date.now().toString(36)}`
}

/** Add a learned style, or replace one with the same id (keeping when it was first made). */
export function saveLearnedStyle(style: Omit<SavedStyle, 'createdAt'>) {
  const createdAt = getSavedStyle(style.preset.id)?.createdAt ?? Date.now()
  saved = [...saved.filter((s) => s.preset.id !== style.preset.id), { ...style, createdAt }]
  persist()
}

export function removeLearnedStyle(id: StyleId) {
  saved = saved.filter((s) => s.preset.id !== id)
  persist()
}

export function getSavedStyle(id: string): SavedStyle | undefined {
  return saved.find((s) => s.preset.id === id)
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Built-in styles first, then the learned ones. */
export function useAllStyles(): StylePreset[] {
  return useSyncExternalStore(subscribe, () => all)
}

export function useSavedStyles(): SavedStyle[] {
  return useSyncExternalStore(subscribe, () => saved)
}
