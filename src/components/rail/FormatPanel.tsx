import { makeEdit } from '../../state/actions'
import { autoFindFaces } from '../../state/people'
import { ASPECTS, LENGTHS } from '../../state/settings'
import { getStyle } from '../../lib/edit/presets'
import { activeDraft, getState, setState, updateSettings, useApp } from '../../state/store'
import { Seg, Slider, Toggle } from '../ui'

const recut = () => getState().song?.analysis && getState().drafts.length && makeEdit({ recut: true })

export function FormatPanel() {
  const s = useApp((st) => st.settings)
  const styleId = useApp((st) => activeDraft(st)?.style ?? st.settings.style)
  const styleFit = getStyle(styleId).look.fit ?? 'fill'
  const fit = s.framing === 'style' ? styleFit : s.framing
  const styleCollage = !!getStyle(styleId).collage
  const collage = s.collage === 'style' ? styleCollage : s.collage
  return (
    <>
      <div className="segs">
        {ASPECTS.map((a) => {
          const k = 22 / Math.max(a.w, a.h)
          return (
            <button
              key={a.id}
              className="opt h-16 flex-col gap-1.5"
              data-on={s.aspect === a.id}
              onClick={() => {
                updateSettings({ aspect: a.id })
                autoFindFaces()
              }}
              title={`${a.label}: ${a.note}`}
            >
              <span className="border-[1.5px] border-current" style={{ width: a.w * k, height: a.h * k }} />
              {a.id}
            </button>
          )
        })}
      </div>
      <p className="tag -mt-1.5">{ASPECTS.find((a) => a.id === s.aspect)!.note}</p>

      <div className="space-y-1.5">
        <div className="tag">Length</div>
        <Seg
          value={s.length}
          onChange={(length) => {
            updateSettings({ length })
            setState({ windowOverride: null })
            recut()
          }}
          options={LENGTHS.map((l) => ({ value: l.value, label: l.value === 'full' ? 'Full' : l.label }))}
        />
      </div>

      <div className="space-y-1.5">
        <div className="tag">Framing</div>
        <Seg
          value={fit}
          onChange={(f) => updateSettings({ framing: f === styleFit ? 'style' : f })}
          options={[
            { value: 'fill', label: 'Crop to fill', title: 'Fill the frame, following the people and the action' },
            { value: 'blur', label: 'Blurred', title: 'The whole shot over a blurred copy of itself' },
            { value: 'bars', label: 'Black bars', title: 'The whole shot on black, nothing cropped' },
          ]}
        />
      </div>

      <div className="space-y-1.5">
        <div className="tag">Flow</div>
        <Seg
          value={s.flow}
          onChange={(flow) => {
            updateSettings({ flow })
            recut()
          }}
          options={[
            { value: 'story', label: 'Start to end', title: 'Move through your footage in order, clip by clip, from its start to its end' },
            { value: 'peaks', label: 'Best on the hits', title: 'Put the strongest moments wherever the music hits hardest' },
          ]}
        />
      </div>

      <div className="space-y-1.5">
        <div className="tag">Cuts</div>
        <Seg
          value={s.pace}
          onChange={(pace) => {
            updateSettings({ pace })
            recut()
          }}
          options={[
            { value: 'slow', label: 'Slower', title: 'Hold every shot about twice as long' },
            { value: 'style', label: 'Style', title: "The style's own pace" },
            { value: 'fast', label: 'Faster', title: 'Cut about twice as often, down to the shortest shot the style allows' },
          ]}
        />
      </div>

      <Toggle
        label="Collage intro"
        hint="The first shots arrive in picture-in-picture panels over each other"
        checked={collage}
        onChange={(on) => {
          updateSettings({ collage: on === styleCollage ? 'style' : on })
          recut()
        }}
      />

      <Toggle
        label="Cut on hits"
        hint="Strums, stabs and fills get their own cuts, not just the beat"
        checked={s.hitCuts}
        onChange={(hitCuts) => {
          updateSettings({ hitCuts })
          recut()
        }}
      />

      <Slider
        label="Remix variety"
        hint="How different each remix is from the last"
        value={s.variety}
        onChange={(variety) => updateSettings({ variety })}
        format={(v) => (v < 0.3 ? 'Subtle' : v < 0.7 ? 'Balanced' : 'Wild')}
      />
    </>
  )
}
