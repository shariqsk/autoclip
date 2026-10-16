// Animated captions, drawn on a transparent 2D canvas the size of the output. Six styles:
//   pop        one word at a time, huge, bouncing in on its beat
//   karaoke    the whole line, the current word lit up
//   impact     heavy all-caps with a thick outline, slammed in
//   clean      a calm lower third on a soft pill
//   glitch     RGB-split mono type that jitters on each word
//   typewriter characters typed out with a blinking cursor
//   subtitle   small italic lyrics that build up word by word
//   stack      tall bold capitals that stack up word by word, the line's last word in the accent

import type { CaptionLine, CaptionPosition, CaptionStyle, CaptionWord, TitleLook } from '../types'

export const CAPTION_STYLES: { id: CaptionStyle; name: string; sample: string }[] = [
  { id: 'pop', name: 'Pop', sample: 'One word at a time' },
  { id: 'karaoke', name: 'Karaoke', sample: 'Lights up each word' },
  { id: 'impact', name: 'Impact', sample: 'Heavy and loud' },
  { id: 'clean', name: 'Clean', sample: 'Calm lower third' },
  { id: 'glitch', name: 'Glitch', sample: 'RGB-split jitter' },
  { id: 'typewriter', name: 'Typewriter', sample: 'Typed out live' },
  { id: 'subtitle', name: 'Subtitle', sample: 'Small italic lyrics, word by word' },
  { id: 'stack', name: 'Stack', sample: 'Big capitals that stack up, last word coloured' },
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
  /** "@handle" watermark in the corner, or empty. */
  handle?: string
  /** How the title card moves. */
  titleLook?: TitleLook
  /** Draw the title huge and behind the people (on the layer drawBehind fills), not over them. */
  titleBehind?: boolean
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

const easeOutBack = (x: number) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
}
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

