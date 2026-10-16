import { describe, expect, it } from 'vitest'
import { hashtagsFor, postKit, postText, splitSong, toHashtag, type PostInput } from './post'

const base: PostInput = {
  platform: 'tiktok',
  subjects: ['Islam Makhachev'],
  title: 'Main Event',
  song: 'Wallows - Bad Dream',
  style: { id: 'spotlight', name: 'Spotlight', group: 'cinematic' },
  seed: 3,
}

describe('post kit', () => {
  it('splits a song into artist and track, and drops the junk', () => {
    expect(splitSong('Wallows - Bad Dream (Official Audio).mp3')).toEqual({ artist: 'Wallows', track: 'Bad Dream' })
    expect(splitSong('demo beat.wav')).toEqual({ artist: null, track: 'demo beat' })
  })

  it('makes hashtags from names in any script', () => {
    expect(toHashtag('Islam Makhachev')).toBe('islammakhachev')
    expect(toHashtag('Петр Ян')).toBe('петрян')
    expect(toHashtag('!')).toBeNull()
  })

  it('leads with who it is about, and keeps to what each platform rewards', () => {
    const tiktok = hashtagsFor(base)
    expect(tiktok[0]).toBe('islammakhachev')
    expect(tiktok).toContain('wallows')
    expect(tiktok.length).toBeLessThanOrEqual(5)
    const shorts = hashtagsFor({ ...base, platform: 'shorts' })
    expect(shorts[0]).toBe('shorts')
    expect(shorts).toHaveLength(3)
    expect(new Set(tiktok).size).toBe(tiktok.length)
  })

  it('writes every tone, credits the song, and titles Shorts', () => {
    const kit = postKit({ ...base, platform: 'shorts' })
    for (const text of Object.values(kit.captions)) expect(text.length).toBeGreaterThan(3)
    expect(kit.captions.hype).toContain('Islam Makhachev')
    expect(kit.captions.story).toContain('🎵 Wallows - Bad Dream')
    expect(kit.title.endsWith('#shorts')).toBe(true)
    expect(kit.title.length).toBeLessThanOrEqual(100)
  })

  it('still has something to say with nobody named', () => {
    const kit = postKit({ ...base, subjects: [], title: '' })
    expect(kit.captions.minimal).toBe('Bad Dream')
    expect(kit.hashtags.length).toBeGreaterThan(1)
  })

  it('puts the hashtags after the caption', () => {
    expect(postText('Hi', ['a', 'b'])).toBe('Hi\n\n#a #b')
    expect(postText('Hi', [])).toBe('Hi')
  })
})
