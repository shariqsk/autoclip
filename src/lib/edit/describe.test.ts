import { describe, expect, it } from 'vitest'
import { styleFeatures } from './describe'
import { getStyle, STYLES } from './presets'

describe('styleFeatures', () => {
  it('says what each style does, in a handful of words', () => {
    for (const s of STYLES) {
      const f = styleFeatures(s)
      expect(f.length).toBeGreaterThan(2)
      expect(new Set(f).size).toBe(f.length)
    }
  })

  it('names the signature moves of the styles taken from reference edits', () => {
    expect(styleFeatures(getStyle('lyric'))).toEqual(expect.arrayContaining(['Light leaks', 'Title behind people', 'Subtitle captions']))
    expect(styleFeatures(getStyle('rush'))).toEqual(expect.arrayContaining(['Fast cuts', 'Motion blur', 'Stack captions']))
    expect(styleFeatures(getStyle('spotlight'))).toEqual(expect.arrayContaining(['Whole shot on black', 'Bleach grade']))
    expect(styleFeatures(getStyle('smooth'))).toContain('Picture in picture')
  })

  it('files every built-in style under a group', () => {
    for (const s of STYLES) expect(['hype', 'cinematic', 'chill']).toContain(s.group)
  })
})
