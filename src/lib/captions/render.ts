// Animated captions, drawn on a transparent 2D canvas the size of the output. Six styles:
//   pop        one word at a time, huge, bouncing in on its beat
//   karaoke    the whole line, the current word lit up
//   impact     heavy all-caps with a thick outline, slammed in
//   clean      a calm lower third on a soft pill
//   glitch     RGB-split mono type that jitters on each word
//   typewriter characters typed out with a blinking cursor

import type { CaptionLine, CaptionPosition, CaptionStyle, CaptionWord } from '../types'

export const CAPTION_STYLES: { id: CaptionStyle; name: string; sample: string }[] = [
  { id: 'pop', name: 'Pop', sample: 'One word at a time' },
  { id: 'karaoke', name: 'Karaoke', sample: 'Lights up each word' },
  { id: 'impact', name: 'Impact', sample: 'Heavy and loud' },
  { id: 'clean', name: 'Clean', sample: 'Calm lower third' },
  { id: 'glitch', name: 'Glitch', sample: 'RGB-split jitter' },
  { id: 'typewriter', name: 'Typewriter', sample: 'Typed out live' },
]

export const CAPTION_FONTS = {
  display: '"Anton", "Bebas Neue", Impact, sans-serif',
  body: '"Inter Variable", "Inter", system-ui, sans-serif',
  round: '"Bricolage Grotesque Variable", "Inter Variable", system-ui, sans-serif',
  mono: '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace',
}

export interface CaptionOptions {
  style: CaptionStyle
  position: CaptionPosition
  /** 0.6–1.6 */
  scale: number
  /** Highlight color for karaoke and accents. */
  accent: string
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

const easeOutBack = (x: number) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
}
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

export function activeLine(lines: CaptionLine[], t: number): CaptionLine | null {
  for (const l of lines) if (t >= l.start && t < l.end) return l
  return null
}

function currentWord(words: CaptionWord[], t: number): number {
  let idx = -1
  for (let i = 0; i < words.length; i++) if (words[i].start <= t) idx = i
  return idx
}

function wrap(ctx: Ctx, words: string[], maxWidth: number): string[][] {
  const lines: string[][] = [[]]
  for (const w of words) {
    const line = lines[lines.length - 1]
    const test = [...line, w].join(' ')
    if (line.length && ctx.measureText(test).width > maxWidth) lines.push([w])
    else line.push(w)
  }
  return lines
}

function baseY(position: CaptionPosition, h: number, blockHeight: number): number {
  if (position === 'top') return h * 0.16
  if (position === 'center') return h * 0.5 - blockHeight / 2
  return h * 0.8 - blockHeight
}

