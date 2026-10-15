// The stage: the live preview of the current take, with readouts (timecode, the part of the arc
// you're in, a light that blinks on every beat). Each layout frames it differently; the transport is
// separate so a layout can put it wherever its controls live.

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

function Hud({ plan }: { plan: EditPlan }) {
  const { time, playing } = usePlayhead(1 / 30)
  const shot = plan.shots[Math.max(0, shotIndexAt(plan.shots, time))]
  return (
    <div className="hud">
      <span className="hud-dot" data-on={playing} />
      <span className="hud-time">{timecode(time)}</span>
      <span className="hud-spacer" />
      <span className={cx('hud-phase', shot?.phase === 'hero' && 'hud-phase-drop')}>{shot?.phase ? PHASE_NAMES[shot.phase] : ''}</span>
    </div>
  )
}

export function Stage({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<PreviewEngine | null>(null)
  const clips = useApp((s) => s.clips)
  const aspect = useApp((s) => s.settings.aspect)
  const { plan, look, captions } = useRenderProject()
  const mix = useMix(plan)
  const [box, setBox] = useState({ w: 0, h: 0 })

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

  // Fit the frame to the space available at the output's aspect ratio.
  useEffect(() => {
    const el = stageRef.current!
    const a = ASPECTS.find((x) => x.id === aspect)!
    const fit = () => {
      const r = el.getBoundingClientRect()
      const scale = Math.min((r.width - 8) / a.w, (r.height - 8) / a.h)
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

  return (
    <div className={cx('stage', className)}>
      {plan && <Hud plan={plan} />}
      <div ref={stageRef} className="stage-area relative grid min-h-0 flex-1 place-items-center">
        <div className="stage-frame relative overflow-hidden" style={{ width: box.w, height: box.h }}>
          <canvas ref={canvasRef} className="stage-canvas size-full" onClick={() => plan && playhead.toggle()} />
          {!plan && <div className="stage-empty absolute inset-0" />}
        </div>
      </div>
    </div>
  )
}

/** Play, rewind, time, loop, mute and full screen. */
export function Transport({ className, showTime = true }: { className?: string; showTime?: boolean }) {
  const { plan } = useRenderProject()
  const { time, playing } = usePlayhead(0.1)
  const [loop, setLoop] = useState(true)
  const [muted, setMuted] = useState(false)
  useEffect(() => {
    if (playhead.engine) playhead.engine.loop = loop
  }, [loop])
  useEffect(() => {
    playhead.engine?.setVolume(muted ? 0 : 1)
  }, [muted])
  if (!plan) return null
  const duration = plan.songEnd - plan.songStart
  return (
    <div className={cx('transport flex items-center gap-1', className)}>
      <button className="btn btn-bare btn-sq" title="Back to the top" onClick={() => playhead.seek(0)}>
        <SkipBack className="size-3.5" />
      </button>
      <button className="btn btn-signal btn-sq transport-play" title="Play / pause (Space)" onClick={() => playhead.toggle()}>
        {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
      </button>
      {showTime && (
        <span className="transport-time mono ml-2 text-xs whitespace-nowrap">
          {fmtTime(time)} <span className="text-ink-3">/ {fmtTime(duration)}</span>
        </span>
      )}
      <span className="flex-1" />
      <button className={cx('btn btn-bare btn-sq', loop && 'text-signal')} title="Loop" onClick={() => setLoop(!loop)}>
        <Repeat className="size-3.5" />
      </button>
      <button className="btn btn-bare btn-sq" title={muted ? 'Unmute' : 'Mute'} onClick={() => setMuted(!muted)}>
        {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
      </button>
      <button className="btn btn-bare btn-sq" title="Full screen" onClick={() => playhead.engine?.canvas.requestFullscreen?.()}>
        <Maximize2 className="size-3.5" />
      </button>
    </div>
  )
}
