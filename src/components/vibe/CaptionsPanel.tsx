import { FileText, Sparkles, Upload } from 'lucide-react'
import { useRef } from 'react'
import { CAPTION_STYLES, CAPTION_FONTS } from '../../lib/captions/render'
import { getStyle } from '../../lib/edit/presets'
import { CAPTION_MODELS } from '../../lib/ml/models'
import { describeStatus, useModelStatus } from '../../hooks/useModelStatus'
import { captionStatus, importCaptions, runAutoCaptions } from '../../state/actions'
import type { CaptionSource } from '../../state/settings'
import { activeDraft, updateSettings, useApp } from '../../state/store'
import { Ring, Seg, Slider } from '../ui'
import { cx } from '../format'

const ACCENTS = ['#ffd60a', '#ff3b2f', '#22e5ff', '#3ddc84', '#ff3df2', '#ffffff']

const STYLE_PREVIEW: Record<string, React.CSSProperties> = {
  pop: { fontFamily: CAPTION_FONTS.display, textTransform: 'uppercase', fontSize: '1.05rem', WebkitTextStroke: '0.5px #000' },
  karaoke: { fontFamily: CAPTION_FONTS.round, fontWeight: 800 },
  impact: { fontFamily: CAPTION_FONTS.display, textTransform: 'uppercase', transform: 'rotate(-2deg)' },
  clean: {
    fontFamily: CAPTION_FONTS.body,
    fontWeight: 600,
    background: 'rgba(10,10,14,.7)',
    padding: '1px 6px',
    borderRadius: 6,
    color: '#fff',
  },
  glitch: { fontFamily: CAPTION_FONTS.mono, fontWeight: 800, textShadow: '-2px 0 #ff003c, 2px 0 #00f0ff', textTransform: 'uppercase' },
  typewriter: { fontFamily: CAPTION_FONTS.mono },
}

export function CaptionsPanel() {
  const c = useApp((s) => s.settings.captions)
  const styleId = useApp((s) => activeDraft(s)?.style ?? s.settings.style)
  const words = useApp((s) => s.words)
  const fileName = useApp((s) => s.fileCaptionsName)
  const hasDraft = useApp((s) => !!activeDraft(s))
  const status = useModelStatus(captionStatus)
  const fileRef = useRef<HTMLInputElement>(null)
  const set = (patch: Partial<typeof c>) => updateSettings((s) => ({ captions: { ...s.captions, ...patch } }))
  const shown = c.style === 'style' ? getStyle(styleId).captions : c.style

  return (
    <>
      <Seg
        value={c.source}
        onChange={(source: CaptionSource) => {
          set({ source })
          if (source === 'auto' && !words) void runAutoCaptions()
          if (source === 'file' && !fileName) fileRef.current?.click()
        }}
        options={[
          { value: 'off', label: 'Off' },
          { value: 'auto', label: 'Lyrics', title: 'Transcribe the vocals with Whisper, on your device' },
          { value: 'file', label: 'File', title: 'Import .srt or .lrc' },
          { value: 'text', label: 'Beat text', title: 'Your words, one per beat into the drop' },
        ]}
      />
      <input
        ref={fileRef}
        type="file"
        accept=".srt,.lrc,.vtt"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void importCaptions(f)
          e.target.value = ''
        }}
      />

      {c.source === 'auto' && (
        <div className="space-y-2 rounded-[var(--r-ctl)] border border-line bg-well p-2.5">
          <div className="flex items-center gap-2">
            <select className="field h-8 flex-1 py-0 text-xs" value={c.model} onChange={(e) => set({ model: e.target.value })}>
              {CAPTION_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} · {m.name} · {m.size}
                </option>
              ))}
            </select>
            <button className="btn btn-sm" disabled={!!status || !hasDraft} onClick={() => void runAutoCaptions()}>
              {status ? <Ring value={status.phase === 'loading' ? status.fraction : null} size={14} /> : <Sparkles className="size-3.5" />}
              {words ? 'Redo' : 'Listen'}
            </button>
          </div>
          <p className="text-[0.7rem] leading-snug text-ink-3">
            {describeStatus(status, 'Listening to the vocals…') ??
              (words
                ? `${words.words.length} words heard. Edit them in Director mode.`
                : "Whisper runs on your device; your music isn't uploaded.")}
          </p>
        </div>
      )}

      {c.source === 'file' && (
        <button className="btn btn-sm w-full" onClick={() => fileRef.current?.click()}>
          {fileName ? <FileText className="size-3.5" /> : <Upload className="size-3.5" />}
          <span className="truncate">{fileName ?? 'Choose a .srt or .lrc file'}</span>
        </button>
      )}

      {c.source === 'text' && (
        <div className="space-y-1">
          <input
            className="field"
            placeholder="WHO. IS. THE. GOAT."
            value={c.beatText}
            onChange={(e) => set({ beatText: e.target.value })}
          />
          <p className="text-[0.7rem] text-ink-3">One word per beat, landing right before the drop.</p>
        </div>
      )}

      <div className="space-y-1">
        <div className="text-xs font-medium text-ink-2">Title card</div>
        <input className="field" placeholder="e.g. THE EAGLE" value={c.title} onChange={(e) => set({ title: e.target.value })} />
      </div>

      {(c.source !== 'off' || c.title) && (
        <>
          <div className="grid grid-cols-3 gap-1.5">
            {CAPTION_STYLES.map((st) => (
              <button
                key={st.id}
                className="tile grid h-14 place-items-center overflow-hidden bg-[#111] px-1 text-white"
                data-on={shown === st.id}
                title={st.sample}
                onClick={() => set({ style: st.id === getStyle(styleId).captions ? 'style' : st.id })}
              >
                <span className="truncate text-sm" style={{ ...STYLE_PREVIEW[st.id], color: st.id === 'karaoke' ? c.accent : undefined }}>
                  {st.name}
                </span>
              </button>
            ))}
          </div>
          <Seg
            value={c.position}
            onChange={(position) => set({ position })}
            options={[
              { value: 'top', label: 'Top' },
              { value: 'center', label: 'Middle' },
              { value: 'bottom', label: 'Bottom' },
            ]}
          />
          <Slider label="Size" value={c.scale} min={0.6} max={1.6} onChange={(scale) => set({ scale })} />
          <div className="flex items-center gap-1.5">
            <span className="mr-auto text-xs font-medium text-ink-2">Highlight</span>
            {ACCENTS.map((a) => (
              <button
                key={a}
                aria-label={`Highlight ${a}`}
                className={cx(
                  'size-5 rounded-full border-2 transition-transform',
                  c.accent === a ? 'scale-110 border-ink' : 'border-transparent',
                )}
                style={{ background: a }}
                onClick={() => set({ accent: a })}
              />
            ))}
          </div>
        </>
      )}
    </>
  )
}
