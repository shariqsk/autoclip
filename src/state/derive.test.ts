import { describe, expect, it } from 'vitest'
import { analyzeSong } from '../lib/audio/analyze'
import { synthesizeDemoSong } from '../lib/demo/song'
import type { EditPlan } from '../lib/types'
import { captionsFor } from './actions'
import { captionOptionsFor, lookFor, renderPlan, voiceoverAt } from './derive'
import { DEFAULT_SETTINGS } from './settings'
import type { Draft } from './store'

const song = analyzeSong(synthesizeDemoSong(22050).samples, { sampleRate: 22050 })
const drop = song.drops[0].time
const plan: EditPlan = {
  songStart: drop - 8,
  songEnd: drop + 8,
  shots: [
    {
      id: 'a',
      clipId: 'c',
      start: 0,
      end: 16,
      srcStart: 0,
      speed: { kind: 'constant', speed: 1 },
      transition: { type: 'cut', duration: 0 },
      fx: { pulse: 0.1, shake: 0.5, rgb: 0.5, flash: 0.8, push: 0.05 },
      reason: '',
      energy: 1,
    },
  ],
  hits: [{ time: 8, strength: 1, kind: 'drop' }],
  captions: [],
  seed: 1,
}
const draft: Draft = { id: 'd', name: 'Hype #1', style: 'hype', plan, createdAt: 0, past: [], future: [] }
const inputs = (captions: Partial<typeof DEFAULT_SETTINGS.captions>, intensity = 1) => ({
  settings: { ...DEFAULT_SETTINGS, intensity, captions: { ...DEFAULT_SETTINGS.captions, ...captions } },
  words: null,
  fileCaptions: null,
  song: { name: 'demo', file: null, buffer: null, analysis: song, status: 'ready' as const, progress: 1, stage: '' },
})

describe('derived render state', () => {
  it('uses the style look unless overridden', () => {
    expect(lookFor('phonk', DEFAULT_SETTINGS).grade).toBe('mono')
    expect(lookFor('phonk', { ...DEFAULT_SETTINGS, grade: 'warm' }).grade).toBe('warm')
  })

  it('scales effects by intensity', () => {
    const p = renderPlan(draft, inputs({}, 0.5))
    expect(p.shots[0].fx.shake).toBeCloseTo(0.25)
    expect(renderPlan(draft, inputs({}, 1)).shots).toBe(plan.shots)
  })

  it('lands beat text right before the drop', () => {
    const lines = captionsFor(draft, inputs({ source: 'text', beatText: 'WHO IS THE GOAT' }))
    expect(lines.map((l) => l.words[0].text)).toEqual(['WHO', 'IS', 'THE', 'GOAT'])
    const last = lines.at(-1)!
    expect(last.start).toBeLessThan(8)
    expect(last.end).toBeCloseTo(8, 1)
  })

  it('puts a title card first and holds other captions until it ends', () => {
    const lines = captionsFor(draft, inputs({ source: 'text', beatText: 'GO', title: 'Main event' }))
    expect(lines[0].title).toBe(true)
    expect(lines[0].start).toBe(0)
    for (const l of lines.slice(1)) expect(l.start).toBeGreaterThanOrEqual(lines[0].end - 0.01)
  })

  it('puts the title card on the drop or at the end when asked', () => {
    const onDrop = captionsFor(draft, inputs({ title: 'Main event', titleAt: 'drop' })).find((l) => l.title)!
    expect(onDrop.start).toBeCloseTo(8, 1)
    const atEnd = captionsFor(draft, inputs({ title: 'Main event', titleAt: 'end' })).find((l) => l.title)!
    expect(atEnd.end).toBeCloseTo(16, 1)
    expect(atEnd.start).toBeGreaterThan(11)
  })

  it('follows the style for the title look unless you pick one', () => {
    expect(captionOptionsFor('hype', DEFAULT_SETTINGS).titleLook).toBe('slam')
    const picked = { ...DEFAULT_SETTINGS, captions: { ...DEFAULT_SETTINGS.captions, titleLook: 'spread' as const } }
    expect(captionOptionsFor('hype', picked).titleLook).toBe('spread')
  })

  it('times a drop voiceover to finish on the drop', () => {
    expect(voiceoverAt(plan, 'drop', 2)).toBeCloseTo(8 - 2 - 0.08)
    expect(voiceoverAt(plan, 'intro', 2)).toBe(0.2)
  })
})

describe('effects', () => {
  it('follows the style for leaks, glow, motion blur and framing unless you set them', () => {
    const look = lookFor('hype', DEFAULT_SETTINGS)
    expect(look.fit).toBe('fill')
    expect(look.leaks).toBe(0)
    const mine = lookFor('hype', { ...DEFAULT_SETTINGS, leaks: 0.7, glow: 0.4, blur: 0.5, framing: 'bars' })
    expect(mine).toMatchObject({ leaks: 0.7, glow: 0.4, blur: 0.5, fit: 'bars' })
  })
})

describe('cinema bars', () => {
  it('draws a style’s bars on widescreen only, but always when you turn them on', () => {
    expect(lookFor('cinematic', { ...DEFAULT_SETTINGS, aspect: '16:9' }).letterbox).toBe(true)
    expect(lookFor('cinematic', { ...DEFAULT_SETTINGS, aspect: '9:16' }).letterbox).toBe(false)
    expect(lookFor('cinematic', { ...DEFAULT_SETTINGS, aspect: '1:1' }).letterbox).toBe(false)
    expect(lookFor('hype', { ...DEFAULT_SETTINGS, aspect: '9:16', letterbox: true }).letterbox).toBe(true)
  })
})
