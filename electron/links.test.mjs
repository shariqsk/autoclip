// Plain-node checks for the desktop link importer's pure parts (run by vitest).
import { describe, expect, it } from 'vitest'
import { chooseFormats, classifyLink, isTransient, pickMatch } from './links.mjs'

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

  it('retries refused or flaky streams, not links that will never work', () => {
    const e = (m) => new Error(m)
    expect(isTransient(e('unable to download video data: HTTP Error 403: Forbidden'))).toBe(true)
    expect(isTransient(e('HTTP Error 429: Too Many Requests'))).toBe(true)
    expect(isTransient(e('HTTP Error 503: Service Unavailable'))).toBe(true)
    expect(isTransient(e('Connection reset by peer'))).toBe(true)
    expect(isTransient(e('Video unavailable. This video is private'))).toBe(false)
    expect(isTransient(e('HTTP Error 404: Not Found'))).toBe(false)
    expect(isTransient(e('Cancelled'))).toBe(false)
  })
})

import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { deflateRawSync } from 'node:zlib'
import { unzip } from './unzip.mjs'

/** Build a tiny zip by hand: one deflated file (mode 755) and one stored file. */
function makeZip(entries) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const { name, data, mode, deflate } of entries) {
    const body = deflate ? deflateRawSync(data) : data
    const nameBuf = Buffer.from(name)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(deflate ? 8 : 0, 8)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    locals.push(local, nameBuf, body)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(deflate ? 8 : 0, 10)
    central.writeUInt32LE(body.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt32LE((mode << 16) >>> 0, 38)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, nameBuf)
    offset += 30 + nameBuf.length + body.length
  }
  const cd = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(cd.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, end])
}

describe('unzip', () => {
  it('extracts stored and deflated files and keeps the executable bit', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'autoclip-zip-'))
    const zip = path.join(dir, 'a.zip')
    const text = Buffer.from('hello hello hello hello')
    await writeFile(
      zip,
      makeZip([
        { name: 'tool/run', data: text, mode: 0o100755, deflate: true },
        { name: 'tool/lib.txt', data: Buffer.from('x'), mode: 0o100644 },
      ]),
    )
    await unzip(zip, path.join(dir, 'out'))
    expect(String(await readFile(path.join(dir, 'out/tool/run')))).toBe(String(text))
    if (process.platform !== 'win32') expect((await import('node:fs')).statSync(path.join(dir, 'out/tool/run')).mode & 0o111).toBeTruthy()
  })

  it('refuses paths that escape the folder', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'autoclip-zip-'))
    const zip = path.join(dir, 'bad.zip')
    await writeFile(zip, makeZip([{ name: '../evil', data: Buffer.from('x'), mode: 0o100644 }]))
    await expect(unzip(zip, path.join(dir, 'out'))).rejects.toThrow(/Unsafe/)
  })
})
