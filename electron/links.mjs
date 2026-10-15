// Import from a link (desktop only). Songs and footage come from YouTube, TikTok, Instagram,
// SoundCloud, X and the ~1,800 other sites yt-dlp supports. Spotify streams are DRM-protected, so a
// Spotify track link is resolved to its title, artists and length and matched to the same recording
// on YouTube instead.
//
// yt-dlp is downloaded on first use (or warmed up when the app starts) into the app's own data
// folder and refreshed every couple of weeks, since sites change often. No ffmpeg is needed: we only pick formats that are already
// playable files (or a separate video and audio stream, which the app merges itself).

import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { unzip } from './unzip.mjs'

const RELEASES = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/'
const REFRESH_DAYS = 14
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36'

function assetName() {
  if (process.platform === 'darwin') return 'yt-dlp_macos.zip'
  if (process.platform === 'win32') return process.arch === 'arm64' ? 'yt-dlp_win_arm64.zip' : 'yt-dlp_win.zip'
  return process.arch === 'arm64' ? 'yt-dlp_linux_aarch64.zip' : 'yt-dlp_linux.zip'
}

/** Which site a link is from, and whether it's a song source, a footage source or either. */
export function classifyLink(raw) {
  let url
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (!/^https?:$/.test(url.protocol)) return null
  const host = url.hostname.replace(/^www\.|^m\./, '')
  if (host === 'open.spotify.com' || host === 'spotify.link') {
    const m = url.pathname.match(/\/(?:intl-[a-z-]+\/)?track\/([A-Za-z0-9]+)/)
    return { site: 'Spotify', kind: 'audio', spotifyTrack: m?.[1] ?? null, url: url.toString() }
  }
  const sites = [
    [/(^|\.)youtube\.com$|^youtu\.be$|^music\.youtube\.com$/, 'YouTube', host.startsWith('music.') ? 'audio' : 'either'],
    [/(^|\.)tiktok\.com$/, 'TikTok', 'either'],
    [/(^|\.)instagram\.com$/, 'Instagram', 'video'],
    [/(^|\.)soundcloud\.com$/, 'SoundCloud', 'audio'],
    [/(^|\.)(twitter|x)\.com$/, 'X', 'video'],
    [/(^|\.)vimeo\.com$/, 'Vimeo', 'video'],
    [/(^|\.)twitch\.tv$/, 'Twitch', 'video'],
    [/(^|\.)reddit\.com$/, 'Reddit', 'video'],
    [/(^|\.)bandcamp\.com$/, 'Bandcamp', 'audio'],
  ]
  for (const [re, site, kind] of sites) if (re.test(host)) return { site, kind, url: url.toString() }
  return { site: host, kind: 'either', url: url.toString() }
}

/** Title, artists and length of a Spotify track, from its public embed page. */
export async function resolveSpotifyTrack(id) {
  const res = await fetch(`https://open.spotify.com/embed/track/${id}`, { headers: { 'user-agent': UA } })
  if (!res.ok) throw new Error(`Spotify answered ${res.status}`)
  const html = await res.text()
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)
  if (!m) throw new Error("Couldn't read that Spotify track")
  const entity = JSON.parse(m[1])?.props?.pageProps?.state?.data?.entity
  if (!entity?.name) throw new Error("Couldn't read that Spotify track")
  return {
    title: entity.name,
    artists: (entity.artists ?? []).map((a) => a.name),
    duration: (entity.duration ?? 0) / 1000,
  }
}

const VERSION_WORDS = [
  'live',
  'cover',
  'remix',
  'sped up',
  'slowed',
  'reverb',
  'nightcore',
  'karaoke',
  'instrumental',
  '8d',
  'piano',
  'acoustic',
  'mashup',
  'lyrics',
]

