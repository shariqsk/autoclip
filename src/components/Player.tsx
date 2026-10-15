// The stage: live preview of the active draft, sized to the output's aspect ratio, with the
// transport and a scrubber that shows every shot, every drop and every caption.

import { Clapperboard, Maximize2, Pause, Play, Repeat, SkipBack, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { audioContext } from '../lib/audio/decode'
import { PreviewEngine } from '../lib/render/preview'
import { useMix } from '../hooks/useMix'
import { useRenderProject } from '../hooks/useRenderProject'
import { playhead, usePlayhead } from '../state/playhead'
import { ASPECTS, outputSize } from '../state/settings'
import { setState, useApp } from '../state/store'
import { Kbd } from './ui'
import { clipColor, cx, fmtTime } from './format'

export function Player() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<PreviewEngine | null>(null)
  const clips = useApp((s) => s.clips)
  const aspect = useApp((s) => s.settings.aspect)
  const director = useApp((s) => s.director)
  const selected = useApp((s) => s.selectedShotId)
  const { plan, look, captions } = useRenderProject()
  const mix = useMix(plan)
  const { time, playing } = usePlayhead(0.05)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [loop, setLoop] = useState(true)
  const [muted, setMuted] = useState(false)

  // Engine lifecycle.
  useEffect(() => {
    const canvas = canvasRef.current!
    const engine = new PreviewEngine(canvas, audioContext())
    engine.onTime = (t) => playhead.set(t, engine.playing)
    engine.onEnded = () => playhead.set(engine.currentTime, false)
    engineRef.current = engine
    playhead.attach(engine)
    return () => {
      playhead.attach(null)
      engine.dispose()
      engineRef.current = null
    }
  }, [])

  // Fit the stage to the available space at the output's aspect ratio.
  useEffect(() => {
    const el = stageRef.current!
    const a = ASPECTS.find((x) => x.id === aspect)!
    const fit = () => {
      const r = el.getBoundingClientRect()
      const scale = Math.min(r.width / a.w, r.height / a.h)
      setBox({ w: Math.floor(a.w * scale), h: Math.floor(a.h * scale) })
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [aspect])

  // Render resolution: crisp on the screen, capped so the GPU keeps up.
  useEffect(() => {
    const engine = engineRef.current
    if (!engine || !box.w) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const short = Math.min(1080, Math.round(Math.min(box.w, box.h) * dpr))
    const size = outputSize(aspect, Math.max(240, short))
    engine.resize(size.width, size.height)
  }, [box, aspect])

  useEffect(() => {
    const engine = engineRef.current
    if (!engine || !plan || !look) return
    engine.setProject({
      plan,
      look,
      captions,
      audio: mix,
      clips: clips.filter((c) => c.analysis).map((c) => ({ id: c.id, kind: c.kind, url: c.url, analysis: c.analysis! })),
    })
  }, [plan, look, captions, mix, clips])

  useEffect(() => {
    if (engineRef.current) engineRef.current.loop = loop
  }, [loop])
  useEffect(() => {
    engineRef.current?.setVolume(muted ? 0 : 1)
  }, [muted])

  const duration = plan ? plan.songEnd - plan.songStart : 0
  const clipIds = clips.map((c) => c.id)

  const scrub = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    playhead.seek(((e.clientX - rect.left) / rect.width) * duration)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div ref={stageRef} className="relative grid min-h-0 flex-1 place-items-center">
        <div
          className="relative overflow-hidden rounded-[calc(var(--r-panel)-4px)] bg-[var(--stage)] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]"
          style={{ width: box.w, height: box.h }}
        >
          <canvas ref={canvasRef} className="size-full" onClick={() => plan && playhead.toggle()} />
          {!plan && <div className="stripes absolute inset-0" />}
        </div>
      </div>

      {plan && (
        <div className="panel px-3 pt-2.5 pb-3">
          {/* Scrubber: shots as colored blocks, drops as markers, captions as a thin lane. */}
          <div
            className="group relative h-9 cursor-pointer touch-none select-none"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              scrub(e)
            }}
            onPointerMove={(e) => e.buttons === 1 && scrub(e)}
          >
            <div className="absolute inset-x-0 top-0 flex h-6 gap-px overflow-hidden rounded-md">
              {plan.shots.map((s) => (
                <div
                  key={s.id}
                  className={cx(
                    'h-full opacity-80 transition-opacity hover:opacity-100',
                    selected === s.id && 'opacity-100 ring-2 ring-white ring-inset',
                  )}
                  style={{ width: `${((s.end - s.start) / duration) * 100}%`, background: clipColor(clipIds, s.clipId) }}
                  title={`${clips.find((c) => c.id === s.clipId)?.name ?? ''} · ${s.reason}`}
                  onDoubleClick={() => setState({ director: true, selectedShotId: s.id })}
                />
              ))}
            </div>
            {plan.hits
              .filter((h) => h.kind === 'drop')
              .map((h) => (
                <div key={h.time} className="absolute top-0 h-6 w-0.5 bg-accent" style={{ left: `${(h.time / duration) * 100}%` }} />
              ))}
            <div className="absolute inset-x-0 bottom-0 h-1.5">
              {plan.captions.map((c) => (
                <div
                  key={c.id}
                  className="absolute h-full rounded-full bg-ink-3"
                  style={{ left: `${(c.start / duration) * 100}%`, width: `${((c.end - c.start) / duration) * 100}%` }}
                />
              ))}
            </div>
            <div
              className="pointer-events-none absolute -top-1 h-8 w-0.5 rounded-full bg-ink"
              style={{ left: `${(time / Math.max(0.001, duration)) * 100}%` }}
            >
              <div className="absolute -top-1 -left-[5px] size-3 rounded-full bg-ink" />
            </div>
          </div>

          <div className="mt-1.5 flex items-center gap-1.5">
            <button className="btn btn-ghost btn-sm btn-icon" title="Back to start" onClick={() => playhead.seek(0)}>
              <SkipBack className="size-4" />
            </button>
            <button className="btn btn-primary btn-icon shrink-0" title="Play / pause (Space)" onClick={() => playhead.toggle()}>
              {playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
            </button>
            <span className="ml-1 font-mono text-xs whitespace-nowrap text-ink-2 tabular-nums">
              {fmtTime(time)} <span className="text-ink-3">/ {fmtTime(duration)}</span>
            </span>
            <span className="ml-2 hidden truncate font-mono text-[0.7rem] whitespace-nowrap text-ink-3 2xl:inline">
              {plan.shots.length} shots · avg {(duration / Math.max(1, plan.shots.length)).toFixed(2)}s
            </span>
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <button className={cx('btn btn-ghost btn-sm btn-icon', loop && 'text-accent')} title="Loop" onClick={() => setLoop(!loop)}>
                <Repeat className="size-4" />
              </button>
              <button className="btn btn-ghost btn-sm btn-icon" title={muted ? 'Unmute' : 'Mute'} onClick={() => setMuted(!muted)}>
                {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
              </button>
              <button
                className="btn btn-ghost btn-sm btn-icon"
                title="Full screen"
                onClick={() => canvasRef.current?.requestFullscreen?.()}
              >
                <Maximize2 className="size-4" />
              </button>
              <button
                className={cx('btn btn-sm', director ? 'btn-primary' : 'btn-ghost')}
                title="Director mode: fine-tune every shot by hand (D)"
                onClick={() => setState({ director: !director })}
              >
                <Clapperboard className="size-3.5" /> <span className="hidden md:inline">Director</span>
                <span className="hidden 2xl:inline">
                  <Kbd>D</Kbd>
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
