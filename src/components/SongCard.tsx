// The song, as AutoClip hears it: waveform colored by section, beat ticks, drop markers, the part of
// the song the edit uses (drag it to re-cut somewhere else) and the playhead.

import { Music2, RefreshCw, Zap } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { makeEdit, setSongFile } from '../state/actions'
import { playhead } from '../state/playhead'
import { activeDraft, setState, useApp } from '../state/store'
import type { SectionLabel, SongAnalysis } from '../lib/types'
import { cx, fmtTime, SECTION_COLORS } from './format'

const SECTION_NAMES: Record<SectionLabel, string> = {
  intro: 'Intro',
  verse: 'Verse',
  build: 'Build',
  drop: 'Drop',
  break: 'Break',
  outro: 'Outro',
}

function drawWave(canvas: HTMLCanvasElement, song: SongAnalysis, win: { start: number; end: number } | null, playT: number | null) {
  const dpr = window.devicePixelRatio || 1
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr)
  if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr)
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  const css = getComputedStyle(canvas)
  const ink3 = css.getPropertyValue('--ink-3').trim()
  const accent = css.getPropertyValue('--accent').trim()
  const xOf = (t: number) => (t / song.duration) * w

  const buckets = song.peaks.length / 2
  const mid = h * 0.46
  const amp = h * 0.4
  for (let i = 0; i < buckets; i++) {
    const t = (i / buckets) * song.duration
    const sec = song.sections.find((s) => t >= s.start && t < s.end)
    const inWin = !win || (t >= win.start && t <= win.end)
    ctx.fillStyle = sec ? SECTION_COLORS[sec.label] : ink3
    ctx.globalAlpha = inWin ? 0.95 : 0.22
    const x = (i / buckets) * w
    const lo = song.peaks[i * 2]
    const hi = song.peaks[i * 2 + 1]
    ctx.fillRect(x, mid - hi * amp, Math.max(1, w / buckets - 0.3), Math.max(1, (hi - lo) * amp))
  }
  ctx.globalAlpha = 1

  // Beat ticks: downbeats taller.
  ctx.fillStyle = ink3
  for (const b of song.beats) {
    const x = xOf(b.time)
    ctx.globalAlpha = b.kind === 'downbeat' ? 0.7 : 0.25
    ctx.fillRect(x, h - (b.kind === 'downbeat' ? 7 : 4), 1, b.kind === 'downbeat' ? 7 : 4)
  }
  ctx.globalAlpha = 1

  if (win) {
    ctx.strokeStyle = accent
    ctx.lineWidth = 1.5
    ctx.strokeRect(xOf(win.start) + 0.75, 1, xOf(win.end) - xOf(win.start) - 1.5, h - 10)
  }
  for (const d of song.drops) {
    const x = xOf(d.time)
    ctx.fillStyle = accent
    ctx.globalAlpha = 0.5 + 0.5 * d.strength
    ctx.fillRect(x - 0.75, 0, 1.5, h - 8)
    ctx.beginPath()
    ctx.moveTo(x - 4, 0)
    ctx.lineTo(x + 4, 0)
    ctx.lineTo(x, 6)
    ctx.fill()
  }
  ctx.globalAlpha = 1
  if (playT !== null) {
    ctx.fillStyle = css.getPropertyValue('--ink').trim()
    ctx.fillRect(xOf(playT) - 1, 0, 2, h - 8)
  }
}