export function activeLine(lines: CaptionLine[], t: number): CaptionLine | null {
  for (const l of lines) if (!l.nameplate && t >= l.start && t < l.end) return l
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
/**
 * Draws everything on the caption layer at time `t`: the current caption or title card, any fighter
 * nameplate, and the handle watermark. Returns false when the layer is empty (so it can be skipped).
 */
export function drawCaptions(ctx: Ctx, lines: CaptionLine[], t: number, opts: CaptionOptions, w: number, h: number): boolean {
  ctx.clearRect(0, 0, w, h)
  let drawn = false
  for (const plate of lines) {
    if (plate.nameplate && t >= plate.start && t < plate.end) {
      drawNameplate(ctx, plate, t, opts, w, h)
      drawn = true
    }
  }
  if (opts.handle) {
    drawHandle(ctx, opts.handle, w, h)
    drawn = true
  }
  return drawLine(ctx, lines, t, opts, w, h) || drawn
}

function drawHandle(ctx: Ctx, handle: string, w: number, h: number) {
  const size = Math.min(w, h) * 0.028
  ctx.save()
  ctx.font = `700 ${size}px ${CAPTION_FONTS.mono}`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'alphabetic'
  ctx.globalAlpha = 0.75
  ctx.shadowColor = 'rgba(0,0,0,0.6)'
  ctx.shadowBlur = size * 0.4
  ctx.fillStyle = '#fff'
  ctx.fillText(handle.startsWith('@') ? handle : `@${handle}`, w - size * 1.2, h - size * 1.4)
  ctx.restore()
}

/** A broadcast-style lower third that slams in: the name on a signal-colour bar, the record under it. */
function drawNameplate(ctx: Ctx, line: CaptionLine, t: number, opts: CaptionOptions, w: number, h: number) {
  const age = t - line.start
  const left = line.end - t
  const unit = Math.min(w, h)
  const name = line.words
    .map((x) => x.text)
    .join(' ')
    .toUpperCase()
  const sub = (line.nameplate?.sub ?? '').toUpperCase()
  const size = unit * 0.095
  ctx.save()
  ctx.font = `${size}px ${CAPTION_FONTS.display}`
  const nameW = Math.min(w * 0.84, ctx.measureText(name).width)
  const padX = size * 0.35
  const x0 = w * 0.07
  const y0 = h * 0.66
  // Bar wipes in from the left, name slams down, everything wipes out at the end.
  const wipe = clamp01(age / 0.18)
  const out = clamp01(left / 0.15)
  ctx.globalAlpha = out
  ctx.fillStyle = opts.accent
  ctx.fillRect(x0, y0 - size * 0.62, (nameW + padX * 2) * easeOutBack(wipe), size * 1.18)
  if (age > 0.08) {
    const s = 1 + 0.25 * (1 - clamp01((age - 0.08) / 0.14))
    ctx.save()
    ctx.translate(x0 + padX, y0)
    ctx.scale(s, s)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#0a0a0a'
    ctx.fillText(name, 0, size * 0.04, w * 0.84)
    ctx.restore()
  }
  if (sub && age > 0.2) {
    const subSize = unit * 0.034
    ctx.font = `700 ${subSize}px ${CAPTION_FONTS.mono}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    const subW = ctx.measureText(sub).width + subSize
    ctx.fillStyle = 'rgba(10,10,10,0.88)'
    ctx.fillRect(x0, y0 + size * 0.62, subW * clamp01((age - 0.2) / 0.15), subSize * 1.7)
    ctx.fillStyle = '#fff'
    if (age > 0.28) ctx.fillText(sub, x0 + subSize * 0.5, y0 + size * 0.62 + subSize * 0.35)
  }
  ctx.restore()
}

function drawLine(ctx: Ctx, lines: CaptionLine[], t: number, opts: CaptionOptions, w: number, h: number): boolean {
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
    if (opts.titleBehind) return false
    if (opts.titleLook === 'spread') drawSpreadTitle(ctx, line, t, unit, w, h, null)
    else drawTitle(ctx, line, t, unit, w, h, null)
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
    case 'subtitle': {
      // Lyrics as they're sung: each word fades up beside the last, small and italic.
      const size = unit * 0.05
      ctx.font = `italic 500 ${size}px ${CAPTION_FONTS.body}`
      const shown = line.words.slice(0, Math.max(1, wi + 1))
      const rows = wrap(
        ctx,
        shown.map((x) => x.text.toLowerCase()),
        maxWidth * 0.8,
      )
      const lh = size * 1.3
      let y = (opts.position === 'top' ? h * 0.18 : opts.position === 'center' ? h * 0.5 : h * 0.86) - ((rows.length - 1) * lh) / 2
      const out = clamp01(lineLeft / 0.15)
      ctx.shadowColor = 'rgba(0,0,0,0.75)'
      ctx.shadowBlur = size * 0.35
      let k = 0
      for (const row of rows) {
        const widths = row.map((word) => ctx.measureText(word + ' ').width)
        let x = w / 2 - (widths.reduce((a, b) => a + b, 0) - ctx.measureText(' ').width) / 2
        ctx.textAlign = 'left'
        for (let j = 0; j < row.length; j++) {
          const age = t - shown[k].start
          ctx.globalAlpha = out * clamp01(age / 0.12)
          ctx.fillStyle = '#fff'
          ctx.fillText(row[j], x, y + (1 - clamp01(age / 0.12)) * size * 0.15)
          x += widths[j]
          k++
        }
        y += lh
      }
      ctx.textAlign = 'center'
      ctx.globalAlpha = 1
      ctx.shadowBlur = 0
      return true
    }
    case 'stack': {
      // Tall capitals stacking up as they're sung. The line's last word lands in the accent colour.
      const size = unit * 0.12
      ctx.font = `${size}px ${CAPTION_FONTS.display}`
      const shown = line.words.slice(0, Math.max(1, wi + 1))
      const rows = wrap(
        ctx,
        shown.map((x) => x.text.toUpperCase()),
        maxWidth * 0.9,
      )
      const lh = size * 1.02
      let y = baseY(opts.position, h, rows.length * lh) + lh / 2
      const out = clamp01(lineLeft / 0.1)
      const last = line.words.length - 1
      let k = 0
      ctx.globalAlpha = out
      for (const row of rows) {
        const widths = row.map((word) => ctx.measureText(word + ' ').width)
        let x = w / 2 - (widths.reduce((a, b) => a + b, 0) - ctx.measureText(' ').width) / 2
        for (let j = 0; j < row.length; j++) {
          const age = t - shown[k].start
          const s = 1 + 0.18 * (1 - clamp01(age / 0.1))
          ctx.save()
          ctx.translate(x + (widths[j] - ctx.measureText(' ').width) / 2, y)
          ctx.scale(s, s)
          ctx.shadowColor = 'rgba(0,0,0,0.55)'
          ctx.shadowBlur = size * 0.18
          ctx.fillStyle = k === last ? opts.accent : '#fff'
          ctx.fillText(row[j], 0, 0)
          ctx.restore()
          x += widths[j]
          k++
        }
        y += lh
      }
      ctx.globalAlpha = 1
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

/**
 * The title behind the people: huge, filling the width a word or two to a row, a little above the
 * middle so it sits behind heads and shoulders. Returns false when there's no title up.
 */
export function drawBehind(
  ctx: Ctx,
  lines: CaptionLine[],
  t: number,
  opts: CaptionOptions,
  w: number,
  h: number,
  /** Where the picture is (fractions of the height), when it doesn't fill the frame (black bars). */
  picture: { top: number; height: number } = { top: 0, height: 1 },
): boolean {
  ctx.clearRect(0, 0, w, h)
  if (!opts.titleBehind) return false
  const line = activeLine(lines, t)
  if (!line?.title || !line.words.length) return false
  // Sized and placed on the picture itself, so it never spills onto the bars.
  const unit = Math.min(w, picture.height * h) * opts.scale
  const place = { cy: (picture.top + picture.height * 0.4) * h }
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if (opts.titleLook === 'spread') drawSpreadTitle(ctx, line, t, unit, w, h, place)
  else drawTitle(ctx, line, t, unit, w, h, place)
  return true
}

/** Where a title behind the people goes (its middle, in pixels), or null for a normal title. */
type Place = { cy: number } | null

function drawTitle(ctx: Ctx, line: CaptionLine, t: number, unit: number, w: number, h: number, place: Place) {
  const behind = !!place
  const age = t - line.start
  const left = line.end - t
  const text = line.words
    .map((x) => x.text)
    .join(' ')
    .toUpperCase()
  const size = unit * (behind ? 0.34 : 0.17)
  ctx.font = `${size}px ${CAPTION_FONTS.display}`
  const rows = wrap(ctx, text.split(' '), w * (behind ? 0.94 : 0.88))
  const lh = size * (behind ? 0.9 : 0.98)
  const appear = easeOutBack(clamp01(age / 0.25))
  const out = clamp01(left / 0.15)
  let y = (place?.cy ?? h * 0.5) - ((rows.length - 1) * lh) / 2
  ctx.save()
  ctx.globalAlpha = out
  for (const r of rows) {
    ctx.save()
    ctx.translate(w / 2, y)
    // Behind the people, every row is stretched to the full width, like a poster.
    const fit = behind ? Math.min(1.6, (w * 0.94) / Math.max(1, ctx.measureText(r.join(' ')).width)) : 1
    const s = (1.4 - 0.4 * appear) * fit
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

/**
 * A title that glitches in, then lets its letters drift apart (and glitches out at the end), like the
 * opening card of a broadcast package.
 */
function drawSpreadTitle(ctx: Ctx, line: CaptionLine, t: number, unit: number, w: number, h: number, place: Place) {
  const behind = !!place
  const age = t - line.start
  const left = line.end - t
  const text = line.words
    .map((x) => x.text)
    .join(' ')
    .toUpperCase()
  const life = Math.max(0.5, line.end - line.start)
  const size = unit * (behind ? 0.3 : 0.16)
  // Letters start tight and drift apart for the whole time the card is up.
  const spread = size * (0.04 + 0.3 * clamp01(age / life))
  ctx.save()
  ctx.font = `${size}px ${CAPTION_FONTS.display}`
  ctx.letterSpacing = `${spread}px`
  // Shrink to fit the frame.
  const natural = ctx.measureText(text).width
  const fit = Math.min(1, (w * 0.88) / Math.max(1, natural))
  const glitch = Math.max(clamp01(1 - age / 0.22), clamp01(1 - left / 0.18))
  ctx.translate(w / 2, place?.cy ?? h * 0.5)
  ctx.scale(fit, fit)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = size * 0.25
  if (glitch > 0.02) {
    // Torn into horizontal slices, each nudged sideways, with a red and cyan ghost.
    const slices = 7
    const sh = size * 1.2
    const seed = Math.floor(t * 24)
    for (let i = 0; i < slices; i++) {
      const y0 = -sh / 2 + (sh / slices) * i
      const r = Math.sin((seed + 1) * 12.9898 + i * 78.233) * 43758.5453
      const dx = (r - Math.floor(r) - 0.5) * size * 1.2 * glitch
      ctx.save()
      ctx.beginPath()
      ctx.rect(-w, y0, w * 2, sh / slices)
      ctx.clip()
      ctx.globalAlpha = 1 - glitch * 0.3
      ctx.fillStyle = 'rgba(255,40,70,0.8)'
      ctx.fillText(text, dx - size * 0.06 * glitch, 0)
      ctx.fillStyle = 'rgba(40,230,255,0.8)'
      ctx.fillText(text, dx + size * 0.06 * glitch, 0)
      ctx.fillStyle = '#fff'
      ctx.fillText(text, dx, 0)
      ctx.restore()
    }
  } else {
    ctx.fillStyle = '#fff'
    ctx.fillText(text, 0, 0)
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
