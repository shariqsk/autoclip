// Takes: every version of the edit. The Cut / Remix button shoots a new one; the list switches
// between them (pads on Deck, tabs on Studio, polaroids on Flyer, pills on Glass); one toolbar stars,
// duplicates, renames and deletes the take on screen.

import { Copy, Download, PencilLine, Star, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { LayoutId } from '../hooks/useTheme'
import { getStyle } from '../lib/edit/presets'
import { deleteDraft, duplicateDraft, makeEdit, selectDraft } from '../state/actions'
import { activeDraft, setState, updateDraft, useApp, type Draft } from '../state/store'
import { cx } from './format'

export function CutButton({ className, label }: { className?: string; label?: [string, string] }) {
  const takes = useApp((s) => s.drafts.length)
  const canEdit = useApp((s) => !!s.song?.analysis && s.clips.some((c) => c.status === 'ready'))
  const [first, again] = label ?? ['Cut it', 'Remix']
  return (
    <button
      className={cx('slab', className)}
      disabled={!canEdit}
      onClick={() => makeEdit({ remix: takes > 0 })}
      title="Shoot a new take (R)"
    >
      {takes ? again : first}
    </button>
  )
}

export function ExportButton({ className, children }: { className?: string; children?: React.ReactNode }) {
  const has = useApp((s) => !!s.activeDraftId)
  return (
    <button className={cx('btn', className)} disabled={!has} onClick={() => setState({ exportOpen: true })} title="Export (E)">
      {children ?? (
        <>
          <Download className="size-3.5" /> Export
        </>
      )}
    </button>
  )
}

export function TakeActions({ className }: { className?: string }) {
  const d = useApp((s) => activeDraft(s))
  const [renaming, setRenaming] = useState(false)
  if (!d) return null
  if (renaming)
    return (
      <input
        autoFocus
        className={cx('field h-7 w-36 py-0 text-xs', className)}
        defaultValue={d.name}
        onBlur={(e) => {
          updateDraft(d.id, { name: e.target.value.trim() || d.name })
          setRenaming(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') setRenaming(false)
        }}
      />
    )
  const items = [
    {
      icon: Star,
      title: d.starred ? 'Unstar' : 'Star: keep this take (a re-cut never replaces it)',
      act: () => updateDraft(d.id, { starred: !d.starred }),
      on: d.starred,
    },
    { icon: PencilLine, title: 'Rename', act: () => setRenaming(true) },
    { icon: Copy, title: 'Duplicate', act: () => duplicateDraft(d.id) },
    { icon: Trash2, title: 'Delete this take (Shift+⌫)', act: () => deleteDraft(d.id), danger: true },
  ]
  return (
    <div className={cx('take-actions flex items-center', className)}>
      {items.map(({ icon: Icon, title, act, on, danger }) => (
        <button
          key={title}
          title={title}
          aria-label={title}
          onClick={act}
          className={cx('btn btn-bare btn-sm btn-sq', on && 'text-signal', danger && 'hover:text-signal')}
        >
          <Icon className={cx('size-3.5', on && 'fill-current')} />
        </button>
      ))}
    </div>
  )
}

const label = (d: Draft) => d.name.replace(/ #\d+$/, '') || getStyle(d.style).name

function TakeItem({ d, n, active, variant }: { d: Draft; n: number; active: boolean; variant: LayoutId }) {
  const num = String(n).padStart(2, '0')
  const common = {
    role: 'tab',
    'aria-selected': active,
    onClick: () => selectDraft(d.id),
    title: `${label(d)} · ${d.plan.shots.length} shots${d.edited ? ' · edited' : ''}`,
  } as const
  switch (variant) {
    case 'deck':
      return (
        <button {...common} className="deck-pad" data-on={active}>
          <span className="deck-pad-led" />
          <span className="lcd text-lg leading-none">{num}</span>
          <span className="tag truncate">{label(d)}</span>
          {d.starred && <Star className="absolute top-1.5 right-1.5 size-2.5 fill-current text-signal" />}
        </button>
      )
    case 'studio':
      return (
        <button {...common} className="studio-tab" data-on={active}>
          {d.thumb ? (
            <img src={d.thumb} alt="" className="h-6 w-4 rounded-[2px] object-cover" />
          ) : (
            <span className="h-6 w-4 rounded-[2px] bg-bg-3" />
          )}
          <span className="whitespace-nowrap">Take {n}</span>
          <span className="text-ink-3">{label(d)}</span>
          {d.starred && <Star className="size-3 fill-current text-signal" />}
        </button>
      )
    case 'flyer':
      return (
        <button {...common} className="flyer-polaroid" data-on={active} style={{ ['--tilt' as string]: `${((n * 37) % 9) - 4}deg` }}>
          <span className="flyer-polaroid-img">{d.thumb ? <img src={d.thumb} alt="" /> : null}</span>
          <span className="flyer-polaroid-cap">
            take {num}
            {d.starred ? ' ★' : ''}
          </span>
        </button>
      )
    case 'glass':
      return (
        <button {...common} className="glass-pill" data-on={active}>
          {d.thumb ? (
            <img src={d.thumb} alt="" className="size-6 rounded-full object-cover" />
          ) : (
            <span className="size-6 rounded-full bg-bg-3" />
          )}
          <span>{n}</span>
          {d.starred && <Star className="size-3 fill-current" />}
        </button>
      )
  }
}

export function TakeList({ variant, className }: { variant: LayoutId; className?: string }) {
  const drafts = useApp((s) => s.drafts)
  const activeId = useApp((s) => s.activeDraftId)
  return (
    <div className={cx('take-list', `take-list-${variant}`, className)} role="tablist" aria-label="Takes">
      {drafts.map((d, i) => (
        <TakeItem key={d.id} d={d} n={i + 1} active={d.id === activeId} variant={variant} />
      ))}
    </div>
  )
}
