import { makeEdit } from '../../state/actions'
import { ASPECTS, LENGTHS } from '../../state/settings'
import { getState, setState, updateSettings, useApp } from '../../state/store'
import { Seg, Slider } from '../ui'

const recut = () => getState().song?.analysis && getState().drafts.length && makeEdit({ recut: true })

export function FormatPanel() {
  const s = useApp((st) => st.settings)
  return (
    <>
      <div className="grid grid-cols-4 gap-1.5">
        {ASPECTS.map((a) => {
          const scale = 26 / Math.max(a.w, a.h)
          return (
            <button
              key={a.id}
              className="tile grid place-items-center gap-1 py-2"
              data-on={s.aspect === a.id}
              onClick={() => updateSettings({ aspect: a.id })}
              title={a.note}
            >
              <div className="rounded-[3px] border-2 border-ink-2" style={{ width: a.w * scale, height: a.h * scale }} />
              <span className="text-[0.68rem] font-semibold">{a.id}</span>
            </button>
          )
        })}
      </div>
      <p className="-mt-1 text-[0.7rem] text-ink-3">{ASPECTS.find((a) => a.id === s.aspect)!.note}</p>

      <div className="space-y-1.5">
        <div className="text-xs font-medium text-ink-2">Framing</div>
        <Seg
          value={s.fit}
          onChange={(fit) => updateSettings({ fit })}
          options={[
            { value: 'fill', label: 'Smart crop', title: 'Fill the frame, following the action' },
            { value: 'blur', label: 'Blur fill', title: 'Show the whole shot over a blurred copy' },
          ]}
        />
      </div>

      <div className="space-y-1.5">
        <div className="text-xs font-medium text-ink-2">Length</div>
        <Seg
          value={s.length}
          onChange={(length) => {
            updateSettings({ length })
            setState({ windowOverride: null })
            recut()
          }}
          options={LENGTHS.map((l) => ({ value: l.value, label: l.label }))}
        />
      </div>

      <div className="space-y-1.5">
        <div className="text-xs font-medium text-ink-2">Shot order</div>
        <Seg
          value={s.order}
          onChange={(order) => {
            updateSettings({ order })
            recut()
          }}
          options={[
            { value: 'best', label: 'Best moments', title: 'Put the strongest action where the music hits hardest' },
            { value: 'story', label: 'Story order', title: 'Keep your clips in the order they are in the bin' },
          ]}
        />
      </div>

      <Slider
        label="Remix variety"
        hint="How different each Remix is from the last"
        value={s.variety}
        onChange={(variety) => updateSettings({ variety })}
        format={(v) => (v < 0.3 ? 'Subtle' : v < 0.7 ? 'Balanced' : 'Wild')}
      />
    </>
  )
}
