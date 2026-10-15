// The tape: the whole edit on one clock. The arc on top (cold open, intro, build, drop, flurry,
// outro), the song's waveform underneath with every beat and bar, the shots, and the captions. You can
// see exactly why each cut is where it is. Director mode opens it up: zoom, drag cuts, and the
// inspector for any shot or caption.

import { ChevronDown, ChevronUp, Crosshair, Lock, Minus, Plus, Redo2, Undo2, X, Zap } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { rollCut, snapToBeat } from '../../lib/edit/ops'
import type { EditPlan, ShotPhase } from '../../lib/types'
import { useRenderProject } from '../../hooks/useRenderProject'
import { editPlan, redo, resetCaptions, setDrop, undo } from '../../state/actions'
import { playhead, usePlayhead } from '../../state/playhead'
import { setState, useApp } from '../../state/store'
import { clipColor, cx, PHASE_COLORS, PHASE_NAMES } from '../format'
import { Inspector } from './Inspector'

function Waveform({ plan, width }: { plan: EditPlan; width: number }) {
  const song = useApp((s) => s.song?.analysis)
  const path = useMemo(() => {
    if (!song) return ''
    const buckets = song.peaks.length / 2
    const i0 = Math.floor((plan.songStart / song.duration) * buckets)
    const i1 = Math.ceil((plan.songEnd / song.duration) * buckets)
    const n = Math.max(1, i1 - i0)
    const top: string[] = []
    const bottom: string[] = []
    for (let i = i0; i < i1; i++) {
      const x = ((i - i0) / n) * 1000
      top.push(`${x.toFixed(1)},${(50 - song.peaks[i * 2 + 1] * 48).toFixed(1)}`)
      bottom.unshift(`${x.toFixed(1)},${(50 - song.peaks[i * 2] * 48).toFixed(1)}`)
    }
    return `M${top.join('L')}L${bottom.join('L')}Z`
  }, [song, plan.songStart, plan.songEnd])
  return (
    <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="absolute inset-0 h-full" style={{ width }}>
      <path d={path} fill="var(--ink-3)" />
    </svg>
  )
}

