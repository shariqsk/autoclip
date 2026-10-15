// 02 FOOTAGE: the bin, as an editor's list. Each row shows the clip, how long it is, where the action
// is (the line) and which moments are on screen in the current take (the blocks).

import { ArrowDown, ArrowUp, Ban, Crown, Link2, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { useRef } from 'react'
import { sourceDuration } from '../lib/edit/speed'
import type { Clip } from '../lib/types'
import { desktop } from '../lib/desktop'
import { addClips, moveClip, openLinkDialog, pinClip, removeClip } from '../state/actions'
import { activeDraft, useApp } from '../state/store'
import { cx } from './format'
import { Progress } from './ui'

function ActionLine({ clip, used }: { clip: Clip; used: [number, number][] }) {
  const a = clip.analysis
  if (!a || a.times.length < 2) return <div className="h-4" />
  const w = 100
  const h = 16
  const pts = a.interest.map((v, i) => `${(i / (a.interest.length - 1)) * w},${h - v * (h - 2) - 1}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-1 h-4 w-full">
      {used.map(([s, e], i) => (
        <rect
          key={i}
          x={(s / a.duration) * w}
          width={Math.max(0.8, ((e - s) / a.duration) * w)}
          y={0}
          height={h}
          fill="var(--signal)"
          opacity={0.35}
        />
      ))}
      {a.cuts.map((c) => (
        <line key={c} x1={(c / a.duration) * w} x2={(c / a.duration) * w} y1={0} y2={h} stroke="var(--ink-3)" strokeWidth={0.6} />
      ))}
      <polyline points={pts} fill="none" stroke="var(--ink)" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function Row({ clip, index, count, used }: { clip: Clip; index: number; count: number; used: [number, number][] }) {
  const thumb = clip.thumbs[Math.min(1, clip.thumbs.length - 1)]
  return (
    <li className={cx('clip-row group relative flex gap-3 border-b border-line px-4 py-2.5', clip.pin === 'skip' && 'opacity-40')}>
      {clip.pin === 'hero' && <span className="absolute inset-y-0 left-0 w-1 bg-signal" />}
      <div className="relative h-11 w-[4.4rem] shrink-0 overflow-hidden bg-bg-3">
        {thumb ? <img src={thumb} alt="" className="size-full object-cover" draggable={false} /> : <div className="halftone size-full" />}
        <span className="mono absolute right-0 bottom-0 bg-black/80 px-1 text-[0.55rem] text-white">
          {clip.kind === 'image' ? 'IMG' : clip.analysis ? `${clip.analysis.duration.toFixed(1)}s` : '–'}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-[0.82rem] font-semibold">{clip.name}</span>
          {clip.pin === 'hero' && <span className="tag text-signal">Hero</span>}
          {clip.pin === 'skip' && <span className="tag">Benched</span>}
        </div>
        {clip.status === 'ready' ? (
          <ActionLine clip={clip} used={used} />
        ) : clip.status === 'error' ? (
          <div className="tag mt-1 flex items-center gap-1 text-signal" title={clip.error}>
            <TriangleAlert className="size-3" /> Can't read this file
          </div>
        ) : (
          <div className="mt-2.5">
            <Progress value={clip.status === 'queued' ? null : clip.progress} />
          </div>
        )}
      </div>
      <div className="absolute top-1.5 right-2 flex bg-bg opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        {[
          { icon: Crown, title: 'Hero: save this clip for the drop', on: clip.pin === 'hero', act: () => pinClip(clip.id, 'hero') },
          { icon: Ban, title: "Bench: don't use this clip", on: clip.pin === 'skip', act: () => pinClip(clip.id, 'skip') },
          { icon: ArrowUp, title: 'Earlier (story order)', on: false, act: () => moveClip(clip.id, -1), hide: index === 0 },
          { icon: ArrowDown, title: 'Later (story order)', on: false, act: () => moveClip(clip.id, 1), hide: index === count - 1 },
          { icon: Trash2, title: 'Remove', on: false, act: () => removeClip(clip.id) },
        ]
          .filter((b) => !b.hide)
          .map(({ icon: Icon, title, on, act }) => (
            <button
              key={title}
              title={title}
              aria-label={title}
              onClick={act}
              className={cx(
                '-ml-px grid size-6 place-items-center border border-line-2 text-ink-2 hover:bg-ink hover:text-bg',
                on && 'border-signal bg-signal text-signal-ink',
              )}
            >
              <Icon className="size-3" />
            </button>
          ))}
      </div>
    </li>
  )
}

export function ClipBin() {
  const clips = useApp((s) => s.clips)
  const demo = useApp((s) => s.demoLoading)
  const draft = useApp((s) => activeDraft(s))
  const inputRef = useRef<HTMLInputElement>(null)
  const watching = clips.filter((c) => c.status === 'analyzing' || c.status === 'queued').length

  const usedBy = (id: string): [number, number][] =>
    draft?.plan.shots
      .filter((s) => s.clipId === id)
      .map((s) => [s.srcStart, s.srcStart + sourceDuration(s.speed, s.end - s.start)] as [number, number]) ?? []

  return (
    <section className="pane block-footage flex min-h-0 flex-col">
      <div className="block-top flex items-center gap-2">
        <div className="block-head flex-1">
          <span className="block-num">02</span>
          <h2 className="block-title">Footage</h2>
          <span className="tag">
            {clips.length}
            {watching > 0 && ` · ${watching} in review`}
          </span>
        </div>
        {desktop && (
          <button
            className="btn btn-sm -mr-1"
            onClick={() => openLinkDialog('', 'video')}
            title="Footage from links: YouTube, TikTok, Instagram, X…"
          >
            <Link2 className="size-3" /> Link
          </button>
        )}
        <button className="btn btn-sm" onClick={() => inputRef.current?.click()}>
          <Plus className="size-3" /> Add
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="video/*,image/*"
          hidden
          onChange={(e) => {
            if (e.target.files?.length) addClips([...e.target.files])
            e.target.value = ''
          }}
        />
      </div>
      {demo !== null && (
        <div className="space-y-1.5 px-4 pb-3">
          <div className="tag">Shooting demo footage · {Math.round(demo * 100)}%</div>
          <Progress value={demo} />
        </div>
      )}
      <ul className="clip-list min-h-0 overflow-y-auto border-t border-line">
        {clips.map((c, i) => (
          <Row key={c.id} clip={c} index={i} count={clips.length} used={usedBy(c.id)} />
        ))}
        <li>
          <button
            onClick={() => inputRef.current?.click()}
            className="tag flex w-full items-center justify-center gap-2 border-b border-dashed border-line-2 px-4 py-4 text-ink-3 hover:bg-bg-2 hover:text-ink"
          >
            <Plus className="size-3" /> Drop videos or photos
          </button>
        </li>
      </ul>
    </section>
  )
}
