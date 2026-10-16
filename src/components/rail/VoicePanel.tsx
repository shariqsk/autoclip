import { Mic, Play } from 'lucide-react'
import { audioContext } from '../../lib/audio/decode'
import { TTS_MODEL, VOICES } from '../../lib/ml/models'
import { describeStatus, useModelStatus } from '../../hooks/useModelStatus'
import { generateVoice, voiceKey, voiceStatus } from '../../state/actions'
import { updateSettings, useApp } from '../../state/store'
import { cx } from '../format'
import { Progress, Seg, Slider, Toggle } from '../ui'

const IDEAS = [
  'Remember the name.',
  'Ladies and gentlemen… this is the main event.',
  'They said it couldn’t be done.',
  'One shot. One moment.',
  'Welcome to the highlight reel.',
]

export function VoicePanel() {
  const v = useApp((s) => s.settings.voiceover)
  const voice = useApp((s) => s.voice)
  const key = useApp(voiceKey)
  const status = useModelStatus(voiceStatus)
  const set = (patch: Partial<typeof v>) => updateSettings((s) => ({ voiceover: { ...s.voiceover, ...patch } }))
  const fresh = voice?.key === key

  const hear = () => {
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
        label="Announcer"
        hint={`${TTS_MODEL.name} reads your line on this device, with the music ducked under it.`}
        checked={v.enabled}
        onChange={(enabled) => {
          set({ enabled })
          if (enabled) void generateVoice()
        }}
      />
      {v.enabled && (
        <>
          <textarea
            className="field min-h-[4.2rem] resize-y leading-snug"
            value={v.text}
            maxLength={240}
            onChange={(e) => set({ text: e.target.value })}
          />
          <div className="flex flex-wrap gap-1">
            {IDEAS.filter((i) => i !== v.text)
              .slice(0, 3)
              .map((idea) => (
                <button key={idea} className="opt h-auto py-1 text-left normal-case" onClick={() => set({ text: idea })}>
                  {idea}
                </button>
              ))}
          </div>
          <div className="grid grid-cols-2 border-t border-l border-line-2">
            {VOICES.map((vo) => (
              <button
                key={vo.id}
                className={cx(
                  'border-r border-b border-line-2 px-2.5 py-1.5 text-left',
                  v.voice === vo.id ? 'bg-ink text-bg' : 'hover:bg-bg-2',
                )}
                onClick={() => set({ voice: vo.id })}
                title={vo.note}
              >
                <div className="text-xs font-bold">{vo.label}</div>
                <div className={cx('truncate text-[0.65rem]', v.voice === vo.id ? 'opacity-70' : 'text-ink-3')}>{vo.note}</div>
              </button>
            ))}
          </div>
          <Seg
            value={v.placement}
            onChange={(placement) => set({ placement })}
            options={[
              { value: 'intro', label: 'Opening line' },
              { value: 'drop', label: 'Into the drop', title: 'Times the line to end right as the drop hits' },
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
          <div className="flex gap-1.5">
            <button className="btn flex-1" disabled={!!status || !v.text.trim() || fresh} onClick={() => void generateVoice()}>
              <Mic className="size-3.5" /> {fresh ? 'Voice ready' : 'Record the line'}
            </button>
            <button className="btn btn-sq" disabled={!voice} title="Hear it" onClick={hear}>
              <Play className="size-3.5" />
            </button>
          </div>
          {status && (
            <div className="space-y-1.5">
              <Progress value={status.phase === 'loading' ? status.fraction : null} />
              <p className="tag">{describeStatus(status, 'Speaking…')}</p>
            </div>
          )}
        </>
      )}
    </>
  )
}