/** Pick the YouTube upload that is most likely the same recording as the Spotify track. */
export function pickMatch(entries, track) {
  const title = track.title.toLowerCase()
  const artists = track.artists.map((a) => a.toLowerCase())
  let best = null
  for (const e of entries) {
    if (!e?.id || !e.duration) continue
    const t = (e.title ?? '').toLowerCase()
    const ch = (e.channel ?? e.uploader ?? '').toLowerCase().replace(/ - topic$/, '')
    let score = -Math.abs(e.duration - track.duration) / 2
    if (Math.abs(e.duration - track.duration) > 15) score -= 10
    if (t.includes(title)) score += 4
    if (artists.some((a) => ch.includes(a) || a.includes(ch))) score += 4
    if (/ - topic$/i.test(e.channel ?? '')) score += 3
    if (/official (audio|video)|audio/.test(t)) score += 1
    for (const w of VERSION_WORDS) if (t.includes(w) && !title.includes(w)) score -= 5
    if (!best || score > best.score) best = { id: e.id, score, title: e.title }
  }
  return best && best.score > -8 ? best : null
}

/** Choose what to download. Returns one playable file, or a video stream plus an audio stream. */
export function chooseFormats(info, mode) {
  const formats = (info.formats ?? []).filter((f) => /^https?$/.test(f.protocol ?? '') && f.url)
  const hasV = (f) => f.vcodec && f.vcodec !== 'none'
  const hasA = (f) => f.acodec && f.acodec !== 'none'
  const h264 = (f) => /^(avc1|h264)/.test(f.vcodec ?? '')
  const byAbr = (a, b) => (b.abr ?? b.tbr ?? 0) - (a.abr ?? a.tbr ?? 0)
  const byHeight = (a, b) => (b.height ?? 0) - (a.height ?? 0) || (b.tbr ?? 0) - (a.tbr ?? 0)

  const audioOnly = formats.filter((f) => hasA(f) && !hasV(f))
  const audio = audioOnly.filter((f) => f.ext === 'm4a' || /^mp4a/.test(f.acodec)).sort(byAbr)[0] ?? audioOnly.sort(byAbr)[0]
  const muxed = formats.filter((f) => hasV(f) && hasA(f) && h264(f) && (f.height ?? 0) <= 1080).sort(byHeight)

  if (mode === 'audio') {
    if (audio) return [{ id: audio.format_id, ext: audio.ext, role: 'audio' }]
    const any = muxed[0] ?? formats.filter(hasA).sort(byAbr)[0]
    return any ? [{ id: any.format_id, ext: any.ext, role: 'av' }] : null
  }

  // Footage: H.264 (every browser can decode it), up to 1080p. A ready-made file if it's at least
  // 720p, otherwise the best separate video stream plus audio, merged by the app.
  const videoOnly = formats.filter((f) => hasV(f) && !hasA(f) && h264(f) && (f.height ?? 0) <= 1080 && f.ext === 'mp4').sort(byHeight)
  if (muxed[0] && ((muxed[0].height ?? 0) >= 720 || !videoOnly[0] || (videoOnly[0].height ?? 0) <= (muxed[0].height ?? 0)))
    return [{ id: muxed[0].format_id, ext: muxed[0].ext, role: 'av' }]
  if (videoOnly[0]) {
    const out = [{ id: videoOnly[0].format_id, ext: videoOnly[0].ext, role: 'video' }]
    if (audio && (audio.ext === 'm4a' || /^mp4a/.test(audio.acodec))) out.push({ id: audio.format_id, ext: audio.ext, role: 'audio' })
    return out
  }
  const any = formats.filter(hasV).sort(byHeight)[0]
  return any ? [{ id: any.format_id, ext: any.ext, role: hasA(any) ? 'av' : 'video' }] : null
}

