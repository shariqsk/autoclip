// Export: pick where it's going (or set size, frame rate and quality by hand), render an MP4 on this
// device, and take the captions and soundtrack too.

import { Captions, Copy, Download, FileAudio, Film } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toSrt } from '../lib/captions/parse'
import { DEFAULT_MIX, renderMix } from '../lib/audio/mix'
import { decodeAudioFile } from '../lib/audio/decode'
import { encodeWav } from '../lib/audio/wav'
import { desktop } from '../lib/desktop'
import { fitToSize, shrinkFor } from '../lib/render/budget'
import type { AspectId } from '../lib/types'
import { useRenderProject } from '../hooks/useRenderProject'
import { voiceoverAt } from '../state/derive'
import { castFramed } from '../state/people'
import { playhead } from '../state/playhead'
import { outputSize, type Settings } from '../state/settings'
import { getState, setState, toast, updateSettings, useApp } from '../state/store'
import { cx, fmtTime } from './format'
import { Modal } from './Modal'
import { Progress, Seg, Toggle } from './ui'

const BASE_MBPS: Record<Settings['export']['quality'], number> = { standard: 8, high: 14, max: 24 }

function bitrateFor(width: number, height: number, fps: number, quality: Settings['export']['quality']) {
  const pixels = (width * height) / (1920 * 1080)
  return Math.round(BASE_MBPS[quality] * pixels * Math.sqrt(fps / 30) * 10) / 10
}

/** Discord's upload limit, with a little room. */
const DISCORD_MB = 19.5

