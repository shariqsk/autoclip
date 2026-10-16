// 06 TEXT: captions (lyrics heard by Whisper, a subtitle file, or your own words on the beat), a title
// card, the fighter nameplate for the drop, and your handle.

import { FileText, Sparkles, Upload } from 'lucide-react'
import { useRef } from 'react'
import { CAPTION_FONTS, CAPTION_STYLES } from '../../lib/captions/render'
import { getStyle } from '../../lib/edit/presets'
import { CAPTION_MODELS } from '../../lib/ml/models'
import { describeStatus, useModelStatus } from '../../hooks/useModelStatus'
import { captionStatus, importCaptions, runAutoCaptions } from '../../state/actions'
import type { CaptionSource } from '../../state/settings'
import { activeDraft, updateSettings, useApp } from '../../state/store'
import { cx } from '../format'
import { Progress, Seg, Slider, Toggle } from '../ui'

const ACCENTS = ['#ffd21f', '#ff2a14', '#c2ff2e', '#22e5ff', '#ff4fd8', '#ffffff']

const PREVIEW: Record<string, React.CSSProperties> = {
  pop: { fontFamily: CAPTION_FONTS.display, textTransform: 'uppercase', fontSize: '1.1rem', WebkitTextStroke: '0.6px #000' },
  karaoke: { fontFamily: CAPTION_FONTS.round, fontWeight: 800 },
  impact: { fontFamily: CAPTION_FONTS.display, textTransform: 'uppercase', fontSize: '1rem', transform: 'rotate(-2deg)' },
  clean: { fontFamily: CAPTION_FONTS.body, fontWeight: 600, background: 'rgba(10,10,14,.75)', padding: '1px 6px' },
  glitch: { fontFamily: CAPTION_FONTS.mono, fontWeight: 800, textShadow: '-2px 0 #ff003c, 2px 0 #00f0ff', textTransform: 'uppercase' },
  typewriter: { fontFamily: CAPTION_FONTS.mono },
  subtitle: { fontFamily: CAPTION_FONTS.body, fontStyle: 'italic', textTransform: 'lowercase' },
  stack: { fontFamily: CAPTION_FONTS.display, textTransform: 'uppercase', fontSize: '1.05rem' },
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="tag">{label}</span>
      {children}
    </label>
  )
}

