// The styles (the six built in, then any learned from your edits), drawn for each layout: keys with an LED on Deck, a list on Studio, round
// stickers on Flyer, chips on Glass. Picking one re-cuts the current take.

import { Check, Sparkles, Trash2 } from 'lucide-react'
import { useLook } from '../../hooks/useTheme'
import { type StylePreset } from '../../lib/edit/presets'
import { makeEdit } from '../../state/actions'
import { setState, updateSettings, useApp } from '../../state/store'
import { getSavedStyle, removeLearnedStyle, useAllStyles, useSavedStyles } from '../../state/styles'
import { cx } from '../format'

/** A small sketch of a style's arc: intro holds, the build tightening, the drop, the flurry. */
export function ArcSketch({ style, className }: { style: StylePreset; className?: string }) {
  const blocks: { w: number; h: string; drop?: boolean }[] = []
  for (let i = 0; i < Math.max(1, Math.round(8 / style.intro.beats)); i++) blocks.push({ w: style.intro.beats, h: '35%' })
  for (const b of style.build.pattern) blocks.push({ w: b, h: '60%' })
  blocks.push({ w: style.hero.beats, h: '100%', drop: true })
  for (let i = 0; i < 6; i++) blocks.push({ w: style.flurry.choices[i % style.flurry.choices.length], h: '80%' })
  return (
    <div className={cx('arc-sketch flex h-3 items-end gap-px', className)} aria-hidden="true">
      {blocks.map((b, i) => (
        <div key={i} className={cx('arc-sketch-bar', b.drop && 'arc-sketch-drop')} style={{ flex: b.w, height: b.h }} />
      ))}
    </div>
  )
}

function StyleGrid() {
  const { layout } = useLook()
  const styles = useAllStyles()
  const current = useApp((s) => s.settings.style)
  const hasSong = useApp((s) => !!s.song?.analysis)
  const pick = (id: StylePreset['id']) => {
    if (id === current) return
    updateSettings({ style: id })
    if (hasSong) makeEdit({ recut: true })
  }

  if (layout === 'deck')
    return (
      <div className="grid grid-cols-3 gap-2">
        {styles.map((s, i) => (
          <button
            key={s.id}
            className="deck-key"
            data-on={current === s.id}
            onClick={() => pick(s.id)}
            title={`${s.tagline}. Best for: ${s.bestFor}`}
          >
            <span className="deck-key-led" />
            <span className="tag">{String.fromCharCode(65 + i)}</span>
            <span className="deck-key-name">{s.name}</span>
          </button>
        ))}
      </div>
    )

  if (layout === 'flyer')
    return (
      <div className="flex flex-wrap justify-center gap-3 py-1">
        {styles.map((s, i) => (
          <button
            key={s.id}
            className="flyer-sticker"
            data-on={current === s.id}
            onClick={() => pick(s.id)}
            title={`${s.tagline}. Best for: ${s.bestFor}`}
            style={{ ['--tilt' as string]: `${[-8, 5, -3, 7, -6, 4][i]}deg` }}
          >
            <span>{s.name}</span>
          </button>
        ))}
      </div>
    )

  if (layout === 'glass')
    return (
      <div className="grid grid-cols-2 gap-2">
        {styles.map((s) => (
          <button key={s.id} className="glass-chip" data-on={current === s.id} onClick={() => pick(s.id)} title={`Best for: ${s.bestFor}`}>
            <span className="text-sm font-semibold">{s.name}</span>
            <span className="line-clamp-2 text-[0.7rem] leading-snug opacity-70">{s.tagline}</span>
          </button>
        ))}
      </div>
    )

  // Studio: a list, like a preset browser.
  return (
    <div className="studio-list">
      {styles.map((s) => (
        <button key={s.id} className="studio-row" data-on={current === s.id} onClick={() => pick(s.id)} title={`Best for: ${s.bestFor}`}>
          <span className="min-w-0 flex-1">
            <span className="block text-[0.82rem] font-semibold">{s.name}</span>
            <span className="block truncate text-[0.7rem] text-ink-3">{s.tagline}</span>
          </span>
          <ArcSketch style={s} className="w-20" />
          <Check className={cx('size-3.5 text-signal', current !== s.id && 'invisible')} />
        </button>
      ))}
    </div>
  )
}

/** Under the styles: learn a new one, or teach (or delete) the learned one that's selected. */
function LearnBar() {
  const current = useApp((s) => s.settings.style)
  const hasSong = useApp((s) => !!s.song?.analysis)
  useSavedStyles()
  const mine = getSavedStyle(current)
  return (
    <div className="learn-bar space-y-2">
      {mine && (
        <div className="learn-mine flex items-center gap-2 text-xs">
          <span className="min-w-0 flex-1 truncate text-ink-2">
            Learned from {mine.references.length} edit{mine.references.length === 1 ? '' : 's'}
          </span>
          <button className="btn btn-bare btn-sm" onClick={() => setState({ learn: { styleId: mine.preset.id } })}>
            Teach it more
          </button>
          <button
            className="btn btn-bare btn-sm btn-sq"
            title={`Delete ${mine.preset.name}`}
            aria-label={`Delete ${mine.preset.name}`}
            onClick={() => {
              if (!confirm(`Delete the ${mine.preset.name} style?`)) return
              removeLearnedStyle(mine.preset.id)
              updateSettings({ style: 'hype' })
              if (hasSong) makeEdit({ recut: true })
            }}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      )}
      <button className="btn learn-open w-full" onClick={() => setState({ learn: { styleId: null } })}>
        <Sparkles className="size-3.5" /> Learn a style from your edits
      </button>
    </div>
  )
}

export function StyleList() {
  return (
    <>
      <StyleGrid />
      <LearnBar />
    </>
  )
}
