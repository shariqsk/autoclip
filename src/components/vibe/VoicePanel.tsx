import { Mic, Play } from 'lucide-react'
import { audioContext } from '../../lib/audio/decode'
import { TTS_MODEL, VOICES } from '../../lib/ml/models'
import { describeStatus, useModelStatus } from '../../hooks/useModelStatus'
import { generateVoice, voiceKey, voiceStatus } from '../../state/actions'
import { updateSettings, useApp } from '../../state/store'
import { Ring, Seg, Slider, Toggle } from '../ui'

const IDEAS = [
  'Ladies and gentlemen… this is the main event.',
  'They said he was finished.',
  'Remember the name.',
  'One shot. One moment. No second chances.',
  'Welcome to the highlight reel.',
]

export function VoicePanel() {
  const v = useApp((s) => s.settings.voiceover)
  const voice = useApp((s) => s.voice)
  const key = useApp(voiceKey)
  const status = useModelStatus(voiceStatus)
  const set = (patch: Partial<typeof v>) => updateSettings((s) => ({ voiceover: { ...s.voiceover, ...patch } }))
  const fresh = voice?.key === key

  const preview = () => {
    if (!voice) return
    const ctx = audioContext()
    const src = ctx.createBufferSource()
    src.buffer = voice.buffer
    src.connect(ctx.destination)
    src.start()
  }

  return (
    <>
      <Toggle
        label="AI voiceover"
        hint={`${TTS_MODEL.name} speaks your line on your device. The music ducks under it.`}
        checked={v.enabled}
        onChange={(enabled) => {
          set({ enabled })
          if (enabled) void generateVoice()
        }}
      />
      {v.enabled && (
        <>
          <textarea
            className="field min-h-[4.5rem] resize-y leading-snug"
            value={v.text}
            maxLength={240}
            onChange={(e) => set({ text: e.target.value })}
          />
          <div className="flex flex-wrap gap-1">
            {IDEAS.filter((i) => i !== v.text)
              .slice(0, 3)
              .map((idea) => (
                <button key={idea} className="chip h-auto py-1 text-left text-[0.68rem]" onClick={() => set({ text: idea })}>
                  {idea}
                </button>
              ))}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {VOICES.map((vo) => (
              <button
                key={vo.id}
                className="tile px-2.5 py-1.5"
                data-on={v.voice === vo.id}
                onClick={() => set({ voice: vo.id })}
                title={vo.note}
              >
                <div className="text-xs font-semibold">{vo.label}</div>
                <div className="truncate text-[0.65rem] text-ink-3">{vo.note}</div>
              </button>
            ))}
          </div>
          <Seg
            value={v.placement}
            onChange={(placement) => set({ placement })}
            options={[
              { value: 'intro', label: 'At the start' },
              { value: 'drop', label: 'Into the drop', title: 'Times the line to finish right as the drop hits' },
            ]}
          />
          <Slider
            label="Pace"
            value={v.speed}
            min={0.7}
            max={1.3}
            onChange={(speed) => set({ speed })}
            format={(x) => `${x.toFixed(2)}×`}
          />
          <div className="flex items-center gap-2">
            <button className="btn btn-sm flex-1" disabled={!!status || !v.text.trim() || fresh} onClick={() => void generateVoice()}>
              {status ? <Ring value={status.phase === 'loading' ? status.fraction : null} size={14} /> : <Mic className="size-3.5" />}
              {fresh ? 'Voice ready' : 'Generate voice'}
            </button>
            <button className="btn btn-sm btn-icon" disabled={!voice} title="Hear it" onClick={preview}>
              <Play className="size-3.5" />
            </button>
          </div>
          {status && <p className="text-[0.7rem] text-ink-3">{describeStatus(status, 'Speaking…')}</p>}
        </>
      )}
    </>
  )
}
