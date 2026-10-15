// Director timeline: a beat ruler with the song's sections and drops, the shot lane (drag any cut;
// it snaps to beats and half-beats) and the caption lane. Zoom with the slider or ⌘/Ctrl + wheel.

import { Lock, Zap } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { rollCut, snapToBeat } from '../../lib/edit/ops'
import type { EditPlan } from '../../lib/types'
import { editPlan } from '../../state/actions'
import { playhead, usePlayhead } from '../../state/playhead'
import { setState, useApp } from '../../state/store'
import { clipColor, cx, SECTION_COLORS } from '../format'

const TRANSITION_GLYPH: Record<string, string> = { fade: '◐', flash: '✦', zoom: '⊕', whip: '≫', glitch: '▚', dip: '●', spin: '↻' }

export function Timeline({ plan, zoom, onZoom }: { plan: EditPlan; zoom: number; onZoom: (z: number) => void }) {
  const song = useApp((s) => s.song?.analysis)
  const clips = useApp((s) => s.clips)
  const selected = useApp((s) => s.selectedShotId)
  const selectedCaption = useApp((s) => s.selectedCaptionId)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ index: number; t: number } | null>(null)
  const { time } = usePlayhead(1 / 60)
  const duration = plan.songEnd - plan.songStart
  const pxPerSec = 60 * zoom
  const width = Math.max(1, duration * pxPerSec)
  const clipIds = clips.map((c) => c.id)
  const x = (t: number) => t * pxPerSec

  const beats = useMemo(
    () =>
      (song?.beats ?? [])
        .filter((b) => b.time >= plan.songStart - 0.01 && b.time <= plan.songEnd)
        .map((b) => ({ ...b, t: b.time - plan.songStart })),
    [song, plan.songStart, plan.songEnd],
  )
  const beatTimes = useMemo(() => beats.map((b) => b.t), [beats])

  // Keep the playhead in view while playing.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !playhead.playing) return
    const px = x(time)
    if (px < el.scrollLeft + 40 || px > el.scrollLeft + el.clientWidth - 80) el.scrollLeft = px - el.clientWidth * 0.25
  })

  const timeAt = (clientX: number) => {
    const el = scrollRef.current!
    const rect = el.getBoundingClientRect()
    return Math.max(0, Math.min(duration, (clientX - rect.left + el.scrollLeft) / pxPerSec))
  }

  const shown = drag ? rollCut(plan, drag.index, drag.t) : plan

  return (
    <div
      ref={scrollRef}
      className="relative min-h-0 overflow-x-auto overflow-y-hidden select-none"
      onWheel={(e) => {
        if (!e.ctrlKey && !e.metaKey) return
        e.preventDefault()
        onZoom(Math.max(0.5, Math.min(12, zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15))))
      }}
    >
      <div className="relative" style={{ width: width + 40 }}>
        {/* Ruler */}
        <div
          className="relative h-7 cursor-text border-b border-line"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            playhead.seek(timeAt(e.clientX))
          }}
          onPointerMove={(e) => e.buttons === 1 && playhead.seek(timeAt(e.clientX))}
        >
          {song?.sections
            .filter((s) => s.end > plan.songStart && s.start < plan.songEnd)
            .map((s) => (
              <div
                key={s.start}
                className="absolute top-0 h-1.5 opacity-80"
                style={{
                  left: x(Math.max(0, s.start - plan.songStart)),
                  width: x(Math.min(duration, s.end - plan.songStart) - Math.max(0, s.start - plan.songStart)),
                  background: SECTION_COLORS[s.label],
                }}
              />
            ))}
          {beats.map((b, i) => (
            <div
              key={i}
              className="absolute bottom-0 w-px bg-ink-3"
              style={{ left: x(b.t), height: b.kind === 'downbeat' ? 12 : 5, opacity: b.kind === 'downbeat' ? 0.8 : 0.4 }}
            >
              {b.kind === 'downbeat' && zoom >= 0.8 && (
                <span className="absolute -top-3.5 left-1 font-mono text-[0.58rem] text-ink-3">{b.bar + 1}</span>
              )}
            </div>
          ))}
          {plan.hits
            .filter((h) => h.kind === 'drop')
            .map((h) => (
              <Zap key={h.time} className="absolute top-1.5 size-3 -translate-x-1/2 fill-current text-accent" style={{ left: x(h.time) }} />
            ))}
        </div>

        {/* Shot lane */}
        <div className="relative mt-2 h-16">
          {shown.shots.map((s) => {
            const clip = clips.find((c) => c.id === s.clipId)
            const w = x(s.end) - x(s.start)
            return (
              <div
                key={s.id}
                className={cx(
                  'absolute top-0 h-full overflow-hidden rounded-md border-2 transition-[box-shadow]',
                  selected === s.id ? 'z-10 border-ink shadow-[0_0_0_2px_var(--accent)]' : 'border-transparent',
                )}
                style={{ left: x(s.start) + 1, width: Math.max(2, w - 2), background: clipColor(clipIds, s.clipId) }}
                onClick={() => {
                  setState({ selectedShotId: s.id, selectedCaptionId: null })
                  playhead.seek(s.start + 0.001)
                }}
              >
                {clip?.thumbs[0] && w > 26 && (
                  <img src={clip.thumbs[0]} alt="" className="absolute inset-0 size-full object-cover opacity-70" draggable={false} />
                )}
                <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/80 to-transparent px-1 pt-3 pb-0.5 text-[0.6rem] font-semibold text-white">
                  {s.locked && <Lock className="size-2.5 shrink-0" />}
                  {w > 50 && <span className="truncate">{clip?.name}</span>}
                  {s.speed.kind !== 'constant' || s.speed.speed !== 1 ? <span className="ml-auto font-mono opacity-80">⏱</span> : null}
                </div>
                {s.transition.type !== 'cut' && (
                  <span
                    className="absolute top-0.5 left-0.5 rounded bg-black/70 px-1 text-[0.6rem] leading-tight text-white"
                    title={s.transition.type}
                  >
                    {TRANSITION_GLYPH[s.transition.type]}
                  </span>
                )}
              </div>
            )
          })}
          {/* Cut handles between shots */}
          {shown.shots.slice(1).map((s, k) => (
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
              title="Drag to move this cut (snaps to beats; hold Alt for free movement)"
            >
              <div className="mx-auto h-full w-0.5 bg-ink opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
          ))}
        </div>

        {/* Caption lane */}
        <div className="relative mt-1.5 h-7">
          {plan.captions.map((c) => (
            <button
              key={c.id}
              className={cx(
                'absolute top-0 h-full overflow-hidden rounded-md border border-line bg-panel-2 px-1 text-left text-[0.62rem] font-medium whitespace-nowrap text-ink-2',
                selectedCaption === c.id && 'border-accent text-ink',
                c.title && 'font-bold uppercase',
              )}
              style={{ left: x(c.start) + 1, width: Math.max(4, x(c.end) - x(c.start) - 2) }}
              onClick={() => {
                setState({ selectedCaptionId: c.id, selectedShotId: null })
                playhead.seek(c.start + 0.01)
              }}
              title={c.words.map((w) => w.text).join(' ')}
            >
              {c.words.map((w) => w.text).join(' ')}
            </button>
          ))}
        </div>

        {/* Playhead */}
        <div className="pointer-events-none absolute top-0 bottom-0 z-30 w-0.5 bg-accent" style={{ left: x(time) }}>
          <div className="absolute -top-0.5 -left-1 size-2.5 rotate-45 bg-accent" />
        </div>
      </div>
    </div>
  )
}
