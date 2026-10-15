// The stage: the live preview of the current take, framed like a broadcast monitor, with a tally
// light, timecode, the part of the arc you're in and a light that blinks on every beat.

import { Maximize2, Pause, Play, Repeat, SkipBack, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { audioContext } from '../lib/audio/decode'
import { shotIndexAt } from '../lib/edit/timeline'
import { PreviewEngine } from '../lib/render/preview'
import type { EditPlan } from '../lib/types'
import { useMix } from '../hooks/useMix'
import { useRenderProject } from '../hooks/useRenderProject'
import { playhead, usePlayhead } from '../state/playhead'
import { ASPECTS, outputSize } from '../state/settings'
import { useApp } from '../state/store'
import { cx, fmtTime, PHASE_NAMES, timecode } from './format'

function Overlay({ plan, box }: { plan: EditPlan; box: { w: number; h: number } }) {
  const { time, playing } = usePlayhead(1 / 30)
  const i = shotIndexAt(plan.shots, time)
  const shot = plan.shots[Math.max(0, i)]
  const beatOn = plan.hits.some((h) => time >= h.time && time - h.time < 0.09)
  const dropOn = plan.hits.some((h) => h.kind === 'drop' && time >= h.time && time - h.time < 0.25)
  return (
    <div className="pointer-events-none absolute" style={{ width: box.w, height: box.h }}>
      <div className="mono absolute -top-7 right-0 left-0 flex items-center gap-2 text-[0.66rem] tracking-[0.14em] whitespace-nowrap text-ink-2 uppercase">
        <span className={cx('size-2 shrink-0', playing ? 'tally bg-signal' : 'bg-ink-3')} />
        {box.w > 300 && <span>{playing ? 'On air' : 'Standby'}</span>}
        <span className="text-ink">{timecode(time)}</span>
        <span className="ml-auto truncate">
          {shot?.phase && <span className={cx(shot.phase === 'hero' ? 'text-signal' : 'text-ink-2')}>{PHASE_NAMES[shot.phase]}</span>}
        </span>
        <span
          className={cx(
            'size-2 shrink-0 border border-ink-3 transition-colors duration-75',
            beatOn && 'border-ink bg-ink',
            dropOn && 'border-signal bg-signal',
          )}
          title="Beat"
        />
      </div>
      <div className={cx('absolute inset-0 border transition-colors duration-100', dropOn ? 'border-signal' : 'border-transparent')} />
    </div>
  )
}

export function Player() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<PreviewEngine | null>(null)
  const clips = useApp((s) => s.clips)
  const aspect = useApp((s) => s.settings.aspect)
  const { plan, look, captions } = useRenderProject()
  const mix = useMix(plan)
  const { time, playing } = usePlayhead(0.1)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [loop, setLoop] = useState(true)
  const [muted, setMuted] = useState(false)

  useEffect(() => {
    const engine = new PreviewEngine(canvasRef.current!, audioContext())
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

  // Fit the frame to the space available, at the output's aspect ratio, leaving room for the labels.
  useEffect(() => {
    const el = stageRef.current!
    const a = ASPECTS.find((x) => x.id === aspect)!
    const fit = () => {
      const r = el.getBoundingClientRect()
      const scale = Math.min((r.width - 40) / a.w, (r.height - 64) / a.h)
      setBox({ w: Math.max(0, Math.floor(a.w * scale)), h: Math.max(0, Math.floor(a.h * scale)) })
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [aspect])

  useEffect(() => {
    const engine = engineRef.current
    if (!engine || !box.w) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const size = outputSize(aspect, Math.max(240, Math.min(1080, Math.round(Math.min(box.w, box.h) * dpr))))
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={stageRef} className="halftone relative grid min-h-0 flex-1 place-items-center">
        <div className="crop relative bg-[var(--stage)]" style={{ width: box.w, height: box.h }}>
          <canvas ref={canvasRef} className="size-full" onClick={() => plan && playhead.toggle()} />
          {!plan && <div className="hazard absolute inset-0 opacity-[0.06]" />}
        </div>
        {plan && box.w > 0 && <Overlay plan={plan} box={box} />}
      </div>

      {plan && (
        <div className="flex h-11 shrink-0 items-center gap-1 border-t border-line px-3">
          <button className="btn btn-bare btn-sq" title="Back to the top" onClick={() => playhead.seek(0)}>
            <SkipBack className="size-3.5" />
          </button>
          <button className="btn btn-signal btn-sq" title="Play / pause (Space)" onClick={() => playhead.toggle()}>
            {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          </button>
          <span className="mono ml-2 text-xs whitespace-nowrap">
            {fmtTime(time)} <span className="text-ink-3">/ {fmtTime(duration)}</span>
          </span>
          <div className="ml-auto flex items-center">
            <button className={cx('btn btn-bare btn-sq', loop && 'text-signal')} title="Loop" onClick={() => setLoop(!loop)}>
              <Repeat className="size-3.5" />
            </button>
            <button className="btn btn-bare btn-sq" title={muted ? 'Unmute' : 'Mute'} onClick={() => setMuted(!muted)}>
              {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
            </button>
            <button className="btn btn-bare btn-sq" title="Full screen" onClick={() => canvasRef.current?.requestFullscreen?.()}>
              <Maximize2 className="size-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
