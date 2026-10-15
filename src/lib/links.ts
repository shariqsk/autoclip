// Links in the app: recognising them, and turning what the desktop shell downloads into files the
// rest of AutoClip already knows how to handle.

import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  Mp4OutputFormat,
  Output,
} from 'mediabunny'
import type { ImportResult } from './desktop'

export interface LinkInfo {
  site: string
  /** What the link is most likely for. */
  kind: 'audio' | 'video' | 'either'
}

const SITES: [RegExp, string, LinkInfo['kind']][] = [
  [/^open\.spotify\.com$|^spotify\.link$/, 'Spotify', 'audio'],
  [/^music\.youtube\.com$/, 'YouTube Music', 'audio'],
  [/(^|\.)youtube\.com$|^youtu\.be$/, 'YouTube', 'either'],
  [/(^|\.)tiktok\.com$/, 'TikTok', 'either'],
  [/(^|\.)instagram\.com$/, 'Instagram', 'video'],
  [/(^|\.)soundcloud\.com$/, 'SoundCloud', 'audio'],
  [/(^|\.)(twitter|x)\.com$/, 'X', 'video'],
  [/(^|\.)vimeo\.com$/, 'Vimeo', 'video'],
  [/(^|\.)bandcamp\.com$/, 'Bandcamp', 'audio'],
]

export function parseLink(raw: string): (LinkInfo & { url: string }) | null {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (!/^https?:$/.test(url.protocol)) return null
  const host = url.hostname.replace(/^www\.|^m\./, '')
  for (const [re, site, kind] of SITES) if (re.test(host)) return { site, kind, url: url.toString() }
  return { site: host, kind: 'either', url: url.toString() }
}

/** Spotify playlists and albums can't be imported as one song. */
export function linkProblem(raw: string): string | null {
  const l = parseLink(raw)
  if (!l) return null
  if (l.site === 'Spotify' && !/\/track\//.test(l.url)) return 'Paste a Spotify track link, not a playlist or album.'
  return null
}

const MIME: Record<string, string> = {
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  webm: 'video/webm',
  opus: 'audio/ogg',
  ogg: 'audio/ogg',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
}

const safeName = (s: string) =>
  s
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'Imported'

/** Copy a video stream and an audio stream into one MP4, without re-encoding either. */
export async function mergeStreams(video: Blob, audio: Blob): Promise<Blob> {
  const vIn = new Input({ source: new BlobSource(video), formats: ALL_FORMATS })
  const aIn = new Input({ source: new BlobSource(audio), formats: ALL_FORMATS })
  try {
    const vTrack = await vIn.getPrimaryVideoTrack()
    const aTrack = await aIn.getPrimaryAudioTrack()
    if (!vTrack) throw new Error('No video stream')
    const target = new BufferTarget()
    const out = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target })
    const vCodec = await vTrack.getCodec()
    const vSrc = new EncodedVideoPacketSource(vCodec!)
    out.addVideoTrack(vSrc, { rotation: await vTrack.getRotation() })
    let aSrc: EncodedAudioPacketSource | null = null
    const aCodec = aTrack ? await aTrack.getCodec() : null
    if (aTrack && aCodec) {
      aSrc = new EncodedAudioPacketSource(aCodec)
      out.addAudioTrack(aSrc)
    }
    await out.start()
    const vConfig = await vTrack.getDecoderConfig()
    let first = true
    for await (const packet of new EncodedPacketSink(vTrack).packets()) {
      await vSrc.add(packet, first && vConfig ? { decoderConfig: vConfig } : undefined)
      first = false
    }
    vSrc.close()
    if (aTrack && aSrc) {
      const aConfig = await aTrack.getDecoderConfig()
      first = true
      for await (const packet of new EncodedPacketSink(aTrack).packets()) {
        await aSrc.add(packet, first && aConfig ? { decoderConfig: aConfig } : undefined)
        first = false
      }
      aSrc.close()
    }
    await out.finalize()
    return new Blob([target.buffer!], { type: 'video/mp4' })
  } finally {
    vIn.dispose()
    aIn.dispose()
  }
}

/** Turn a desktop download into one File: the song, or a clip (merging streams if needed). */
export async function toFile(result: ImportResult, mode: 'audio' | 'video'): Promise<File> {
  const name = safeName(result.title)
  const blobOf = (f: ImportResult['files'][number]) =>
    new Blob([f.data as Uint8Array<ArrayBuffer>], { type: MIME[f.ext] ?? 'application/octet-stream' })
  const video = result.files.find((f) => f.role === 'video')
  const audio = result.files.find((f) => f.role === 'audio')
  const both = result.files.find((f) => f.role === 'av')
  if (mode === 'audio') {
    const f = audio ?? both ?? result.files[0]
    return new File([blobOf(f)], `${name}.${f.ext}`, { type: MIME[f.ext] ?? 'audio/mp4' })
  }
  if (video && audio) return new File([await mergeStreams(blobOf(video), blobOf(audio))], `${name}.mp4`, { type: 'video/mp4' })
  const f = both ?? video ?? result.files[0]
  return new File([blobOf(f)], `${name}.${f.ext}`, { type: MIME[f.ext] ?? 'video/mp4' })
}