export function Tape() {
  const { draft, plan: rendered } = useRenderProject()
  const director = useApp((s) => s.director)
  const clips = useApp((s) => s.clips)
  const song = useApp((s) => s.song?.analysis)
  const selected = useApp((s) => s.selectedShotId)
  const selectedCaption = useApp((s) => s.selectedCaptionId)
  const dropOverride = useApp((s) => s.dropOverride)
  const { time } = usePlayhead(1 / 60)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [viewW, setViewW] = useState(800)
  const [zoom, setZoom] = useState(2)
  const [drag, setDrag] = useState<{ index: number; t: number } | null>(null)

  // Edit the take's own shots (not the intensity-scaled ones), shown with the rendered captions.
  const plan = useMemo(() => draft && rendered && { ...draft.plan, captions: rendered.captions }, [draft, rendered])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [plan])

  const duration = plan ? plan.songEnd - plan.songStart : 1
  const pxPerSec = director ? 60 * zoom : Math.max(1, viewW - 2) / duration
  const width = duration * pxPerSec
  const x = (t: number) => t * pxPerSec
  const clipIds = clips.map((c) => c.id)

  const beats = useMemo(
    () =>
      song && plan
        ? song.beats
            .filter((b) => b.time >= plan.songStart - 0.01 && b.time <= plan.songEnd)
            .map((b) => ({ ...b, t: b.time - plan.songStart }))
        : [],
    [song, plan],
  )
  const beatTimes = useMemo(() => beats.map((b) => b.t), [beats])

  // The arc: consecutive shots in the same phase, as labelled blocks.
  const arc = useMemo(() => {
    const out: { phase: ShotPhase; start: number; end: number }[] = []
    for (const s of plan?.shots ?? []) {
      const p = s.phase ?? 'ride'
      const last = out[out.length - 1]
      if (last && last.phase === p) last.end = s.end
      else out.push({ phase: p, start: s.start, end: s.end })
    }
    return out
  }, [plan])

  // Bring the selected shot into view when it changes.
  useEffect(() => {
    const el = scrollRef.current
    const shot = plan?.shots.find((s) => s.id === selected)
    if (!el || !director || !shot) return
    const left = shot.start * pxPerSec
    if (left < el.scrollLeft || left > el.scrollLeft + el.clientWidth - 60) el.scrollLeft = Math.max(0, left - el.clientWidth * 0.3)
    // Only on selection or zoom changes, not on every plan edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, director, pxPerSec])

  // Keep the playhead in view while playing, when zoomed in.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !director || !playhead.playing) return
    const px = x(time)
    if (px < el.scrollLeft + 40 || px > el.scrollLeft + el.clientWidth - 80) el.scrollLeft = px - el.clientWidth * 0.25
  })

  if (!plan) return null

  const timeAt = (clientX: number) => {
    const el = scrollRef.current!
    const rect = el.getBoundingClientRect()
    return Math.max(0, Math.min(duration, (clientX - rect.left + el.scrollLeft) / pxPerSec))
  }
  const shown = drag ? rollCut(plan, drag.index, drag.t) : plan
  const seekable = {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      playhead.seek(timeAt(e.clientX))
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => e.buttons === 1 && playhead.seek(timeAt(e.clientX)),
  }

  return (
    <div className={cx('flex shrink-0 flex-col border-t border-line', director ? 'h-[46vh] min-h-[340px]' : 'h-auto')}>
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line px-3">
        <span className="tag mr-1 text-signal">Tape</span>
        <span className="tag hidden lg:inline">Arc · song · shots{plan.captions.length ? ' · text' : ''}</span>
        <div className="ml-auto flex items-center">
          <button
            className="btn btn-bare btn-sm"
            title="Tell AutoClip the drop is here, at the playhead, and re-cut around it"
            onClick={() => setDrop(plan.songStart + playhead.time)}
          >
            <Crosshair className="size-3" /> <span className="hidden sm:inline">Drop is here</span>
          </button>
          {dropOverride !== null && (
            <button className="btn btn-bare btn-sm" title="Go back to the detected drop" onClick={() => setDrop(null)}>
              <X className="size-3" /> <span className="hidden sm:inline">Auto drop</span>
            </button>
          )}
          {director && (
            <>
              <span className="mx-1 h-4 w-px bg-line" />
              <button className="btn btn-bare btn-sm btn-sq" disabled={!draft?.past.length} onClick={undo} title="Undo (⌘Z)">
                <Undo2 className="size-3.5" />
              </button>
              <button className="btn btn-bare btn-sm btn-sq" disabled={!draft?.future.length} onClick={redo} title="Redo (⇧⌘Z)">
                <Redo2 className="size-3.5" />
              </button>
              {draft?.captionsOverride && (
                <button className="btn btn-bare btn-sm" onClick={resetCaptions} title="Throw away caption edits">
                  Reset text
                </button>
              )}
              <button className="btn btn-bare btn-sm btn-sq" onClick={() => setZoom((z) => Math.max(0.5, z / 1.3))} title="Zoom out">
                <Minus className="size-3" />
              </button>
              <span className="mono w-9 text-center text-[0.62rem] text-ink-3">{Math.round(zoom * 50)}%</span>
              <button className="btn btn-bare btn-sm btn-sq" onClick={() => setZoom((z) => Math.min(12, z * 1.3))} title="Zoom in">
                <Plus className="size-3" />
              </button>
            </>
          )}
          <span className="mx-1 h-4 w-px bg-line" />
          <button
            className={cx('btn btn-sm', director && 'btn-signal')}
            onClick={() => setState({ director: !director })}
            title="Director: cut it by hand (D)"
          >
            {director ? <ChevronDown className="size-3" /> : <ChevronUp className="size-3" />} Director
          </button>
        </div>
      </div>

      <div className={cx('flex min-h-0 flex-1', director && 'flex-col lg:flex-row')}>
        <div
          ref={scrollRef}
          className={cx('relative min-h-0 min-w-0 flex-1 select-none', director ? 'overflow-x-auto overflow-y-auto' : 'overflow-hidden')}
          onWheel={(e) => {
            if (!director || (!e.ctrlKey && !e.metaKey)) return
            e.preventDefault()
            setZoom((z) => Math.max(0.5, Math.min(12, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))))
          }}
        >
          <div className="relative" style={{ width: Math.max(width, 1) }}>
            {/* Arc */}
            <div className="relative h-5 cursor-text" {...seekable}>
              {arc.map((a, i) => (
                <div
                  key={i}
                  className="mono absolute top-0 flex h-full items-center overflow-hidden border-r border-bg px-1.5 text-[0.55rem] font-bold tracking-[0.14em] whitespace-nowrap uppercase"
                  style={{
                    left: x(a.start),
                    width: x(a.end) - x(a.start),
                    background: PHASE_COLORS[a.phase],
                    color: a.phase === 'intro' || a.phase === 'outro' || a.phase === 'ride' ? 'var(--bg)' : 'var(--signal-ink)',
                  }}
                >
                  {x(a.end) - x(a.start) > 36 && PHASE_NAMES[a.phase]}
                </div>
              ))}
            </div>

            {/* Song */}
            <div className={cx('relative cursor-text border-b border-line', director ? 'h-12' : 'h-9')} {...seekable}>
              <Waveform plan={plan} width={width} />
              {beats.map((b, i) => (
                <div
                  key={i}
                  className="absolute bottom-0 w-px bg-ink-3"
                  style={{ left: x(b.t), height: b.kind === 'downbeat' ? 10 : 4, opacity: b.kind === 'downbeat' ? 0.9 : 0.5 }}
                >
                  {director && b.kind === 'downbeat' && zoom >= 1 && (
                    <span className="mono absolute -top-3.5 left-1 text-[0.55rem] text-ink-3">{b.bar + 1}</span>
                  )}
                </div>
              ))}
              {plan.hits
                .filter((h) => h.kind === 'drop')
                .map((h) => (
                  <div key={h.time} className="absolute top-0 bottom-0 w-0.5 bg-signal" style={{ left: x(h.time) }}>
                    <Zap className="absolute -top-0.5 -left-1.5 size-3.5 fill-signal text-signal" />
                  </div>
                ))}
            </div>

            {/* Shots */}
            <div className={cx('relative', director ? 'mt-1 h-16' : 'h-10')}>
              {shown.shots.map((s) => {
                const clip = clips.find((c) => c.id === s.clipId)
                const w = x(s.end) - x(s.start)
                return (
                  <div
                    key={s.id}
                    className={cx(
                      'absolute top-0 h-full overflow-hidden border-r border-bg',
                      selected === s.id && 'z-10 outline-2 -outline-offset-2 outline-signal',
                    )}
                    style={{ left: x(s.start), width: Math.max(1, w), background: clipColor(clipIds, s.clipId) }}
                    onClick={() => {
                      setState({ selectedShotId: s.id, selectedCaptionId: null })
                      playhead.seek(s.start + 0.001)
                    }}
                    title={`${clip?.name ?? ''} · ${s.reason}`}
                  >
                    {clip?.thumbs[0] && w > 14 && (
                      <img
                        src={clip.thumbs[0]}
                        alt=""
                        draggable={false}
                        className={cx('absolute inset-0 size-full object-cover', (s.fx.mono ?? 0) > 0.5 && 'grayscale')}
                        style={{ opacity: 0.85 }}
                      />
                    )}
                    {s.locked && <Lock className="absolute top-0.5 left-0.5 size-2.5 text-white drop-shadow" />}
                    {director && w > 46 && (
                      <span className="mono absolute right-0 bottom-0 left-0 truncate bg-black/70 px-1 text-[0.55rem] text-white">
                        {clip?.name}
                      </span>
                    )}
                  </div>
                )
              })}
              {director &&
                shown.shots.slice(1).map((s, k) => (
                  <div
                    key={`cut-${s.id}`}
                    className="group absolute top-0 z-20 h-full w-3 -translate-x-1/2 cursor-ew-resize"
                    style={{ left: x(s.start) }}
                    onPointerDown={(e) => {
                      e.stopPropagation()
                      e.currentTarget.setPointerCapture(e.pointerId)
                      setDrag({ index: k + 1, t: s.start })
                    }}
                    onPointerMove={(e) => {
                      if (!drag) return
                      const raw = timeAt(e.clientX)
                      setDrag({ ...drag, t: e.altKey ? raw : snapToBeat(raw, beatTimes, true, 0.25) })
                    }}
                    onPointerUp={() => {
                      if (drag) editPlan((p) => rollCut(p, drag.index, drag.t))
                      setDrag(null)
                    }}
                    title="Drag to move this cut (snaps to the beat; hold Alt to move freely)"
                  >
                    <div className="mx-auto h-full w-0.5 bg-ink opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                ))}
            </div>

            {/* Text */}
            {plan.captions.length > 0 && (
              <div className={cx('relative mt-px', director ? 'h-7' : 'h-4')}>
                {plan.captions.map((c) => (
                  <button
                    key={c.id}
                    className={cx(
                      'mono absolute top-0 h-full overflow-hidden border border-line-2 bg-bg-2 px-1 text-left text-[0.55rem] whitespace-nowrap text-ink-2 uppercase',
                      selectedCaption === c.id && 'border-signal text-ink',
                      c.nameplate && 'border-signal',
                    )}
                    style={{ left: x(c.start), width: Math.max(3, x(c.end) - x(c.start)) }}
                    onClick={() => {
                      setState({ selectedCaptionId: c.id, selectedShotId: null, director: true })
                      playhead.seek(c.start + 0.01)
                    }}
                    title={c.words.map((w) => w.text).join(' ')}
                  >
                    {director && c.words.map((w) => w.text).join(' ')}
                  </button>
                ))}
              </div>
            )}

            {/* Playhead */}
            <div className="pointer-events-none absolute top-0 bottom-0 z-30 w-px bg-ink" style={{ left: x(time) }}>
              <div className="absolute -top-px -left-[3px] h-2 w-[7px] bg-ink" />
            </div>
          </div>
        </div>
        {director && (
          <div className="max-h-[40vh] min-h-0 shrink-0 overflow-y-auto border-t border-line p-4 lg:max-h-none lg:w-[340px] lg:border-t-0 lg:border-l">
            <Inspector plan={plan} />
          </div>
        )}
      </div>
    </div>
  )
}
