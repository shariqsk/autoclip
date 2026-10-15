import { getStyle } from '../../lib/edit/presets'
import { GRADES } from '../../lib/render/compositor'
import type { Grade } from '../../lib/types'
import { activeDraft, updateSettings, useApp } from '../../state/store'
import { Slider, Toggle } from '../ui'
import { cx } from '../format'

// A tiny swatch per grade: the same three test colours run through each grade.
const SWATCH: Record<Grade, string> = {
  none: 'linear-gradient(135deg,#d9a273,#4f8fd6 55%,#2f6b3a)',
  punch: 'linear-gradient(135deg,#ff9b4f,#2d7bff 55%,#14a03c)',
  'teal-orange': 'linear-gradient(135deg,#ffa25a,#1a8f97 55%,#0d4f58)',
  mono: 'linear-gradient(135deg,#e5e5e5,#6d6d6d 55%,#151515)',
  warm: 'linear-gradient(135deg,#ffc27a,#a77f5c 55%,#5c4a2a)',
  cold: 'linear-gradient(135deg,#b8d6ff,#4d7eb8 55%,#1f3b5a)',
  vintage: 'linear-gradient(135deg,#e8c99a,#8f9a84 55%,#6b5a48)',
  neon: 'linear-gradient(135deg,#ff4fd8,#29e0ff 55%,#7a2cff)',
}

export function LookPanel() {
  const s = useApp((st) => st.settings)
  const styleId = useApp((st) => activeDraft(st)?.style ?? st.settings.style)
  const base = getStyle(styleId).look
  const grade = s.grade === 'style' ? base.grade : s.grade
  return (
    <>
      <div className="grid grid-cols-4 gap-1.5">
        {(Object.keys(GRADES) as Grade[]).map((g) => (
          <button
            key={g}
            className="tile overflow-hidden p-0"
            data-on={grade === g}
            title={GRADES[g].name}
            onClick={() => updateSettings({ grade: g === base.grade ? 'style' : g })}
          >
            <div className="h-9" style={{ background: SWATCH[g] }} />
            <div className={cx('truncate px-1 py-1 text-center text-[0.62rem] font-semibold', grade === g ? 'text-accent' : 'text-ink-2')}>
              {GRADES[g].name}
            </div>
          </button>
        ))}
      </div>
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
      <Toggle
        label="Letterbox"
        hint="Cinema bars top and bottom"
        checked={s.letterbox === 'style' ? base.letterbox : s.letterbox}
        onChange={(letterbox) => updateSettings({ letterbox })}
      />
      {(s.grade !== 'style' || s.grain !== 'style' || s.vignette !== 'style' || s.letterbox !== 'style') && (
        <button
          className="text-xs font-semibold text-accent hover:underline"
          onClick={() => updateSettings({ grade: 'style', grain: 'style', vignette: 'style', letterbox: 'style' })}
        >
          Reset to {getStyle(styleId).name} defaults
        </button>
      )}
    </>
  )
}
