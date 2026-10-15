// Getting captions in: subtitle files (.srt), synced lyrics (.lrc, including word-timed "enhanced"
// LRC), Whisper's word timestamps, beat-synced words, and title cards. Everything becomes
// CaptionLines in song time; `toEditTime` moves them onto the edit's timeline.

import type { CaptionLine, CaptionWord } from '../types'

let counter = 0
const lineId = () => `c${Date.now().toString(36)}${(counter++).toString(36)}`

/** Spread a line's words across its duration, weighted by length (long words take longer to sing). */
export function spreadWords(text: string, start: number, end: number): CaptionWord[] {
  const words = text.split(/\s+/).filter(Boolean)
  const weights = words.map((w) => 1 + w.length)
  const total = weights.reduce((a, b) => a + b, 0)
  let t = start
  return words.map((w, i) => {
    const d = ((end - start) * weights[i]) / total
    const word = { text: w, start: t, end: t + d }
    t += d
    return word
  })
}

function srtTime(s: string): number {
  const m = s.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/)
  if (!m) return NaN
  return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 10 ** m[4].length
}

export function parseSrt(text: string): CaptionLine[] {
  const blocks = text.replace(/\r/g, '').split(/\n\s*\n/)
  const lines: CaptionLine[] = []
  for (const block of blocks) {
    const rows = block.split('\n').filter((r) => r.trim())
    const timeRow = rows.findIndex((r) => r.includes('-->'))
    if (timeRow < 0) continue
    const [a, b] = rows[timeRow].split('-->')
    const start = srtTime(a)
    const end = srtTime(b)
    const body = rows
      .slice(timeRow + 1)
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .trim()
    if (!body || !(end > start)) continue
    lines.push({ id: lineId(), start, end, words: spreadWords(body, start, end) })
  }
  return lines
}

function lrcTime(m: string, s: string): number {
  return +m * 60 + parseFloat(s)
}

export function parseLrc(text: string): CaptionLine[] {
  const entries: { start: number; body: string }[] = []
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)]
    if (!stamps.length) continue
    const body = raw.replace(/\[[^\]]*\]/g, '').trim()
    for (const s of stamps) entries.push({ start: lrcTime(s[1], s[2]), body })
  }
  entries.sort((a, b) => a.start - b.start)
  const lines: CaptionLine[] = []
  entries.forEach((e, i) => {
    if (!e.body) return
    const next = entries[i + 1]?.start ?? e.start + 4
    const end = Math.min(next, e.start + 8)
    // Enhanced LRC: <mm:ss.xx>word <mm:ss.xx>word …
    const timed = [...e.body.matchAll(/<(\d+):(\d+(?:\.\d+)?)>\s*([^<]+)/g)]
    let words: CaptionWord[]
    if (timed.length) {
      words = timed.map((m, k) => {
        const start = lrcTime(m[1], m[2])
        const nextStart = timed[k + 1] ? lrcTime(timed[k + 1][1], timed[k + 1][2]) : end
        return { text: m[3].trim(), start, end: nextStart }
      })
    } else words = spreadWords(e.body, e.start, end)
    lines.push({ id: lineId(), start: e.start, end, words })
  })
  return lines
}

export function parseCaptionFile(name: string, text: string): CaptionLine[] {
  if (/\.lrc$/i.test(name) || /^\[\d+:\d+/m.test(text)) return parseLrc(text)
  return parseSrt(text)
}

/** Group word timestamps (from Whisper) into readable lines: short, and broken at pauses. */
export function groupWords(words: CaptionWord[], maxWords = 6, maxGap = 0.7): CaptionLine[] {
  const lines: CaptionLine[] = []
  let cur: CaptionWord[] = []
  const flush = () => {
    if (!cur.length) return
    lines.push({ id: lineId(), start: cur[0].start, end: cur[cur.length - 1].end + 0.15, words: cur })
    cur = []
  }
  for (const w of words) {
    const prev = cur[cur.length - 1]
    if (prev && (w.start - prev.end > maxGap || cur.length >= maxWords || /[.!?]$/.test(prev.text))) flush()
    cur.push(w)
  }
  flush()
  // No overlaps: each line ends when the next begins.
  for (let i = 0; i < lines.length - 1; i++) lines[i].end = Math.min(lines[i].end, lines[i + 1].start)
  return lines
}

/** "WHO. IS. THE. GOAT." — one word per beat, the last one held. Times in song seconds. */
export function beatWords(text: string, beatTimes: number[], from: number): CaptionLine[] {
  const words = text.split(/\s+/).filter(Boolean)
  const beats = beatTimes.filter((b) => b >= from - 0.01)
  return words.map((w, i) => {
    const start = beats[i] ?? (beats.at(-1) ?? from) + i * 0.5
    const end = beats[i + 1] ?? start + 0.6
    return { id: lineId(), start, end, words: [{ text: w, start, end }] }
  })
}

export function titleCard(text: string, start: number, end: number): CaptionLine {
  return { id: lineId(), start, end, words: spreadWords(text, start, end), title: true }
}

/** Shift captions from song time onto the edit timeline, dropping anything outside it. */
export function toEditTime(lines: CaptionLine[], songStart: number, songEnd: number): CaptionLine[] {
  return lines
    .filter((l) => l.end > songStart && l.start < songEnd)
    .map((l) => ({
      ...l,
      start: Math.max(0, l.start - songStart),
      end: Math.min(songEnd - songStart, l.end - songStart),
      words: l.words.map((w) => ({ ...w, start: w.start - songStart, end: w.end - songStart })),
    }))
}

export function toSrt(lines: CaptionLine[]): string {
  const fmt = (t: number) => {
    const ms = Math.round(t * 1000)
    const h = Math.floor(ms / 3600000)
    const m = Math.floor((ms % 3600000) / 60000)
    const s = Math.floor((ms % 60000) / 1000)
    const pad = (n: number, w = 2) => String(n).padStart(w, '0')
    return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms % 1000, 3)}`
  }
  return lines.map((l, i) => `${i + 1}\n${fmt(l.start)} --> ${fmt(l.end)}\n${l.words.map((w) => w.text).join(' ')}\n`).join('\n')
}
