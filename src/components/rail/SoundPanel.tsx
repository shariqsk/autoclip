import { updateSettings, useApp } from '../../state/store'
import { Seg, Slider, SliderBank, Toggle } from '../ui'

export function SoundPanel() {
  const s = useApp((st) => st.settings)
  return (
    <>
      <SliderBank>
        <Slider label="Music" value={s.musicVolume} max={1.2} onChange={(musicVolume) => updateSettings({ musicVolume })} />
        {s.sfx && <Slider label="Effects" value={s.sfxVolume} onChange={(sfxVolume) => updateSettings({ sfxVolume })} />}
      </SliderBank>
      <Toggle
        label="Sound effects"
        hint="Whooshes on whips and zooms; a sub hit and a swell on every drop"
        checked={s.sfx}
        onChange={(sfx) => updateSettings({ sfx })}
      />
      <div className="space-y-1.5">
        <div className="tag">Clip sound</div>
        <Seg
          value={s.clipAudio}
          onChange={(clipAudio) => updateSettings({ clipAudio })}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'hero', label: 'On the drop', title: 'Let the crowd roar and the impact land under the drop' },
            { value: 'all', label: 'Every shot' },
          ]}
        />
        <p className="text-xs leading-snug text-ink-3">The music ducks under the drop so the impact cuts through.</p>
      </div>
    </>
  )
}
