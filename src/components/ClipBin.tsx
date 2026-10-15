// The footage: one tile per clip with poster frames, analysis progress, an "interest" sparkline that
// shows where AutoClip found the action, and quick controls (hero, skip, reorder, remove).

import { ArrowDown, ArrowUp, Ban, Crown, Film, ImageIcon, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { useRef } from 'react'
import { addClips, moveClip, pinClip, removeClip } from '../state/actions'
import { activeDraft, useApp } from '../state/store'
import { sourceDuration } from '../lib/edit/speed'
import type { Clip } from '../lib/types'
import { Ring } from './ui'
import { cx } from './format'

function Sparkline({ clip, used }: { clip: Clip; used: [number, number][] }) {
  const a = clip.analysis
  if (!a || a.times.length < 2) return null
  const w = 100
  const h = 22
  const pts = a.interest.map((v, i) => `${(i / (a.interest.length - 1)) * w},${h - v * (h - 2) - 1}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-5 w-full">
      {used.map(([s, e], i) => (
        <rect
          key={i}
          x={(s / a.duration) * w}
          width={Math.max(0.8, ((e - s) / a.duration) * w)}
          y={0}
          height={h}
          fill="var(--accent)"
          opacity={0.22}
        />
      ))}
      {a.cuts.map((c) => (
        <line
          key={c}
          x1={(c / a.duration) * w}
          x2={(c / a.duration) * w}
          y1={0}
          y2={h}
          stroke="var(--ink-3)"
          strokeDasharray="1.5 1.5"
          strokeWidth={0.6}
        />
      ))}
      <polyline points={pts} fill="none" stroke="var(--accent-2)" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function ClipTile({ clip, index, count, used }: { clip: Clip; index: number; count: number; used: [number, number][] }) {
  const thumb = clip.thumbs[Math.min(1, clip.thumbs.length - 1)]
  return (
    <div className={cx('tile group overflow-hidden', clip.pin === 'skip' && 'opacity-45', clip.pin === 'hero' && 'border-accent-2')}>
      <div className="relative aspect-video overflow-hidden bg-well">
        {thumb ? <img src={thumb} alt="" className="size-full object-cover" draggable={false} /> : <div className="shimmer size-full" />}
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/75 to-transparent px-1.5 pt-4 pb-1 text-[0.65rem] font-semibold text-white">
          {clip.kind === 'image' ? <ImageIcon className="size-3" /> : <Film className="size-3" />}
          <span className="truncate">{clip.name}</span>
          {clip.analysis && clip.kind === 'video' && (
            <span className="ml-auto font-mono opacity-80">{clip.analysis.duration.toFixed(1)}s</span>
          )}
        </div>
        {clip.status !== 'ready' && (
          <div className="absolute inset-0 grid place-items-center bg-black/40 text-white">
            {clip.status === 'error' ? (
              <span className="flex items-center gap-1 px-2 text-center text-[0.65rem]" title={clip.error}>
                <TriangleAlert className="size-3.5 shrink-0" /> Can't read
              </span>
            ) : (
              <Ring value={clip.status === 'queued' ? null : clip.progress} size={22} />
            )}
          </div>
        )}
        {clip.pin === 'hero' && (
          <span className="absolute top-1 left-1 flex items-center gap-0.5 rounded-md bg-accent-2 px-1 py-0.5 text-[0.6rem] font-bold text-black">
            <Crown className="size-2.5" /> HERO
          </span>
        )}
        <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          {[
            { icon: Crown, title: 'Hero: save this clip for the drop', on: clip.pin === 'hero', act: () => pinClip(clip.id, 'hero') },
            { icon: Ban, title: "Skip: don't use this clip", on: clip.pin === 'skip', act: () => pinClip(clip.id, 'skip') },
            { icon: ArrowUp, title: 'Move earlier (story order)', on: false, act: () => moveClip(clip.id, -1), hide: index === 0 },
            { icon: ArrowDown, title: 'Move later (story order)', on: false, act: () => moveClip(clip.id, 1), hide: index === count - 1 },
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
                  'grid size-6 place-items-center rounded-md bg-black/60 text-white backdrop-blur hover:bg-black/85',
                  on && 'bg-accent-2 text-black hover:bg-accent-2',
                )}
              >
                <Icon className="size-3" />
              </button>
            ))}
        </div>
      </div>
      <div className="px-1.5 pt-1 pb-1">
        <Sparkline clip={clip} used={used} />
      </div>
    </div>
  )
}

export function ClipBin() {
  const clips = useApp((s) => s.clips)
  const demo = useApp((s) => s.demoLoading)
  const draft = useApp((s) => activeDraft(s))
  const inputRef = useRef<HTMLInputElement>(null)
  const analyzing = clips.filter((c) => c.status === 'analyzing' || c.status === 'queued').length

  const usedBy = (id: string): [number, number][] =>
    draft?.plan.shots
      .filter((s) => s.clipId === id)
      .map((s) => [s.srcStart, s.srcStart + sourceDuration(s.speed, s.end - s.start)] as [number, number]) ?? []

  return (
    <div className="panel flex min-h-0 flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-4 pt-3.5 pb-2.5">
        <span className="label">Footage</span>
        <span className="font-mono text-[0.7rem] text-ink-3">
          {clips.length} clip{clips.length === 1 ? '' : 's'}
          {analyzing > 0 && ` · watching ${analyzing}`}
        </span>
        <button className="btn btn-sm ml-auto" onClick={() => inputRef.current?.click()}>
          <Plus className="size-3.5" /> Add
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
        <div className="mx-4 mb-3 space-y-1">
          <div className="text-[0.7rem] text-ink-3">Rendering demo footage… {Math.round(demo * 100)}%</div>
          <div className="h-1 overflow-hidden rounded-full bg-well">
            <div className="h-full bg-accent transition-[width]" style={{ width: `${demo * 100}%` }} />
          </div>
        </div>
      )}
      {clips.length === 0 && demo === null ? (
        <button
          onClick={() => inputRef.current?.click()}
          className="mx-4 mb-4 grid h-28 place-items-center rounded-[var(--r-ctl)] border border-dashed border-line text-sm text-ink-3 transition-colors hover:border-accent hover:text-ink"
        >
          Drop videos or photos here
        </button>
      ) : clips.length === 0 ? null : (
        <div className="grid min-h-0 grid-cols-2 gap-2 overflow-y-auto px-4 pb-4">
          {clips.map((c, i) => (
            <ClipTile key={c.id} clip={c} index={i} count={clips.length} used={usedBy(c.id)} />
          ))}
        </div>
      )}
    </div>
  )
}