export function createLinkImporter({ toolsDir, nodePath, log = () => {} }) {
  const home = path.join(toolsDir, 'yt-dlp')
  let ready = null

  // The unpacked ("onedir") build starts in a fraction of a second; the single-file build unpacks
  // itself on every run and takes about five, which made every import feel slow.
  async function install(onProgress) {
    await mkdir(toolsDir, { recursive: true })
    const res = await fetch(RELEASES + assetName(), { redirect: 'follow' })
    if (!res.ok || !res.body) throw new Error(`Couldn't download yt-dlp (${res.status})`)
    const total = Number(res.headers.get('content-length')) || 0
    let got = 0
    const zip = path.join(toolsDir, 'yt-dlp.zip')
    const counter = new TransformStream({
      transform(chunk, ctrl) {
        got += chunk.byteLength
        if (total) onProgress?.(got / total)
        ctrl.enqueue(chunk)
      },
    })
    await pipeline(Readable.fromWeb(res.body.pipeThrough(counter)), createWriteStream(zip))
    const fresh = `${home}.new`
    await rm(fresh, { recursive: true, force: true })
    await unzip(zip, fresh)
    await rm(home, { recursive: true, force: true })
    await rename(fresh, home)
    await rm(zip, { force: true })
  }

  async function executable() {
    const names = await readdir(home).catch(() => [])
    const exe = names.find((n) => /^yt-dlp/.test(n) && !n.endsWith('.zip'))
    return exe ? path.join(home, exe) : null
  }

  /** Make sure yt-dlp is installed and warm. Refreshes in the background every couple of weeks. */
  function ensure(onProgress) {
    ready ??= (async () => {
      let exe = await executable()
      if (!exe) {
        log('installing yt-dlp')
        await install(onProgress)
        exe = await executable()
        if (!exe) throw new Error("The downloader didn't install properly")
        await runWith(exe, ['--version']).catch(() => {})
      } else {
        const s = await stat(exe)
        if (Date.now() - s.mtimeMs > REFRESH_DAYS * 864e5) {
          install()
            .then(() => (ready = null))
            .catch((e) => log(`yt-dlp refresh failed: ${e.message}`))
        }
      }
      return exe
    })()
    ready.catch(() => (ready = null))
    return ready
  }

  function runWith(exe, args, { signal, onLine } = {}) {
    return new Promise((resolve, reject) => {
      // Let YouTube's player challenges run on the Node built into this app.
      const child = spawn(exe, ['--js-runtimes', `node:${nodePath}`, '--no-warnings', ...args], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        windowsHide: true,
      })
      let out = ''
      let err = ''
      child.stdout.on('data', (d) => {
        out += d
        if (onLine) for (const l of String(d).split(/\r?\n/)) if (l) onLine(l)
      })
      child.stderr.on('data', (d) => (err += d))
      const kill = () => child.kill()
      signal?.addEventListener('abort', kill, { once: true })
      child.on('error', reject)
      child.on('close', (code) => {
        signal?.removeEventListener('abort', kill)
        if (signal?.aborted) return reject(new Error('Cancelled'))
        if (code === 0) resolve(out)
        else reject(new Error(friendlyError(err) ?? `yt-dlp exited with ${code}`))
      })
    })
  }

  const DOWNLOAD_FLAGS = [
    '--no-playlist',
    '--no-part',
    '--no-mtime',
    '--concurrent-fragments',
    '8',
    '--newline',
    '--progress-template',
    'download:%(progress._percent_str)s',
  ]

  /**
   * Import a link. `mode` is 'audio' for the song or 'video' for footage. Reports
   * { stage, fraction } and resolves with the downloaded files' bytes.
   */
  async function importLink(rawUrl, mode, onProgress, signal) {
    const link = classifyLink(rawUrl)
    if (!link) throw new Error("That doesn't look like a link")
    onProgress({ stage: 'Getting the downloader ready', fraction: null })
    const exe = await ensure((f) => onProgress({ stage: 'Getting the downloader ready (first time only)', fraction: f }))
    const run = (args, opts) => runWith(exe, args, { signal, ...opts })

    let target = link.url
    let title = null
    if (link.site === 'Spotify') {
      if (!link.spotifyTrack) throw new Error('Paste a Spotify track link (not a playlist or album)')
      onProgress({ stage: 'Reading the Spotify track', fraction: null })
      const track = await resolveSpotifyTrack(link.spotifyTrack)
      onProgress({ stage: `Finding ${track.title} by ${track.artists.join(', ')}`, fraction: null })
      const found = JSON.parse(await run(['--flat-playlist', '-J', `ytsearch8:${track.artists.join(' ')} ${track.title} audio`]))
      const match = pickMatch(found.entries ?? [], track)
      if (!match) throw new Error(`Couldn't find ${track.title} by ${track.artists.join(', ')} to download`)
      target = `https://www.youtube.com/watch?v=${match.id}`
      title = `${track.artists.join(', ')} - ${track.title}`
    }

    const dir = path.join(os.tmpdir(), `autoclip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`)
    await mkdir(dir, { recursive: true })
    const progress =
      (label, slot = 0, slots = 1) =>
      (l) => {
        const pct = parseFloat(l)
        if (!Number.isNaN(pct)) onProgress({ stage: label, fraction: (slot + pct / 100) / slots })
      }
    try {
      if (mode === 'audio') {
        // Songs: one call. Read the link, pick AAC (or the best audio there is) and download it.
        onProgress({ stage: 'Downloading', fraction: null })
        const out = await run(
          [
            '-f',
            'ba[ext=m4a]/ba[acodec^=mp4a]/ba/b',
            '--print',
            'before_dl:%(title)s\t%(duration)s',
            ...DOWNLOAD_FLAGS,
            '-o',
            path.join(dir, 'song.%(ext)s'),
            target,
          ],
          { onLine: progress('Downloading') },
        )
        const [name, duration] = (out.split(/\r?\n/).find((l) => l.includes('\t')) ?? '').split('\t')
        if (Number(duration) > 20 * 60) throw new Error('That is over 20 minutes long. Paste a single song.')
        const file = (await readdir(dir)).find((f) => f.startsWith('song.'))
        if (!file) throw new Error('Nothing was downloaded')
        return {
          title: title ?? name ?? 'Imported',
          site: link.site,
          files: [{ role: 'audio', ext: path.extname(file).slice(1), data: await readFile(path.join(dir, file)) }],
        }
      }

      // Footage: read the link once, choose formats, then fetch the picture and sound in parallel
      // straight from the saved info (no second trip to the site).
      onProgress({ stage: `Reading the ${link.site} link`, fraction: null })
      const infoJson = await run(['-J', '--no-playlist', target])
      const info = JSON.parse(infoJson)
      const picks = chooseFormats(info, mode)
      if (!picks) throw new Error('No downloadable video found at that link')
      const infoFile = path.join(dir, 'info.json')
      await writeFile(infoFile, infoJson)
      const done = picks.map(() => 0)
      const files = await Promise.all(
        picks.map(async (p, i) => {
          const file = path.join(dir, `${i}-${p.role}.${p.ext}`)
          await run(['--load-info-json', infoFile, '-f', p.id, ...DOWNLOAD_FLAGS, '-o', file], {
            onLine: (l) => {
              const pct = parseFloat(l)
              if (Number.isNaN(pct)) return
              done[i] = pct / 100
              // The picture is most of the bytes; weight it so the bar moves evenly.
              const w = picks.map((x) => (x.role === 'audio' ? 0.1 : 1))
              onProgress({ stage: 'Downloading', fraction: done.reduce((a, d, k) => a + d * w[k], 0) / w.reduce((a, b) => a + b, 0) })
            },
          })
          return { role: p.role, ext: p.ext, data: await readFile(file) }
        }),
      )
      return { title: title ?? info.title ?? 'Imported', site: link.site, files }
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {})
    }
  }

  /** Install (if needed) and start yt-dlp once, so the first import doesn't wait for either. */
  async function warm() {
    const exe = await ensure()
    await runWith(exe, ['--version'])
  }

  return { importLink, ensure, warm }
}

function friendlyError(stderr) {
  const line = stderr
    .split(/\r?\n/)
    .reverse()
    .find((l) => l.startsWith('ERROR'))
  if (!line) return null
  if (/private|login|sign in|confirm your age/i.test(line)) return 'That video is private, age-restricted or needs a login'
  if (/unavailable|removed|not exist|404/i.test(line)) return "That video isn't available"
  if (/unsupported url/i.test(line)) return "That site isn't supported"
  return line.replace(/^ERROR:\s*(\[[^\]]+\]\s*)?/, '')
}