export function TextPanel() {
  const settings = useApp((s) => s.settings)
  const c = settings.captions
  const styleId = useApp((s) => activeDraft(s)?.style ?? s.settings.style)
  const words = useApp((s) => s.words)
  const fileName = useApp((s) => s.fileCaptionsName)
  const hasDraft = useApp((s) => !!activeDraft(s))
  const status = useModelStatus(captionStatus)
  const fileRef = useRef<HTMLInputElement>(null)
  const set = (patch: Partial<typeof c>) => updateSettings((s) => ({ captions: { ...s.captions, ...patch } }))
  const shown = c.style === 'style' ? getStyle(styleId).captions : c.style
  const titleLook = c.titleLook === 'style' ? (getStyle(styleId).title ?? 'slam') : c.titleLook
  const titleBehind = c.titleBehind === 'style' ? !!getStyle(styleId).titleBehind : c.titleBehind

  return (
    <>
      <div className="space-y-1.5">
        <div className="tag">Captions</div>
        <Seg
          value={c.source}
          onChange={(source: CaptionSource) => {
            set({ source })
            if (source === 'auto' && !words) void runAutoCaptions()
            if (source === 'file' && !fileName) fileRef.current?.click()
          }}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'auto', label: 'Lyrics', title: 'Hear the vocals with Whisper, on this device' },
            { value: 'file', label: 'File', title: 'Import .srt or .lrc' },
            { value: 'text', label: 'On beat', title: 'Your words, one per beat, into the drop' },
          ]}
        />
      </div>
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
        <div className="space-y-2 border border-line p-2.5">
          <div className="flex items-stretch gap-1.5">
            <select className="field min-w-0 flex-1 py-1 text-xs" value={c.model} onChange={(e) => set({ model: e.target.value })}>
              {CAPTION_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} · {m.name} · {m.size}
                </option>
              ))}
            </select>
            <button className="btn btn-sm h-auto" disabled={!!status || !hasDraft} onClick={() => void runAutoCaptions()}>
              <Sparkles className="size-3" /> {words ? 'Again' : 'Listen'}
            </button>
          </div>
          {status && <Progress value={status.phase === 'loading' ? status.fraction : null} />}
          <p className="text-xs leading-snug text-ink-3">
            {describeStatus(status, 'Listening to the vocals…') ??
              (words
                ? `${words.words.length} words heard. Fix any in the tape's director view.`
                : "Runs on this device. The song isn't uploaded.")}
          </p>
        </div>
      )}
      {c.source === 'file' && (
        <button className="btn w-full justify-start" onClick={() => fileRef.current?.click()}>
          {fileName ? <FileText className="size-3.5" /> : <Upload className="size-3.5" />}
          <span className="truncate">{fileName ?? 'Choose a .srt or .lrc file'}</span>
        </button>
      )}
      {c.source === 'text' && (
        <Field label="Words on the beat">
          <input className="field" placeholder="ONE. MORE. TIME." value={c.beatText} onChange={(e) => set({ beatText: e.target.value })} />
        </Field>
      )}

      <div className="space-y-1.5">
        <Field label="Title card">
          <input className="field" placeholder="THE COMEBACK" value={c.title} onChange={(e) => set({ title: e.target.value })} />
        </Field>
        {c.title.trim() && (
          <div className="grid grid-cols-2 gap-1.5">
            <Seg
              value={c.titleAt}
              onChange={(titleAt) => set({ titleAt })}
              options={[
                { value: 'start', label: 'Start', title: 'Opens the edit' },
                { value: 'drop', label: 'Drop', title: 'Lands on the drop' },
                { value: 'end', label: 'End', title: 'The last few seconds' },
              ]}
            />
            <Seg
              value={titleLook}
              onChange={(look) => set({ titleLook: look === (getStyle(styleId).title ?? 'slam') ? 'style' : look })}
              options={[
                { value: 'slam', label: 'Slam', title: 'Big and slammed in' },
                { value: 'spread', label: 'Spread', title: 'Glitches in, then the letters drift apart' },
              ]}
            />
          </div>
        )}
        {c.title.trim() && (
          <Toggle
            label="Behind people"
            hint="Huge, with the people in shot standing in front of it. Cut out on this device."
            checked={titleBehind}
            onChange={(on) => set({ titleBehind: on === !!getStyle(styleId).titleBehind ? 'style' : on })}
          />
        )}
      </div>

      <div className="grid grid-cols-[1.4fr_1fr] gap-2">
        <Field label="Nameplate · on the drop">
          <input
            className="field"
            placeholder="Who it’s about"
            value={settings.nameplate.name}
            onChange={(e) => updateSettings((s) => ({ nameplate: { ...s.nameplate, name: e.target.value } }))}
          />
        </Field>
        <Field label="Under it">
          <input
            className="field"
            placeholder="A line under the name"
            value={settings.nameplate.sub}
            onChange={(e) => updateSettings((s) => ({ nameplate: { ...s.nameplate, sub: e.target.value } }))}
          />
        </Field>
      </div>

      <Field label="Your handle · corner watermark">
        <input
          className="field"
          placeholder="@yourname"
          value={settings.handle}
          onChange={(e) => updateSettings({ handle: e.target.value })}
        />
      </Field>

      <div className="space-y-1.5">
        <div className="tag">Caption style</div>
        <div className="grid grid-cols-3 border-t border-l border-line-2">
          {CAPTION_STYLES.map((st) => (
            <button
              key={st.id}
              className={cx(
                'grid h-12 place-items-center overflow-hidden border-r border-b border-line-2 bg-[#0d0d0d] px-1 text-white',
                shown === st.id && 'outline-2 -outline-offset-2 outline-signal',
              )}
              title={st.sample}
              onClick={() => set({ style: st.id === getStyle(styleId).captions ? 'style' : st.id })}
            >
              <span className="truncate text-sm" style={{ ...PREVIEW[st.id], color: st.id === 'karaoke' ? c.accent : undefined }}>
                {st.name}
              </span>
            </button>
          ))}
        </div>
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
      <Slider
        label="Size"
        value={c.scale}
        min={0.6}
        max={1.6}
        onChange={(scale) => set({ scale })}
        format={(v) => `${Math.round(v * 100)}%`}
      />
      <div className="flex items-center gap-1">
        <span className="tag mr-auto">Highlight · nameplate</span>
        {ACCENTS.map((a) => (
          <button
            key={a}
            aria-label={`Highlight ${a}`}
            className={cx('size-5 border-2', c.accent === a ? 'border-ink' : 'border-transparent')}
            style={{ background: a }}
            onClick={() => set({ accent: a })}
          />
        ))}
      </div>
    </>
  )
}
