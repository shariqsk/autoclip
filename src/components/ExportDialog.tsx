// Export: pick size, frame rate and quality, then render an MP4 in the browser. Also hands out the
// captions as .srt and the soundtrack as .wav.

import { Captions, Download, FileAudio, Film, Loader2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toSrt } from '../lib/captions/parse'
import { DEFAULT_MIX, renderMix } from '../lib/audio/mix'
import { decodeAudioFile } from '../lib/audio/decode'
import { encodeWav } from '../lib/audio/wav'
import { useRenderProject } from '../hooks/useRenderProject'
import { voiceoverAt } from '../state/derive'
import { playhead } from '../state/playhead'
import { outputSize, type Settings } from '../state/settings'
import { getState, setState, toast, updateSettings, useApp } from '../state/store'
import { Modal } from './Modal'
import { Seg } from './ui'
import { cx, fmtTime } from './format'

const BASE_MBPS: Record<Settings['export']['quality'], number> = { standard: 8, high: 14, max: 24 }

function bitrateFor(width: number, height: number, fps: number, quality: Settings['export']['quality']) {
  const pixels = (width * height) / (1920 * 1080)
  return Math.round(BASE_MBPS[quality] * pixels * Math.sqrt(fps / 30) * 10) / 10
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'edit'

async function buildMix(plan: NonNullable<ReturnType<typeof useRenderProject>['plan']>) {
  const s = getState()
  const song = s.song!.buffer!
  const clipBuffers = new Map<string, AudioBuffer>()
  if (s.settings.clipAudio !== 'off') {
    const used = new Set(plan.shots.map((x) => x.clipId))
    for (const c of s.clips.filter((x) => used.has(x.id) && x.kind === 'video')) {
      const b = await decodeAudioFile(c.file).catch(() => null)
      if (b) clipBuffers.set(c.id, b)
    }
  }
  const vo = s.settings.voiceover
  const voiceovers = vo.enabled && s.voice ? [{ buffer: s.voice.buffer, at: voiceoverAt(plan, vo.placement, s.voice.buffer.duration) }] : []
  return renderMix(song, plan, {
    ...DEFAULT_MIX,
    musicVolume: s.settings.musicVolume,
    sfx: s.settings.sfx,
    sfxVolume: s.settings.sfxVolume,
    clipAudio: s.settings.clipAudio,
    clipBuffers,
    voiceovers,
  })
}

export function ExportDialog() {
  const open = useApp((s) => s.exportOpen)
  const ex = useApp((s) => s.settings.export)
  const aspect = useApp((s) => s.settings.aspect)
  const songName = useApp((s) => s.song?.name ?? 'edit')
  const { draft, plan, look, captions } = useRenderProject()
  const [progress, setProgress] = useState<{ fraction: number; stage: string } | null>(null)
  const [result, setResult] = useState<{ url: string; blob: Blob; seconds: number } | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const size = outputSize(aspect, ex.resolution)
  const mbps = bitrateFor(size.width, size.height, ex.fps, ex.quality)
  const duration = plan ? plan.songEnd - plan.songStart : 0
  const estimateMb = ((mbps + 0.2) * duration) / 8
  const name = `${slug(songName)}-${slug(draft?.name ?? 'edit')}`

  useEffect(() => {
    if (!open) abortRef.current?.abort()
  }, [open])
  useEffect(() => () => void (result && URL.revokeObjectURL(result.url)), [result])

  const set = (patch: Partial<Settings['export']>) => updateSettings((s) => ({ export: { ...s.export, ...patch } }))

  const start = async () => {
    if (!plan || !look) return
    playhead.pause()
    const abort = new AbortController()
    abortRef.current = abort
    setResult(null)
    setProgress({ fraction: 0, stage: 'Getting ready' })
    const t0 = performance.now()
    try {
      await Promise.all(
        ['Anton', 'Inter Variable', 'JetBrains Mono Variable', 'Bricolage Grotesque Variable'].map((f) =>
          document.fonts.load(`700 48px "${f}"`),
        ),
      )
      setProgress({ fraction: 0, stage: 'Mixing audio' })
      const audio = await buildMix(plan)
      const clips = getState()
        .clips.filter((c) => c.analysis)
        .map((c) => ({ id: c.id, kind: c.kind, file: c.file, analysis: c.analysis! }))
      // The encoder stack only loads when someone actually exports.
      const { exportEdit } = await import('../lib/render/export')
      const blob = await exportEdit({
        plan,
        clips,
        look,
        captions,
        width: size.width,
        height: size.height,
        fps: ex.fps,
        bitrate: mbps,
        audio,
        signal: abort.signal,
        onProgress: (fraction, stage) => setProgress({ fraction, stage }),
      })
      setResult({ url: URL.createObjectURL(blob), blob, seconds: (performance.now() - t0) / 1000 })
    } catch (err) {
      if (!(err instanceof Error && err.name === 'ExportCancelled'))
        toast(`Export failed: ${err instanceof Error ? err.message : err}`, 'error')
    } finally {
      setProgress(null)
      abortRef.current = null
    }
  }

  const resolutions = useMemo(
    () =>
      ([720, 1080, 1440, 2160] as const).map((r) => {
        const s = outputSize(aspect, r)
        return { value: r, label: r === 2160 ? '4K' : `${r}p`, title: `${s.width}×${s.height}` }
      }),
    [aspect],
  )

  if (!open) return null
  return (
    <Modal onClose={() => !progress && setState({ exportOpen: false })} labelledBy="export-title" wide={!!result}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="export-title" className="display text-xl">
            Export
          </h2>
          <p className="text-sm text-ink-3">
            {draft?.name} · {fmtTime(duration)} · {size.width}×{size.height}
          </p>
        </div>
        <button className="btn btn-ghost btn-icon" disabled={!!progress} onClick={() => setState({ exportOpen: false })} aria-label="Close">
          <X className="size-4" />
        </button>
      </div>

      {result ? (
        <div className="mt-5 grid gap-5 sm:grid-cols-[minmax(0,1fr)_240px]">
          <video src={result.url} controls autoPlay loop className="max-h-[60vh] w-full rounded-[var(--r-ctl)] bg-black" />
          <div className="space-y-3">
            <div className="text-sm font-semibold text-good">Done in {result.seconds.toFixed(1)}s</div>
            <p className="text-xs text-ink-3">
              {(result.blob.size / 1e6).toFixed(1)} MB · H.264 MP4. Rendered on your device; nothing was uploaded.
            </p>
            <button className="btn btn-primary w-full" onClick={() => download(result.blob, `${name}.mp4`)}>
              <Download className="size-4" /> Download MP4
            </button>
            {plan && plan.captions.length > 0 && (
              <button
                className="btn w-full"
                onClick={() => download(new Blob([toSrt(plan.captions)], { type: 'text/plain' }), `${name}.srt`)}
              >
                <Captions className="size-4" /> Captions (.srt)
              </button>
            )}
            <button
              className="btn w-full"
              onClick={async () => {
                const mix = await buildMix(plan!)
                download(encodeWav([mix.getChannelData(0), mix.getChannelData(1)], mix.sampleRate), `${name}.wav`)
              }}
            >
              <FileAudio className="size-4" /> Soundtrack (.wav)
            </button>
            <button className="btn btn-ghost w-full" onClick={() => setResult(null)}>
              Export again
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-ink-2">Resolution</div>
            <Seg value={ex.resolution} onChange={(resolution) => set({ resolution })} options={resolutions} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-ink-2">Frame rate</div>
              <Seg
                value={ex.fps}
                onChange={(fps) => set({ fps })}
                options={[
                  { value: 24, label: '24' },
                  { value: 30, label: '30' },
                  { value: 60, label: '60' },
                ]}
              />
            </div>
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-ink-2">Quality</div>
              <Seg
                value={ex.quality}
                onChange={(quality) => set({ quality })}
                options={[
                  { value: 'standard', label: 'Small' },
                  { value: 'high', label: 'High' },
                  { value: 'max', label: 'Max' },
                ]}
              />
            </div>
          </div>
          <p className="font-mono text-[0.7rem] text-ink-3">
            ≈ {mbps} Mbps · about {estimateMb < 1 ? estimateMb.toFixed(1) : Math.round(estimateMb)} MB
          </p>

          {progress ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" /> {progress.stage}
                </span>
                <span className="font-mono text-xs">{Math.round(progress.fraction * 100)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-well">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-200"
                  style={{ width: `${progress.fraction * 100}%` }}
                />
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => abortRef.current?.abort()}>
                Cancel
              </button>
            </div>
          ) : (
            <button className={cx('btn btn-primary btn-xl w-full')} onClick={() => void start()} disabled={!plan}>
              <Film className="size-5" /> Render MP4
            </button>
          )}
        </div>
      )}
    </Modal>
  )
}