// `aspect: null` keeps whatever shape the edit is in.
const PRESETS: { id: string; name: string; note: string; aspect: AspectId | null; ex: Settings['export'] }[] = [
  {
    id: 'vertical',
    name: 'TikTok · Reels · Shorts',
    note: '1080×1920 · 30',
    aspect: '9:16',
    ex: { resolution: 1080, fps: 30, quality: 'high', limitMb: null },
  },
  {
    id: 'youtube',
    name: 'YouTube',
    note: '1920×1080 · 60',
    aspect: '16:9',
    ex: { resolution: 1080, fps: 60, quality: 'high', limitMb: null },
  },
  {
    id: 'feed',
    name: 'Instagram feed',
    note: '1080×1350 · 30',
    aspect: '4:5',
    ex: { resolution: 1080, fps: 30, quality: 'high', limitMb: null },
  },
  {
    id: 'discord',
    name: 'Discord',
    note: 'Under 20 MB · any shape',
    aspect: null,
    ex: { resolution: 1080, fps: 30, quality: 'high', limitMb: DISCORD_MB },
  },
  { id: 'master', name: 'Master', note: '4K · 60 · max', aspect: '9:16', ex: { resolution: 2160, fps: 60, quality: 'max', limitMb: null } },
]

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
  return renderMix(s.song!.buffer!, plan, {
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
  const takeNo = useApp((s) => s.drafts.findIndex((d) => d.id === s.activeDraftId) + 1)
  const { draft, plan, look, captions } = useRenderProject()
  const [progress, setProgress] = useState<{ fraction: number; stage: string } | null>(null)
  const [result, setResult] = useState<{ url: string; blob: Blob; seconds: number } | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const duration = plan ? plan.songEnd - plan.songStart : 0
  const limitMb = ex.limitMb ?? null
  const asked = outputSize(aspect, ex.resolution)
  const wantMbps = bitrateFor(asked.width, asked.height, ex.fps, ex.quality)
  // Under a size limit, the bitrate comes from the limit (and the frame shrinks if it would starve).
  const budget = limitMb ? fitToSize({ limitMb, seconds: duration, width: asked.width, height: asked.height, fps: ex.fps, wantMbps }) : null
  const size = budget && budget.shortSide < Math.min(asked.width, asked.height) ? outputSize(aspect, budget.shortSide) : asked
  const mbps = budget ? budget.videoMbps : wantMbps
  const audioKbps = budget ? budget.audioKbps : 192
  const estimateMb = ((mbps + audioKbps / 1000) * duration) / 8
  const name = `${slug(songName)}-take-${String(takeNo).padStart(2, '0')}`

  useEffect(() => {
    if (!open) abortRef.current?.abort()
  }, [open])
  useEffect(() => () => void (result && URL.revokeObjectURL(result.url)), [result])

  const set = (patch: Partial<Settings['export']>) => updateSettings((s) => ({ export: { ...s.export, ...patch } }))
  const preset = PRESETS.find(
    (p) =>
      (p.aspect === null || p.aspect === aspect) &&
      p.ex.resolution === ex.resolution &&
      p.ex.fps === ex.fps &&
      p.ex.quality === ex.quality &&
      p.ex.limitMb === limitMb,
  )

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
      setProgress({ fraction: 0, stage: 'Mixing the sound' })
      const audio = await buildMix(plan)
      const clips = getState()
        .clips.filter((c) => c.analysis)
        .map((c) => ({ id: c.id, kind: c.kind, file: c.file, analysis: castFramed({ id: c.id, analysis: c.analysis! }), offset: c.offset }))
      // The encoder stack only loads when someone actually exports.
      const { exportEdit } = await import('../lib/render/export')
      // Encoders overshoot a little now and then; under a size limit, re-render lower until it fits.
      let bitrate = mbps
      let blob: Blob | null = null
      for (let attempt = 0; attempt < 3; attempt++) {
        blob = await exportEdit({
          plan,
          clips,
          look,
          captions,
          width: size.width,
          height: size.height,
          fps: ex.fps,
          bitrate,
          audioBitrate: audioKbps,
          audio,
          signal: abort.signal,
          onProgress: (fraction, stage) => setProgress({ fraction, stage: attempt ? `Squeezing under ${limitMb} MB · ${stage}` : stage }),
        })
        if (!limitMb || blob.size <= limitMb * 1e6) break
        bitrate = shrinkFor(bitrate, blob.size, limitMb * 1e6)
      }
      if (!blob) return
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
    <Modal
      onClose={() => setState({ exportOpen: false })}
      closable={!progress}
      title={result ? 'In the can' : 'Export'}
      kicker={`Take ${String(takeNo).padStart(2, '0')} · ${draft?.name.replace(/ #\d+$/, '')} · ${fmtTime(duration)}`}
      wide={!!result}
    >
      {result ? (
        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_250px]">
          <video src={result.url} controls autoPlay loop className="max-h-[62vh] w-full bg-black" />
          <div className="space-y-2">
            <div className="head text-5xl text-signal">{result.seconds.toFixed(1)}s</div>
            <p className="tag">
              Rendered on this device · {(result.blob.size / 1e6).toFixed(1)} MB · {size.width}×{size.height} · H.264
            </p>
            {desktop ? (
              <>
                <button
                  className="slab mt-3 w-full text-xl"
                  onClick={async () => {
                    try {
                      await desktop!.copyVideo(new Uint8Array(await result.blob.arrayBuffer()), `${name}.mp4`)
                      toast('Copied. Paste it into Discord, a chat or a folder.', 'success')
                    } catch (err) {
                      toast(`Couldn't copy: ${err instanceof Error ? err.message : err}`, 'error')
                    }
                  }}
                >
                  Copy <Copy className="size-5" />
                </button>
                <button className="btn w-full" onClick={() => download(result.blob, `${name}.mp4`)}>
                  <Download className="size-3.5" /> Download .mp4
                </button>
              </>
            ) : (
              <button className="slab mt-3 w-full text-xl" onClick={() => download(result.blob, `${name}.mp4`)}>
                Download <Download className="size-5" />
              </button>
            )}
            {plan && plan.captions.some((c) => !c.nameplate) && (
              <button
                className="btn w-full"
                onClick={() =>
                  download(new Blob([toSrt(plan.captions.filter((c) => !c.nameplate))], { type: 'text/plain' }), `${name}.srt`)
                }
              >
                <Captions className="size-3.5" /> Captions .srt
              </button>
            )}
            <button
              className="btn w-full"
              onClick={async () => {
                const mix = await buildMix(plan!)
                download(encodeWav([mix.getChannelData(0), mix.getChannelData(1)], mix.sampleRate), `${name}.wav`)
              }}
            >
              <FileAudio className="size-3.5" /> Soundtrack .wav
            </button>
            <button className="btn btn-bare w-full" onClick={() => setResult(null)}>
              Export again
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-px bg-line-2">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                className={cx('bg-bg px-3 py-2.5 text-left transition-colors', preset?.id === p.id ? 'bg-ink text-bg' : 'hover:bg-bg-2')}
                onClick={() => {
                  if (p.aspect) updateSettings({ aspect: p.aspect })
                  set(p.ex)
                }}
              >
                <div className="head text-xl">{p.name}</div>
                <div className={cx('tag mt-1', preset?.id === p.id && 'text-bg/70')}>{p.note}</div>
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <div className="tag">Resolution</div>
            <Seg value={ex.resolution} onChange={(resolution) => set({ resolution })} options={resolutions} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <div className="tag">Frames / sec</div>
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
              <div className="tag">Quality</div>
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
          <Toggle
            label={`Keep it under ${DISCORD_MB} MB`}
            hint="For Discord: the bitrate is set from the length of the edit, and it shrinks to 720p if it has to."
            checked={!!limitMb}
            onChange={(on) => set({ limitMb: on ? DISCORD_MB : null })}
          />
          <p className="tag">
            {size.width}×{size.height} · ≈ {mbps} Mbps ·{' '}
            {limitMb ? `under ${limitMb} MB` : `about ${estimateMb < 1 ? estimateMb.toFixed(1) : Math.round(estimateMb)} MB`}
          </p>
          {progress ? (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="head text-2xl">{progress.stage}</span>
                <span className="mono text-sm">{Math.round(progress.fraction * 100)}%</span>
              </div>
              <Progress value={progress.fraction} className="h-2" />
              <button className="btn btn-bare btn-sm" onClick={() => abortRef.current?.abort()}>
                Cancel
              </button>
            </div>
          ) : (
            <button className="slab w-full" onClick={() => void start()} disabled={!plan}>
              Render <Film className="size-6" />
            </button>
          )}
        </div>
      )}
    </Modal>
  )
}
