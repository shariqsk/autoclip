// 03 STYLE: each style as a poster line. The bar on the right sketches its arc: how long the intro
// holds, how the build tightens, the drop and the flurry after it.

import { STYLES, type StylePreset } from '../../lib/edit/presets'
import { makeEdit } from '../../state/actions'
import { updateSettings, useApp } from '../../state/store'
import { cx } from '../format'

function ArcSketch({ style, on }: { style: StylePreset; on: boolean }) {
  const blocks: { w: number; kind: 'intro' | 'build' | 'hero' | 'flurry' }[] = []
  for (let i = 0; i < Math.max(1, Math.round(8 / style.intro.beats)); i++) blocks.push({ w: style.intro.beats, kind: 'intro' })
  for (const b of style.build.pattern) blocks.push({ w: b, kind: 'build' })
  blocks.push({ w: style.hero.beats, kind: 'hero' })
  for (let i = 0; i < 6; i++) blocks.push({ w: style.flurry.choices[i % style.flurry.choices.length], kind: 'flurry' })
  return (
    <div className="flex h-3 w-28 shrink-0 items-end gap-px" aria-hidden="true">
      {blocks.map((b, i) => (
        <div
          key={i}
          style={{ flex: b.w, height: b.kind === 'hero' ? '100%' : b.kind === 'intro' ? '35%' : b.kind === 'build' ? '60%' : '80%' }}
          className={cx(on ? 'bg-signal-ink' : b.kind === 'hero' ? 'bg-signal' : 'bg-ink-3')}
        />
      ))}
    </div>
  )
}

export function StyleList() {
  const current = useApp((s) => s.settings.style)
  const hasSong = useApp((s) => !!s.song?.analysis)
  return (
    <div className="-mx-4 border-t border-line">
      {STYLES.map((style, i) => {
        const on = current === style.id
        return (
          <button
            key={style.id}
            className={cx(
              'group flex w-full items-center gap-3 border-b border-line px-4 py-2.5 text-left transition-colors',
              on ? 'bg-signal text-signal-ink' : 'hover:bg-bg-2',
            )}
            onClick={() => {
              if (on) return
              updateSettings({ style: style.id })
              if (hasSong) makeEdit({ recut: true })
            }}
            title={`Best for: ${style.bestFor}`}
          >
            <span className={cx('tag w-4', on ? 'text-signal-ink' : 'text-ink-3')}>{String.fromCharCode(65 + i)}</span>
            <span className="min-w-0 flex-1">
              <span className="head block text-[1.6rem]">{style.name}</span>
              <span className={cx('mt-1 block truncate text-[0.72rem] leading-tight', on ? 'text-signal-ink/80' : 'text-ink-3')}>
                {style.tagline}
              </span>
            </span>
            <ArcSketch style={style} on={on} />
          </button>
        )
      })}
    </div>
  )
}