/** Draws the caption for time `t`. Returns false when nothing is on screen (so the layer can be skipped). */
export function drawCaptions(ctx: Ctx, lines: CaptionLine[], t: number, opts: CaptionOptions, w: number, h: number): boolean {
  ctx.clearRect(0, 0, w, h)
  const line = activeLine(lines, t)
  if (!line || !line.words.length) return false
  // A line that's a single word (beat text, shouted lyrics) gets to be big.
  const solo = !line.title && line.words.length === 1 ? 1.7 : 1
  const unit = Math.min(w, h) * opts.scale * solo
  const maxWidth = w * 0.86
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'

  if (line.title) {
    drawTitle(ctx, line, t, unit, w, h)
    return true
  }

  const wi = currentWord(line.words, t)
  const lineAge = t - line.start
  const lineLeft = line.end - t

  switch (opts.style) {
    case 'pop': {
      const word = line.words[Math.max(0, wi)]
      const age = t - word.start
      const size = unit * 0.15
      ctx.font = `${size}px ${CAPTION_FONTS.display}`
      const s = 0.6 + 0.4 * easeOutBack(clamp01(age / 0.16))
      const y = opts.position === 'bottom' ? h * 0.72 : opts.position === 'top' ? h * 0.2 : h * 0.5
      ctx.save()
      ctx.translate(w / 2, y)
      ctx.scale(s, s)
      ctx.rotate((wi % 2 ? 1 : -1) * 0.03)
      const text = word.text.toUpperCase()
      ctx.lineWidth = size * 0.16
      ctx.strokeStyle = '#000'
      ctx.strokeText(text, 0, 0, maxWidth)
      ctx.fillStyle = wi % 3 === 2 ? opts.accent : '#fff'
      ctx.fillText(text, 0, 0, maxWidth)
      ctx.restore()
      return true
    }
    case 'karaoke': {
      const size = unit * 0.068
      ctx.font = `800 ${size}px ${CAPTION_FONTS.round}`
      const rows = wrap(
        ctx,
        line.words.map((x) => x.text),
        maxWidth,
      )
      const lh = size * 1.25
      let y0 = baseY(opts.position, h, rows.length * lh) + lh / 2
      const fade = clamp01(lineAge / 0.12) * clamp01(lineLeft / 0.12)
      let k = 0
      ctx.globalAlpha = fade
      for (const row of rows) {
        const widths = row.map((word) => ctx.measureText(word + ' ').width)
        let x = w / 2 - widths.reduce((a, b) => a + b, 0) / 2
        for (let j = 0; j < row.length; j++) {
          const isCur = k === wi
          const said = k < wi
          ctx.save()
          const cx = x + widths[j] / 2 - ctx.measureText(' ').width / 2
          ctx.translate(cx, y0)
          if (isCur) ctx.scale(1.12, 1.12)
          ctx.lineWidth = size * 0.2
          ctx.strokeStyle = 'rgba(0,0,0,0.85)'
          ctx.strokeText(row[j], 0, 0)
          ctx.fillStyle = isCur ? opts.accent : said ? '#fff' : 'rgba(255,255,255,0.55)'
          ctx.fillText(row[j], 0, 0)
          ctx.restore()
          x += widths[j]
          k++
        }
        y0 += lh
      }
      ctx.globalAlpha = 1
      return true
    }
    case 'impact': {
      const size = unit * 0.1
      ctx.font = `${size}px ${CAPTION_FONTS.display}`
      const shown = line.words.slice(0, Math.max(1, wi + 1)).map((x) => x.text.toUpperCase())
      const rows = wrap(ctx, shown, maxWidth)
      const lh = size * 1.05
      const slam = easeOutBack(clamp01(lineAge / 0.14))
      let y = baseY(opts.position, h, rows.length * lh) + lh / 2
      ctx.save()
      ctx.translate(w / 2, 0)
      ctx.rotate(-0.025)
      for (const row of rows) {
        const text = row.join(' ')
        ctx.save()
        ctx.translate(0, y)
        ctx.scale(0.7 + 0.3 * slam, 0.7 + 0.3 * slam)
        ctx.lineWidth = size * 0.22
        ctx.strokeStyle = '#000'
        ctx.strokeText(text, 0, 0)
        ctx.fillStyle = '#fff'
        ctx.fillText(text, 0, 0)
        ctx.restore()
        y += lh
      }
      ctx.restore()
      return true
    }
    case 'clean': {
      const size = unit * 0.05
      ctx.font = `600 ${size}px ${CAPTION_FONTS.body}`
      const rows = wrap(
        ctx,
        line.words.map((x) => x.text),
        maxWidth * 0.9,
      )
      const lh = size * 1.35
      const pad = size * 0.6
      const blockH = rows.length * lh + pad
      const y0 = baseY(opts.position, h, blockH)
      const fade = clamp01(lineAge / 0.2) * clamp01(lineLeft / 0.2)
      const widest = Math.max(...rows.map((r) => ctx.measureText(r.join(' ')).width))
      ctx.globalAlpha = fade
      ctx.fillStyle = 'rgba(10,10,14,0.62)'
      roundRect(ctx, w / 2 - widest / 2 - pad, y0 + (1 - fade) * size * 0.4, widest + pad * 2, blockH, size * 0.5)
      ctx.fill()
      ctx.fillStyle = '#fff'
      rows.forEach((r, i) => ctx.fillText(r.join(' '), w / 2, y0 + pad / 2 + lh * (i + 0.5) + (1 - fade) * size * 0.4))
      ctx.globalAlpha = 1
      return true
    }
    case 'glitch': {
      const size = unit * 0.075
      ctx.font = `800 ${size}px ${CAPTION_FONTS.mono}`
      const shown = line.words.slice(0, Math.max(1, wi + 1)).map((x) => x.text.toUpperCase())
      const rows = wrap(ctx, shown, maxWidth)
      const lh = size * 1.2
      const word = line.words[Math.max(0, wi)]
      const jitter = Math.exp(-(t - word.start) / 0.1)
      let y = baseY(opts.position, h, rows.length * lh) + lh / 2
      for (const row of rows) {
        const text = row.join(' ')
        const dx = size * 0.08 * jitter * (Math.sin(t * 90) > 0 ? 1 : -1)
        ctx.globalCompositeOperation = 'lighter'
        ctx.fillStyle = 'rgba(255,0,60,0.9)'
        ctx.fillText(text, w / 2 - dx - size * 0.03, y)
        ctx.fillStyle = 'rgba(0,240,255,0.9)'
        ctx.fillText(text, w / 2 + dx + size * 0.03, y)
        ctx.globalCompositeOperation = 'source-over'
        ctx.fillStyle = '#fff'
        ctx.fillText(text, w / 2, y)
        y += lh
      }
      return true
    }
    case 'typewriter': {
      const size = unit * 0.058
      ctx.font = `600 ${size}px ${CAPTION_FONTS.mono}`
      const full = line.words.map((x) => x.text).join(' ')
      // Type at the pace of the words; finish by the last word.
      const lastStart = line.words[line.words.length - 1].start
      const typed = Math.round(full.length * clamp01((t - line.start) / Math.max(0.3, lastStart - line.start + 0.25)))
      const text = full.slice(0, typed)
      const rows = wrap(ctx, text.split(' '), maxWidth)
      const lh = size * 1.3
      let y = baseY(opts.position, h, rows.length * lh) + lh / 2
      ctx.textAlign = 'left'
      const widest = Math.max(...rows.map((r) => ctx.measureText(r.join(' ')).width), 1)
      const x0 = w / 2 - widest / 2
      rows.forEach((r, i) => {
        const s = r.join(' ')
        ctx.lineWidth = size * 0.18
        ctx.strokeStyle = 'rgba(0,0,0,0.8)'
        ctx.strokeText(s, x0, y)
        ctx.fillStyle = '#f5f0e6'
        ctx.fillText(s, x0, y)
        if (i === rows.length - 1 && Math.floor(t * 2.5) % 2 === 0)
          ctx.fillRect(x0 + ctx.measureText(s).width + size * 0.1, y - size * 0.45, size * 0.5, size * 0.9)
        y += lh
      })
      ctx.textAlign = 'center'
      return true
    }
  }
}

function drawTitle(ctx: Ctx, line: CaptionLine, t: number, unit: number, w: number, h: number) {
  const age = t - line.start
  const left = line.end - t
  const text = line.words
    .map((x) => x.text)
    .join(' ')
    .toUpperCase()
  const size = unit * 0.17
  ctx.font = `${size}px ${CAPTION_FONTS.display}`
  const rows = wrap(ctx, text.split(' '), w * 0.88)
  const lh = size * 0.98
  const appear = easeOutBack(clamp01(age / 0.25))
  const out = clamp01(left / 0.15)
  let y = h / 2 - ((rows.length - 1) * lh) / 2
  ctx.save()
  ctx.globalAlpha = out
  for (const r of rows) {
    ctx.save()
    ctx.translate(w / 2, y)
    const s = 1.4 - 0.4 * appear
    ctx.scale(s, s)
    ctx.shadowColor = 'rgba(0,0,0,0.6)'
    ctx.shadowBlur = size * 0.3
    ctx.fillStyle = '#fff'
    ctx.fillText(r.join(' '), 0, 0)
    ctx.restore()
    y += lh
  }
  ctx.restore()
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
