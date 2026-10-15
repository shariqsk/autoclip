import { describe, expect, it } from 'vitest'
import { linkProblem, parseLink } from './links'

describe('links', () => {
  it('recognises the sites people paste', () => {
    expect(parseLink('https://open.spotify.com/track/4PTG3Z6ehGkBFwjybzWkR8?si=x')?.site).toBe('Spotify')
    expect(parseLink('https://youtu.be/dQw4w9WgXcQ')).toMatchObject({ site: 'YouTube', kind: 'either' })
    expect(parseLink('https://m.youtube.com/watch?v=abc')?.site).toBe('YouTube')
    expect(parseLink('https://music.youtube.com/watch?v=abc')?.kind).toBe('audio')
    expect(parseLink('https://www.tiktok.com/@ufc/video/123')?.site).toBe('TikTok')
    expect(parseLink('https://www.instagram.com/reel/abc/')?.kind).toBe('video')
    expect(parseLink('https://soundcloud.com/a/b')?.kind).toBe('audio')
    expect(parseLink('https://x.com/ufc/status/1')?.site).toBe('X')
  })

  it('rejects non-links and explains Spotify playlists', () => {
    expect(parseLink('hello')).toBeNull()
    expect(parseLink('ftp://example.com/x')).toBeNull()
    expect(linkProblem('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')).toMatch(/track link/)
    expect(linkProblem('https://open.spotify.com/track/4PTG3Z6ehGkBFwjybzWkR8')).toBeNull()
  })
})
