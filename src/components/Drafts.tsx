// Takes: every version of the edit, laid out like film slates. Remix shoots a new take (locked shots
// stay), and you can flip between takes, star keepers, rename, duplicate or bin them.

import { Copy, Download, Star, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getStyle } from '../lib/edit/presets'
import { deleteDraft, duplicateDraft, makeEdit, selectDraft } from '../state/actions'
import { playhead } from '../state/playhead'
import { setState, updateDraft, useApp, type Draft } from '../state/store'
import { cx } from './format'

function Slate({ d, n, active }: { d: Draft; n: number; active: boolean }) {
  const [editing, setEditing] = useState(false)
  const locked = d.plan.shots.filter((s) => s.locked).length
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => selectDraft(d.id)}
      onKeyDown={(e) => e.key === 'Enter' && selectDraft(d.id)}
      className={cx(
        'group relative flex w-48 shrink-0 border bg-bg-2 transition-colors',
        active ? 'border-ink' : 'border-line hover:border-line-2',
      )}
    >
      <div className="relative w-12 shrink-0 overflow-hidden bg-bg-3">
        {d.thumb ? <img src={d.thumb} alt="" className="size-full object-cover" /> : <div className="halftone size-full" />}
      </div>
      <div className="min-w-0 flex-1">
        {/* Clapperboard stripes; the active take's are in signal colour. */}
        <div
          className="h-1.5"
          style={{
            backgroundImage: `repeating-linear-gradient(-45deg, ${active ? 'var(--signal)' : 'var(--ink-3)'} 0 6px, transparent 6px 12px)`,
          }}
        />
        <div className="px-2 pt-1 pb-1.5">
          <div className="flex items-baseline gap-1.5">
            <span className="head text-lg">Take {String(n).padStart(2, '0')}</span>
            {d.starred && <Star className="size-3 fill-signal text-signal" />}
          </div>
          {editing ? (
            <input
              autoFocus
              className="field h-5 px-1 py-0 text-[0.7rem]"
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
            <div className="tag truncate" onDoubleClick={() => setEditing(true)} title="Double-click to rename">
              {d.name.replace(/ #\d+$/, '') || getStyle(d.style).name} · {d.plan.shots.length} shots{d.edited ? ' · edited' : ''}
              {locked ? ` · ${locked} locked` : ''}
            </div>
          )}
        </div>
      </div>
      <div className="absolute top-2.5 right-1 flex flex-col opacity-0 transition-opacity group-hover:opacity-100">
        {[
          {
            icon: Star,
            title: d.starred ? 'Unstar' : 'Star: keep this take (a re-cut never replaces it)',
            act: () => updateDraft(d.id, { starred: !d.starred }),
          },
          { icon: Copy, title: 'Duplicate', act: () => duplicateDraft(d.id) },
          { icon: Trash2, title: 'Bin this take', act: () => deleteDraft(d.id) },
        ].map(({ icon: Icon, title, act }) => (
          <button
            key={title}
            title={title}
            aria-label={title}
            className="grid size-5 place-items-center text-ink-3 hover:text-ink"
            onClick={(e) => {
              e.stopPropagation()
              act()
            }}
          >
            <Icon className="size-3" />
          </button>
        ))}
      </div>
    </div>
  )
}

export function Drafts() {
  const drafts = useApp((s) => s.drafts)
  const activeId = useApp((s) => s.activeDraftId)
  const canEdit = useApp((s) => !!s.song?.analysis && s.clips.some((c) => c.status === 'ready'))

  // Give each take a poster: its drop, once that frame has actually rendered.
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
    <div className="flex h-[4.6rem] shrink-0 items-stretch gap-3 border-t border-line px-3 py-2.5">
      <button
        className="slab min-w-44"
        disabled={!canEdit}
        onClick={() => makeEdit({ remix: drafts.length > 0 })}
        title="Shoot a new take (R)"
      >
        {drafts.length ? 'Remix' : 'Cut it'}
        <span className="mono text-[0.6rem] tracking-widest opacity-70">R</span>
      </button>
      <button className="btn h-auto" disabled={!activeId} onClick={() => setState({ exportOpen: true })} title="Export (E)">
        <Download className="size-3.5" /> Export
      </button>
      <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
        {drafts.length === 0 ? (
          <div className="tag flex flex-1 items-center border border-dashed border-line px-3">
            Takes line up here. Every remix is kept, so you can compare.
          </div>
        ) : (
          drafts.map((d, i) => <Slate key={d.id} d={d} n={i + 1} active={d.id === activeId} />)
        )}
      </div>
    </div>
  )
}
