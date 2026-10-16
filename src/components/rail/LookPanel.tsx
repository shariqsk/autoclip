import { getStyle } from '../../lib/edit/presets'
import { GRADES } from '../../lib/render/compositor'
import type { Grade } from '../../lib/types'
import { activeDraft, updateSettings, useApp } from '../../state/store'
import { cx } from '../format'
import { Slider, SliderBank, Toggle } from '../ui'

// Each swatch is the same three test colours run through the grade.
const SWATCH: Record<Grade, string[]> = {
  none: ['#d9a273', '#4f8fd6', '#2f6b3a'],
  punch: ['#ff9b4f', '#2d7bff', '#14a03c'],
  'teal-orange': ['#ffa25a', '#1a8f97', '#0d4f58'],
  mono: ['#e5e5e5', '#6d6d6d', '#151515'],
  warm: ['#ffc27a', '#a77f5c', '#5c4a2a'],
  cold: ['#b8d6ff', '#4d7eb8', '#1f3b5a'],
  vintage: ['#e8c99a', '#8f9a84', '#6b5a48'],
  neon: ['#ff4fd8', '#29e0ff', '#7a2cff'],
}

export function LookPanel() {
  const s = useApp((st) => st.settings)
  const styleId = useApp((st) => activeDraft(st)?.style ?? st.settings.style)
  const base = getStyle(styleId).look
  const grade = s.grade === 'style' ? base.grade : s.grade
  return (
    <>
      <div className="grid grid-cols-4 border-t border-l border-line-2">
        {(Object.keys(GRADES) as Grade[]).map((g) => (
          <button
            key={g}
            className={cx(
              'border-r border-b border-line-2 p-1 text-left transition-colors',
              grade === g ? 'bg-ink text-bg' : 'hover:bg-bg-2',
            )}
            title={GRADES[g].name}
            onClick={() => updateSettings({ grade: g === base.grade ? 'style' : g })}
          >
            <div className="flex h-7">
              {SWATCH[g].map((c) => (
                <span key={c} className="flex-1" style={{ background: c }} />
              ))}
            </div>
            <div className="mono mt-1 truncate text-[0.55rem] font-semibold tracking-wider uppercase">{GRADES[g].name}</div>
          </button>
        ))}
      </div>
      <SliderBank>
        <Slider
          label="Effect intensity"
          hint="Scales punches, shakes, RGB splits and flashes"
          value={s.intensity}
          min={0}
          max={1.6}
          onChange={(intensity) => updateSettings({ intensity })}
          format={(v) => (v === 0 ? 'Off' : `${Math.round(v * 100)}%`)}
        />
        <Slider
          label="Film grain"
          value={s.grain === 'style' ? base.grain : s.grain}
          max={0.6}
          onChange={(grain) => updateSettings({ grain })}
        />
        <Slider
          label="Vignette"
          value={s.vignette === 'style' ? base.vignette : s.vignette}
          onChange={(vignette) => updateSettings({ vignette })}
        />
      </SliderBank>
      <Toggle
        label="Letterbox"
        hint="Cinema bars top and bottom"
        checked={s.letterbox === 'style' ? base.letterbox : s.letterbox}
        onChange={(letterbox) => updateSettings({ letterbox })}
      />
      {(s.grade !== 'style' || s.grain !== 'style' || s.vignette !== 'style' || s.letterbox !== 'style') && (
        <button
          className="tag text-signal hover:underline"
          onClick={() => updateSettings({ grade: 'style', grain: 'style', vignette: 'style', letterbox: 'style' })}
        >
          Reset to the {getStyle(styleId).name} look
        </button>
      )}
    </>
  )
}
