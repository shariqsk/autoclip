// Links in the app: recognising them, and turning what the desktop shell downloads into files the
// rest of AutoClip already knows how to handle.

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

/**
 * Turn a desktop download into a File. It's read from disk through the app's own scheme (the shell
 * never sends the bytes over itself), so even a long video is handled without copying it around.
 */
export async function toFile(result: ImportResult, mode: 'audio' | 'video'): Promise<File> {
  const { name, ext } = result.file
  const res = await fetch(`${location.origin}/__import/${name}`)
  if (!res.ok) throw new Error("Couldn't open the download")
  const blob = await res.blob()
  const type = MIME[ext] ?? (mode === 'audio' ? 'audio/mp4' : 'video/mp4')
  return new File([blob], `${safeName(result.title)}.${ext}`, { type })
}
