// Six edit styles. Each tile shows its rhythm: the bars are how long shots hold in quiet, middle and
// loud parts of the song.

import { STYLES, type StylePreset } from '../../lib/edit/presets'
import { makeEdit } from '../../state/actions'
import { updateSettings, useApp } from '../../state/store'
import { cx } from '../format'

function Rhythm({ style }: { style: StylePreset }) {
  // Lay out ~16 beats of each level as blocks proportional to shot length.
  const lane = (beats: number) => {
    const blocks: number[] = []
    let total = 0
    while (total < 16) {
      blocks.push(Math.min(beats, 16 - total))
      total += beats
    }
    return blocks
  }
  return (
    <div className="space-y-[3px]">
      {(['low', 'mid', 'high'] as const).map((level, li) => (
        <div key={level} className="flex h-1.5 gap-[2px]">
          {lane(style.pacing[level]).map((b, i) => (
            <div
              key={i}
              className="rounded-[2px]"
              style={{
                flex: b,
                background: li === 2 ? 'var(--accent)' : li === 1 ? 'var(--accent-2)' : 'var(--ink-3)',
                opacity: 0.55 + li * 0.2,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

export function StylePicker() {
  const current = useApp((s) => s.settings.style)
  const hasSong = useApp((s) => !!s.song?.analysis)
  return (
    <div className="grid grid-cols-2 gap-2">
      {STYLES.map((style) => (
        <button
          key={style.id}
          className="tile p-2.5"
          data-on={current === style.id}
          title={`Best for: ${style.bestFor}`}
          onClick={() => {
            if (current === style.id) return
            updateSettings({ style: style.id })
            if (hasSong) makeEdit({ recut: true })
          }}
        >
          <div className="mb-2 flex items-baseline justify-between">
            <span className={cx('display text-[0.82rem]', current === style.id && 'text-accent')}>{style.name}</span>
          </div>
          <Rhythm style={style} />
          <p className="mt-2 line-clamp-2 text-[0.68rem] leading-snug text-ink-3">{style.tagline}</p>
        </button>
      ))}
    </div>
  )
}
