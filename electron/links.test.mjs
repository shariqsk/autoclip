// Plain-node checks for the desktop link importer's pure parts (run by vitest).
import { describe, expect, it } from 'vitest'
import { chooseFormats, classifyLink, pickMatch } from './links.mjs'

const f = (id, o) => ({ format_id: id, protocol: 'https', url: 'x', ...o })

describe('desktop link importer', () => {
  it('classifies Spotify tracks', () => {
    expect(classifyLink('https://open.spotify.com/intl-de/track/4PTG3Z6ehGkBFwjybzWkR8')).toMatchObject({
      site: 'Spotify',
      spotifyTrack: '4PTG3Z6ehGkBFwjybzWkR8',
    })
    expect(classifyLink('https://open.spotify.com/album/1')?.spotifyTrack).toBeNull()
  })

  it('picks the same recording, not a cover or a sped-up edit', () => {
    const track = { title: 'Never Gonna Give You Up', artists: ['Rick Astley'], duration: 213.5 }
    const m = pickMatch(
      [
        { id: 'sped', title: 'Never Gonna Give You Up (sped up)', channel: 'Edits', duration: 170 },
        { id: 'cover', title: 'Never Gonna Give You Up cover', channel: 'Someone', duration: 214 },
        { id: 'topic', title: 'Never Gonna Give You Up', channel: 'Rick Astley - Topic', duration: 214 },
      ],
      track,
    )
    expect(m?.id).toBe('topic')
    expect(pickMatch([{ id: 'x', title: 'Unrelated', channel: 'Nope', duration: 30 }], track)).toBeNull()
  })

  it('downloads AAC for songs and H.264 up to 1080p for footage', () => {
    const formats = [
      f('140', { ext: 'm4a', vcodec: 'none', acodec: 'mp4a.40.2', abr: 128 }),
      f('251', { ext: 'webm', vcodec: 'none', acodec: 'opus', abr: 160 }),
      f('18', { ext: 'mp4', vcodec: 'avc1.42001E', acodec: 'mp4a.40.2', height: 360 }),
      f('137', { ext: 'mp4', vcodec: 'avc1.640028', acodec: 'none', height: 1080 }),
      f('248', { ext: 'webm', vcodec: 'vp9', acodec: 'none', height: 1080 }),
      f('401', { ext: 'mp4', vcodec: 'av01', acodec: 'none', height: 2160 }),
      f('hls', { ext: 'mp4', vcodec: 'avc1', acodec: 'mp4a', height: 1080, protocol: 'm3u8_native' }),
    ]
    expect(chooseFormats({ formats }, 'audio')).toEqual([{ id: '140', ext: 'm4a', role: 'audio' }])
    expect(chooseFormats({ formats }, 'video')).toEqual([
      { id: '137', ext: 'mp4', role: 'video' },
      { id: '140', ext: 'm4a', role: 'audio' },
    ])
    // A ready-made 720p+ file wins (TikTok and most other sites).
    expect(chooseFormats({ formats: [f('h264_720', { ext: 'mp4', vcodec: 'h264', acodec: 'aac', height: 1024 })] }, 'video')).toEqual([
      { id: 'h264_720', ext: 'mp4', role: 'av' },
    ])
  })
})
