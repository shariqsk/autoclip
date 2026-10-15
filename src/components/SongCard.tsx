// 01 SOUND: the song as AutoClip hears it. Tale-of-the-tape stats, the full waveform with its
// sections, drops and bar ticks, and the stretch of song the edit uses (drag it to move the edit).

import { RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { SongAnalysis } from '../lib/types'
import { makeEdit, setSongFile } from '../state/actions'
import { playhead } from '../state/playhead'
import { activeDraft, setState, useApp } from '../state/store'
import { cx, fmtTime } from './format'
import { Progress } from './ui'

function drawWave(
  canvas: HTMLCanvasElement,
  song: SongAnalysis,
  win: { start: number; end: number } | null,
  playT: number | null,
  drop: number | null,
) {
  const dpr = window.devicePixelRatio || 1
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr)
  if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr)
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  const css = getComputedStyle(canvas)
  const ink = css.getPropertyValue('--ink').trim()
  const ink3 = css.getPropertyValue('--ink-3').trim()
  const signal = css.getPropertyValue('--signal').trim()
  const xOf = (t: number) => (t / song.duration) * w

  const buckets = song.peaks.length / 2
  const mid = h * 0.45
  const amp = h * 0.42
  for (let i = 0; i < buckets; i++) {
    const t = (i / buckets) * song.duration
    const sec = song.sections.find((s) => t >= s.start && t < s.end)
    const inWin = !win || (t >= win.start && t <= win.end)
    ctx.fillStyle = sec?.label === 'drop' ? signal : inWin ? ink : ink3
    ctx.globalAlpha = inWin ? 1 : 0.28
    const lo = song.peaks[i * 2]
    const hi = song.peaks[i * 2 + 1]
    ctx.fillRect((i / buckets) * w, mid - hi * amp, Math.max(1, w / buckets - 0.4), Math.max(1, (hi - lo) * amp))
  }
  ctx.globalAlpha = 1
  ctx.fillStyle = ink3
  for (const b of song.beats) if (b.kind === 'downbeat') ctx.fillRect(xOf(b.time), h - 5, 1, 5)
  if (win) {
    ctx.strokeStyle = ink
    ctx.lineWidth = 1
    ctx.strokeRect(xOf(win.start) + 0.5, 0.5, xOf(win.end) - xOf(win.start) - 1, h - 7)
  }
  for (const d of drop === null ? song.drops.map((x) => x.time) : [drop]) {
    ctx.fillStyle = signal
    ctx.fillRect(xOf(d) - 1, 0, 2, h - 6)
    ctx.fillRect(xOf(d) - 4, 0, 8, 4)
  }
  if (playT !== null) {
    ctx.fillStyle = ink
    ctx.fillRect(xOf(playT) - 0.5, 0, 1.5, h - 6)
  }
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-0 border-l border-line pl-2.5 first:border-l-0 first:pl-0">
      <div className={cx('head truncate text-[1.7rem]', accent && 'text-signal')}>{value}</div>
      <div className="tag mt-1">{label}</div>
    </div>
  )
}

export function SongCard() {
  const song = useApp((s) => s.song)
  const draft = useApp((s) => activeDraft(s))
  const override = useApp((s) => s.windowOverride)
  const dropOverride = useApp((s) => s.dropOverride)
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
    const draw = () => drawWave(canvas, analysis, win, draft && !drag ? draft.plan.songStart + playhead.time : null, dropOverride)
    draw()
    const unsub = playhead.subscribe(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(draw)
    })
    const ro = new ResizeObserver(draw)
    ro.observe(canvas)
    const mo = new MutationObserver(draw)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => {
      unsub()
      ro.disconnect()
      mo.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [analysis, win, draft, drag, dropOverride])

  if (!song) return null

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!analysis || !win) return
    const rect = e.currentTarget.getBoundingClientRect()
    const t = ((e.clientX - rect.left) / rect.width) * analysis.duration
    if (t >= win.start && t <= win.end) {
      e.currentTarget.setPointerCapture(e.pointerId)
      setDrag({ x0: e.clientX, start: win.start, end: win.end, cur: win.start })
    }
  }
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drag || !analysis) return
    const rect = e.currentTarget.getBoundingClientRect()
    const len = drag.end - drag.start
    let start = Math.max(0, Math.min(analysis.duration - len, drag.start + ((e.clientX - drag.x0) / rect.width) * analysis.duration))
    // Snap to the nearest downbeat so the edit still starts on "the one".
    const downs = analysis.beats.filter((b) => b.kind === 'downbeat')
    const snap = downs.reduce((a, b) => (Math.abs(b.time - start) < Math.abs(a.time - start) ? b : a), downs[0])
    if (snap && Math.abs(snap.time - start) < 1.2) start = snap.time
    setDrag({ ...drag, cur: start })
  }
  const onPointerUp = () => {
    if (!drag) return
    if (Math.abs(drag.cur - drag.start) > 0.05) {
      setState({ windowOverride: { start: drag.cur, end: drag.cur + (drag.end - drag.start) } })
      makeEdit({ recut: true })
    }
    setDrag(null)
  }

  return (
    <section className="border-b border-line">
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <div className="rule-head flex-1">
          <span className="tag text-signal">01</span>
          <span className="head text-lg">Sound</span>
        </div>
        <button className="btn btn-bare btn-sm btn-sq" title="Replace the song" onClick={() => fileRef.current?.click()}>
          <RefreshCw className="size-3" />
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
      <div className="px-4 pb-4">
        <div className="truncate text-[0.95rem] font-semibold" title={song.name}>
          {song.name}
        </div>
        {analysis ? (
          <>
            <div className="mt-3 grid grid-cols-3 gap-2.5">
              <Stat label="BPM" value={String(Math.round(analysis.bpm))} />
              <Stat
                label={dropOverride !== null ? 'Drop · set' : 'Drops'}
                value={dropOverride !== null ? fmtTime(dropOverride).slice(0, -2) : String(analysis.drops.length)}
                accent
              />
              <Stat label="Length" value={fmtTime(analysis.duration).slice(0, -2)} />
            </div>
            <canvas
              ref={canvasRef}
              className={cx('mt-4 block h-16 w-full touch-none', win && 'cursor-grab', drag && 'cursor-grabbing')}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              title="Drag the boxed stretch to cut a different part of the song"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="tag">{win ? 'Drag the box to move the edit' : ' '}</span>
              {override && (
                <button
                  className="tag text-signal hover:underline"
                  onClick={() => {
                    setState({ windowOverride: null })
                    makeEdit({ recut: true })
                  }}
                >
                  Back to auto
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="mt-3 space-y-2">
            <Progress value={song.status === 'error' ? 0 : song.progress} />
            <div className="tag">{song.status === 'error' ? song.error : `${song.stage}…`}</div>
          </div>
        )}
      </div>
    </section>
  )
}
