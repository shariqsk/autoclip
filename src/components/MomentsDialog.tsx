// Moments: cut a long clip into its best few seconds. AutoClip suggests moments from the clip's action
// score; preview them, trim them, drag across the timeline to add your own, and add the ones you
// pick as clips of their own.

import { Check, Minus, Play, Plus, Scissors } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { findMoments } from '../lib/video/moments'
import { grabPosters } from '../lib/video/posters'
import type { Clip } from '../lib/types'
import { addMoments } from '../state/actions'
import { setState, useApp } from '../state/store'
import { cx, fmtTime } from './format'
import { Modal } from './Modal'
import { Toggle } from './ui'

interface Pick {
  key: string
  start: number
  end: number
  peak: number
  score: number
  selected: boolean
  poster?: string
}

const MIN = 1
const MAX = 15

function Timeline({
  clip,
  picks,
  active,
  playhead,
  onActivate,
  onCreate,
}: {
  clip: Clip
  picks: Pick[]
  active: string | null
  playhead: number | null
  onActivate: (key: string) => void
  onCreate: (start: number, end: number) => void
}) {
  const a = clip.analysis!
  const ref = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null)
  const W = 1000
  const H = 64
  const x = (t: number) => (t / a.duration) * W
  const timeAt = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect()
    return Math.min(a.duration, Math.max(0, ((clientX - r.left) / r.width) * a.duration))
  }
  const curve = a.interest.map((v, i) => `${x(a.times[i])},${H - 6 - v * (H - 14)}`).join(' ')
  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="moments-timeline h-16 w-full cursor-crosshair touch-none select-none"
      onPointerDown={(e) => {
        if ((e.target as Element).closest('[data-pick]')) return
        e.currentTarget.setPointerCapture(e.pointerId)
        const t = timeAt(e.clientX)
        setDrag({ from: t, to: t })
      }}
      onPointerMove={(e) => drag && setDrag({ ...drag, to: timeAt(e.clientX) })}
      onPointerUp={() => {
        if (!drag) return
        const s = Math.min(drag.from, drag.to)
        const len = Math.abs(drag.to - drag.from)
        setDrag(null)
        if (len >= 0.4) onCreate(s, Math.min(a.duration, s + Math.min(MAX, Math.max(MIN, len))))
      }}
    >
      {a.cuts.map((c) => (
        <line key={c} x1={x(c)} x2={x(c)} y1={0} y2={H} className="moments-cut" vectorEffect="non-scaling-stroke" />
      ))}
      {picks.map((p) => (
        <rect
          key={p.key}
          data-pick
          x={x(p.start)}
          width={Math.max(2, x(p.end) - x(p.start))}
          y={2}
          height={H - 4}
          rx={3}
          className={cx('moments-block cursor-pointer', p.selected && 'moments-block-on', p.key === active && 'moments-block-active')}
          vectorEffect="non-scaling-stroke"
          onClick={() => onActivate(p.key)}
        />
      ))}
      <polyline points={curve} fill="none" className="moments-curve pointer-events-none" vectorEffect="non-scaling-stroke" />
      {drag && (
        <rect
          x={x(Math.min(drag.from, drag.to))}
          width={Math.abs(x(drag.to) - x(drag.from))}
          y={2}
          height={H - 4}
          className="moments-drag pointer-events-none"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {playhead !== null && (
        <line x1={x(playhead)} x2={x(playhead)} y1={0} y2={H} className="moments-head" vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  )
}

function MomentsBody({ clip }: { clip: Clip }) {
  const a = clip.analysis!
  const offset = clip.offset ?? 0
  const initial = useMemo(() => {
    const found = findMoments(a)
    // Pre-pick the standouts only; the rest are a click away.
    const best = Math.max(0, ...found.map((m) => m.score))
    const top = [...found]
      .sort((x, y) => y.score - x.score)
      .filter((m, i) => i === 0 || m.score >= best * 0.75)
      .slice(0, 6)
    return found.map((m, i) => ({ ...m, key: `m${i}`, selected: top.includes(m) }))
  }, [a])
  const [picks, setPicks] = useState<Pick[]>(initial)
  const [active, setActive] = useState<string | null>(initial[0]?.key ?? null)
  const [bench, setBench] = useState(true)
  const [playhead, setPlayhead] = useState<number | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const counter = useRef(initial.length)

  const current = picks.find((p) => p.key === active) ?? null

  // Posters for the cards, at each moment's peak. Ones that don't become clips are freed on close.
  const posters = useRef(new Set<string>())
  const kept = useRef(new Set<string>())
  const fetchPosters = (todo: { key: string; peak: number }[]) =>
    grabPosters(
      clip.url,
      todo.map((p) => offset + p.peak),
    )
      .then((urls) => {
        urls.forEach((u) => posters.current.add(u))
        setPicks((ps) =>
          ps.map((p) => {
            const k = todo.findIndex((t) => t.key === p.key)
            return k >= 0 ? { ...p, poster: urls[k] } : p
          }),
        )
      })
      .catch(() => {})
  useEffect(() => {
    void fetchPosters(initial)
    const owned = posters.current
    const keep = kept.current
    return () => owned.forEach((u) => !keep.has(u) && URL.revokeObjectURL(u))
    // Once, for the moments found when the dialog opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Loop the active moment in the preview.
  useEffect(() => {
    const v = videoRef.current
    if (!v || !current) return
    v.currentTime = offset + current.start
    void v.play().catch(() => {})
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (v.currentTime >= offset + current.end || v.currentTime < offset + current.start - 0.5) v.currentTime = offset + current.start
      setPlayhead(v.currentTime - offset)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [current, offset])

  const patch = (key: string, p: Partial<Pick>) => setPicks((ps) => ps.map((x) => (x.key === key ? { ...x, ...p } : x)))
  const nudge = (edge: 'start' | 'end', by: number) => {
    if (!current) return
    const start = edge === 'start' ? Math.min(current.end - MIN, Math.max(0, current.start + by)) : current.start
    const end = edge === 'end' ? Math.max(current.start + MIN, Math.min(a.duration, current.end + by)) : current.end
    patch(current.key, { start, end, selected: true })
  }
  const create = (start: number, end: number) => {
    const key = `m${counter.current++}`
    const pick: Pick = { key, start, end, peak: (start + end) / 2, score: 0, selected: true }
    setPicks((ps) => [...ps, pick].sort((x, y) => x.start - y.start))
    setActive(key)
    void fetchPosters([pick])
  }

  const chosen = picks.filter((p) => p.selected)
  const add = () => {
    chosen.forEach((p) => p.poster && kept.current.add(p.poster))
    addMoments(
      clip.id,
      chosen.map((p) => ({ start: p.start, end: p.end, poster: p.poster })),
      bench,
    )
    setState({ moments: null })
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="moments-preview relative grid aspect-video place-items-center overflow-hidden bg-black">
          <video ref={videoRef} src={clip.url} muted playsInline className="size-full object-contain" />
          {!current && <div className="tag absolute text-white/70">Pick a moment</div>}
        </div>
        <div className="flex flex-col gap-3">
          <p className="text-sm leading-relaxed text-ink-2">
            {picks.length
              ? `AutoClip found ${initial.length} moment${initial.length === 1 ? '' : 's'} with the most going on and picked the standouts. Drag across the timeline to add your own.`
              : 'Nothing stands out on its own here. Drag across the timeline to pick moments yourself.'}
          </p>
          {current && (
            <div className="space-y-2">
              <div className="tag">
                {fmtTime(offset + current.start)} – {fmtTime(offset + current.end)} · {(current.end - current.start).toFixed(1)}s
              </div>
              {(['start', 'end'] as const).map((edge) => (
                <div key={edge} className="flex items-center gap-2">
                  <span className="w-10 text-xs text-ink-3 capitalize">{edge}</span>
                  <button className="btn btn-sm btn-sq" title={`${edge} half a second earlier`} onClick={() => nudge(edge, -0.5)}>
                    <Minus className="size-3" />
                  </button>
                  <button className="btn btn-sm btn-sq" title={`${edge} half a second later`} onClick={() => nudge(edge, 0.5)}>
                    <Plus className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Timeline clip={clip} picks={picks} active={active} playhead={playhead} onActivate={setActive} onCreate={create} />

      {picks.length > 0 && (
        <>
          <div className="flex items-center gap-3">
            <span className="tag">
              {chosen.length} of {picks.length} picked
            </span>
            <button className="tag ml-auto hover:text-ink" onClick={() => setPicks((ps) => ps.map((p) => ({ ...p, selected: true })))}>
              All
            </button>
            <button className="tag hover:text-ink" onClick={() => setPicks((ps) => ps.map((p) => ({ ...p, selected: false })))}>
              None
            </button>
          </div>
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {picks.map((p) => (
              <li
                key={p.key}
                className={cx(
                  'moment-card relative overflow-hidden',
                  p.key === active && 'moment-card-active',
                  p.selected && 'moment-card-on',
                )}
              >
                <button className="block w-full text-left" onClick={() => setActive(p.key)} title="Preview">
                  <span className="relative block aspect-video bg-bg-3">
                    {p.poster && <img src={p.poster} alt="" className="size-full object-cover" />}
                    {p.key === active && <Play className="absolute right-1.5 bottom-1.5 size-4 fill-white text-white drop-shadow" />}
                  </span>
                  <span className="flex items-center gap-2 px-2 py-1.5">
                    <span className="mono text-[0.68rem]">{fmtTime(offset + p.start)}</span>
                    <span className="text-[0.68rem] text-ink-3">{(p.end - p.start).toFixed(1)}s</span>
                    {p.score > 0 && (
                      <span className="moment-meter ml-auto h-1 w-10 overflow-hidden rounded-full">
                        <span className="block h-full" style={{ width: `${Math.round(p.score * 100)}%` }} />
                      </span>
                    )}
                  </span>
                </button>
                <button
                  role="checkbox"
                  aria-checked={p.selected}
                  aria-label={`Use the moment at ${fmtTime(offset + p.start)}`}
                  className="moment-check absolute top-1.5 left-1.5 grid size-6 place-items-center"
                  onClick={() => patch(p.key, { selected: !p.selected })}
                >
                  {p.selected && <Check className="size-3.5" />}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="flex flex-wrap items-center gap-4 pt-1">
        <div className="min-w-56 flex-1">
          <Toggle label="Bench the full clip" hint="The edit uses only the moments you add." checked={bench} onChange={setBench} />
        </div>
        <button className="btn btn-signal h-10 px-5" disabled={!chosen.length} onClick={add}>
          <Scissors className="size-4" /> Add {chosen.length || ''} moment{chosen.length === 1 ? '' : 's'}
        </button>
      </div>
    </div>
  )
}

export function MomentsDialog() {
  const open = useApp((s) => s.moments)
  const clip = useApp((s) => s.clips.find((c) => c.id === s.moments?.clipId))
  if (!open || !clip?.analysis) return null
  return (
    <Modal wide onClose={() => setState({ moments: null })} title={clip.name} kicker="Moments">
      <MomentsBody clip={clip} />
    </Modal>
  )
}