export function SongCard() {
  const song = useApp((s) => s.song)
  const draft = useApp((s) => activeDraft(s))
  const override = useApp((s) => s.windowOverride)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState<{ x0: number; start: number; end: number; cur: number } | null>(null)
  const analysis = song?.analysis
  const win = useMemo(
    () =>
      drag
        ? { start: drag.cur, end: drag.cur + (drag.end - drag.start) }
        : draft
          ? { start: draft.plan.songStart, end: draft.plan.songEnd }
          : override,
    [drag, draft, override],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !analysis) return
    let raf = 0
    const draw = () => drawWave(canvas, analysis, win, draft && !drag ? draft.plan.songStart + playhead.time : null)
    draw()
    const unsub = playhead.subscribe(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(draw)
    })
    const ro = new ResizeObserver(draw)
    ro.observe(canvas)
    return () => {
      unsub()
      ro.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [analysis, win, draft, drag])

  if (!song) return null

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!analysis || !win) return
    const rect = e.currentTarget.getBoundingClientRect()
    const t = ((e.clientX - rect.left) / rect.width) * analysis.duration
    if (t >= win.start && t <= win.end) {
      e.currentTarget.setPointerCapture(e.pointerId)
      setDrag({ x0: e.clientX, start: win.start, end: win.end, cur: win.start })
    } else if (draft) {
      // Click outside the window: just seek if it's inside, otherwise ignore.
      playhead.seek(t - draft.plan.songStart)
    }
  }
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drag || !analysis) return
    const rect = e.currentTarget.getBoundingClientRect()
    const dt = ((e.clientX - drag.x0) / rect.width) * analysis.duration
    const len = drag.end - drag.start
    let start = Math.max(0, Math.min(analysis.duration - len, drag.start + dt))
    // Snap to the nearest downbeat so the edit still starts on "the one".
    const downs = analysis.beats.filter((b) => b.kind === 'downbeat')
    const snap = downs.reduce((a, b) => (Math.abs(b.time - start) < Math.abs(a.time - start) ? b : a), downs[0])
    if (snap && Math.abs(snap.time - start) < 1.2) start = snap.time
    setDrag({ ...drag, cur: start })
  }
  const onPointerUp = () => {
    if (!drag) return
    const moved = Math.abs(drag.cur - drag.start) > 0.05
    if (moved) {
      setState({ windowOverride: { start: drag.cur, end: drag.cur + (drag.end - drag.start) } })
      makeEdit()
    }
    setDrag(null)
  }

  const sectionsInWin = analysis?.sections.filter((s) => win && s.end > win.start && s.start < win.end) ?? []

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center gap-3 px-4 pt-3.5 pb-2">
        <div className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-accent text-on-accent">
          <Music2
            className={cx('size-4', analysis && 'beat')}
            style={{ ['--beat' as string]: analysis ? `${60 / analysis.bpm}s` : undefined }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold" title={song.name}>
            {song.name}
          </div>
          <div className="font-mono text-[0.7rem] text-ink-3">
            {analysis
              ? `${Math.round(analysis.bpm)} BPM · ${analysis.drops.length} drop${analysis.drops.length === 1 ? '' : 's'} · ${fmtTime(analysis.duration).slice(0, -2)}`
              : song.status === 'error'
                ? song.error
                : `${song.stage}…`}
          </div>
        </div>
        <button className="btn btn-ghost btn-sm btn-icon" title="Replace song" onClick={() => fileRef.current?.click()}>
          <RefreshCw className="size-3.5" />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*,.mp3,.m4a,.wav,.flac,.ogg"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void setSongFile(f)
            e.target.value = ''
          }}
        />
      </div>

      {analysis ? (
        <>
          <canvas
            ref={canvasRef}
            className={cx('block h-20 w-full touch-none px-4', win && 'cursor-grab', drag && 'cursor-grabbing')}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            title="Drag the highlighted part to cut a different section of the song"
          />
          <div className="flex flex-wrap items-center gap-1.5 px-4 pt-2 pb-3.5">
            {[...new Map(sectionsInWin.map((s) => [s.label, s])).values()].map((s) => (
              <span key={s.label} className="flex items-center gap-1 text-[0.7rem] text-ink-2">
                <span className="size-2 rounded-full" style={{ background: SECTION_COLORS[s.label] }} />
                {SECTION_NAMES[s.label]}
              </span>
            ))}
            {analysis.drops.length > 0 && (
              <span className="flex items-center gap-1 text-[0.7rem] text-ink-2">
                <Zap className="size-3 text-accent" /> Hit point
              </span>
            )}
            {override && (
              <button
                className="ml-auto text-[0.7rem] font-semibold text-accent hover:underline"
                onClick={() => {
                  setState({ windowOverride: null })
                  makeEdit()
                }}
              >
                Auto-pick section
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="px-4 pb-4">
          <div className="h-1.5 overflow-hidden rounded-full bg-well">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300"
              style={{ width: `${Math.max(4, song.progress * 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
