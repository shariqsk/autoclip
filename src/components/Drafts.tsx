// Drafts: every version of the edit, side by side. Remix makes a new one (keeping locked shots),
// and you can flip between them, star the keepers, rename, duplicate or delete.

import { Copy, Download, Dices, Star, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { deleteDraft, duplicateDraft, makeEdit, selectDraft } from '../state/actions'
import { playhead } from '../state/playhead'
import { setState, updateDraft, useApp, type Draft } from '../state/store'
import { Kbd } from './ui'
import { cx } from './format'

function DraftCard({ d, active, index }: { d: Draft; active: boolean; index: number }) {
  const [editing, setEditing] = useState(false)
  const locked = d.plan.shots.filter((s) => s.locked).length
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => selectDraft(d.id)}
      onKeyDown={(e) => e.key === 'Enter' && selectDraft(d.id)}
      className={cx('tile group relative flex w-40 shrink-0 gap-2 p-1.5', active && 'rise')}
      data-on={active}
    >
      <div className="relative h-14 w-11 shrink-0 overflow-hidden rounded-md bg-well">
        {d.thumb ? <img src={d.thumb} alt="" className="size-full object-cover" /> : <div className="shimmer size-full" />}
        <span className="absolute bottom-0.5 left-0.5 rounded bg-black/70 px-1 font-mono text-[0.55rem] text-white">{index + 1}</span>
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        {editing ? (
          <input
            autoFocus
            className="field h-6 px-1.5 py-0 text-xs"
            defaultValue={d.name}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              updateDraft(d.id, { name: e.target.value.trim() || d.name })
              setEditing(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') setEditing(false)
            }}
          />
        ) : (
          <div className="truncate text-xs font-semibold" onDoubleClick={() => setEditing(true)} title="Double-click to rename">
            {d.name}
          </div>
        )}
        <div className="font-mono text-[0.62rem] text-ink-3">
          {d.plan.shots.length} shots{d.edited ? ' · edited' : ''}
          {locked ? ` · ${locked} 🔒` : ''}
        </div>
        <div className="mt-1 flex gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
          <button
            className={cx('btn btn-ghost h-5 w-5 rounded p-0', d.starred && 'text-accent-2 opacity-100')}
            title={d.starred ? 'Unstar' : 'Star: keep this one (a re-cut never replaces a starred draft)'}
            onClick={(e) => {
              e.stopPropagation()
              updateDraft(d.id, { starred: !d.starred })
            }}
          >
            <Star className={cx('size-3', d.starred && 'fill-current')} />
          </button>
          <button
            className="btn btn-ghost h-5 w-5 rounded p-0"
            title="Duplicate"
            onClick={(e) => {
              e.stopPropagation()
              duplicateDraft(d.id)
            }}
          >
            <Copy className="size-3" />
          </button>
          <button
            className="btn btn-ghost h-5 w-5 rounded p-0 hover:text-hot"
            title="Delete"
            onClick={(e) => {
              e.stopPropagation()
              deleteDraft(d.id)
            }}
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      </div>
    </div>
  )
}

export function Drafts() {
  const drafts = useApp((s) => s.drafts)
  const activeId = useApp((s) => s.activeDraftId)
  const canEdit = useApp((s) => !!s.song?.analysis && s.clips.some((c) => c.status === 'ready'))

  // Give each draft a poster: its first drop, once that frame has actually rendered.
  useEffect(() => {
    const d = drafts.find((x) => x.id === activeId)
    if (!d || d.thumb) return
    const hero = d.plan.hits.find((h) => h.kind === 'drop')?.time ?? (d.plan.shots[1]?.start ?? 0) + 0.2
    let cancelled = false
    const timer = setTimeout(() => {
      playhead.engine?.capture(hero + 0.3).then((thumb) => !cancelled && updateDraft(d.id, { thumb }))
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [activeId, drafts])

  return (
    <div className="flex items-center gap-3">
      <div className="flex shrink-0 flex-col gap-2">
        <button
          className="btn btn-primary btn-xl"
          disabled={!canEdit}
          onClick={() => makeEdit({ remix: drafts.length > 0 })}
          title="Cut a new version (R)"
        >
          <Dices className="size-5" />
          {drafts.length ? 'Remix' : 'Make the edit'}
          <span className="hidden opacity-70 xl:inline">
            <Kbd>R</Kbd>
          </span>
        </button>
        <button className="btn" disabled={!activeId} onClick={() => setState({ exportOpen: true })} title="Export MP4 (E)">
          <Download className="size-4" /> Export
        </button>
      </div>
      <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
        {drafts.length === 0 ? (
          <div className="grid h-[4.6rem] flex-1 place-items-center rounded-[var(--r-ctl)] border border-dashed border-line text-xs text-ink-3">
            Your drafts will line up here. Every remix is kept so you can compare.
          </div>
        ) : (
          drafts.map((d, i) => <DraftCard key={d.id} d={d} index={i} active={d.id === activeId} />)
        )}
      </div>
    </div>
  )
}
