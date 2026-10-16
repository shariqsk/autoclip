// Looks: four layouts (structure and shape) and three colourways for each. Saved per device.

import { useEffect, useSyncExternalStore } from 'react'

export type LayoutId = 'deck' | 'studio' | 'flyer' | 'glass'

export interface Colorway {
  id: string
  name: string
  /** Background, panel, accent: for the picker's swatches. */
  swatch: [string, string, string]
}

export interface LayoutInfo {
  id: LayoutId
  name: string
  note: string
  colorways: Colorway[]
}

export const LAYOUTS: LayoutInfo[] = [
  {
    id: 'deck',
    name: 'Deck',
    note: 'A hardware sampler: an LCD, keys and knobs',
    colorways: [
      { id: 'deck-bone', name: 'Bone', swatch: ['#d9d4c7', '#efebe1', '#ff5a1f'] },
      { id: 'deck-graphite', name: 'Graphite', swatch: ['#1f2023', '#2c2d31', '#ff3b30'] },
      { id: 'deck-neon', name: 'Neon', swatch: ['#07070b', '#121219', '#2bf5ff'] },
    ],
  },
  {
    id: 'studio',
    name: 'Studio',
    note: 'A pro editor: viewer, inspector and a big timeline',
    colorways: [
      { id: 'studio-graphite', name: 'Graphite', swatch: ['#16171a', '#1f2024', '#4c8dff'] },
      { id: 'studio-ivory', name: 'Ivory', swatch: ['#ecebe7', '#f8f7f4', '#ff5b2e'] },
      { id: 'studio-neon', name: 'Neon', swatch: ['#06060d', '#0e0e1a', '#b8ff3c'] },
    ],
  },
  {
    id: 'flyer',
    name: 'Flyer',
    note: 'A club flyer: chrome, holo and stickers that move to the beat',
    colorways: [
      { id: 'flyer-chrome', name: 'Chrome', swatch: ['#c9ccd6', '#eef0f5', '#7a3cff'] },
      { id: 'flyer-acid', name: 'Acid', swatch: ['#111111', '#1a1a1a', '#d4ff00'] },
      { id: 'flyer-neon', name: 'Neon', swatch: ['#0a0014', '#16002a', '#ff2bd6'] },
    ],
  },
  {
    id: 'glass',
    name: 'Glass',
    note: 'Your edit, blurred behind floating glass',
    colorways: [
      { id: 'glass-night', name: 'Night', swatch: ['#0c0d12', '#ffffff1f', '#ffffff'] },
      { id: 'glass-day', name: 'Day', swatch: ['#dfe3ea', '#ffffffa8', '#1d1d1f'] },
      { id: 'glass-neon', name: 'Neon', swatch: ['#050510', '#2bf5ff26', '#ff3dbb'] },
    ],
  },
]

const KEY = 'autoclip:look'
const DEFAULT = { layout: 'deck' as LayoutId, colorway: 'deck-bone' }

function read(): { layout: LayoutId; colorway: string } {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    const layout = LAYOUTS.find((l) => l.id === v?.layout)
    if (layout && layout.colorways.some((c) => c.id === v.colorway)) return { layout: layout.id, colorway: v.colorway }
  } catch {
    /* fall back */
  }
  return DEFAULT
}

let current = read()
const listeners = new Set<() => void>()

function apply() {
  const el = document.documentElement
  el.dataset.layout = current.layout
  el.dataset.theme = current.colorway
  const sw = LAYOUTS.find((l) => l.id === current.layout)!.colorways.find((c) => c.id === current.colorway)!.swatch
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', sw[0])
}

export function setLook(layout: LayoutId, colorway?: string) {
  const info = LAYOUTS.find((l) => l.id === layout)!
  const keep = info.colorways.findIndex((c) => c.id === current.colorway.replace(/^[a-z]+-/, `${layout}-`))
  current = { layout, colorway: colorway ?? info.colorways[Math.max(0, keep)].id }
  localStorage.setItem(KEY, JSON.stringify(current))
  apply()
  listeners.forEach((l) => l())
}

/** ⌘. flips through every colourway of the current layout, then on to the next layout. */
export function cycleLook() {
  const flat = LAYOUTS.flatMap((l) => l.colorways.map((c) => [l.id, c.id] as const))
  const i = flat.findIndex(([, c]) => c === current.colorway)
  const [layout, colorway] = flat[(i + 1) % flat.length]
  setLook(layout, colorway)
}

export function useLook() {
  const look = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
  useEffect(apply, [])
  return { ...look, cycle: cycleLook }
}
