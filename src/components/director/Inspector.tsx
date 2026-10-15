// Director inspector: everything about the selected shot (clip, in-point, speed, transition,
// effects, lock) or the selected caption (text and timing).

import { Dices, Lock, Scissors, Trash2, Unlock } from 'lucide-react'
import { removeShot, repick, splitShot, swapClip, updateShot } from '../../lib/edit/ops'
import { TRANSITION_NAMES } from '../../lib/edit/presets'
import { sourceDuration } from '../../lib/edit/speed'
import { spreadWords } from '../../lib/captions/parse'
import { useRenderProject } from '../../hooks/useRenderProject'
import type { Clip, EditPlan, Shot, SpeedRamp, TransitionType } from '../../lib/types'
import { editCaptions, editPlan } from '../../state/actions'
import { playhead } from '../../state/playhead'
import { setState, useApp } from '../../state/store'
import { Seg, Slider } from '../ui'
import { cx, fmtTime } from '../format'

type SpeedMode = 'normal' | 'slow' | 'velocity' | 'hit'

function speedMode(s: SpeedRamp): SpeedMode {
  if (s.kind === 'velocity') return 'velocity'
  if (s.kind === 'ease-in') return 'hit'
  return s.speed < 0.95 ? 'slow' : 'normal'
}

const SPEEDS: Record<SpeedMode, SpeedRamp> = {
  normal: { kind: 'constant', speed: 1 },
  slow: { kind: 'constant', speed: 0.5 },
  velocity: { kind: 'velocity', fast: 1.6, slow: 0.35 },
  hit: { kind: 'ease-in', from: 0.35, to: 1 },
}

function InPoint({ shot, clip }: { shot: Shot; clip: Clip }) {
  const a = clip.analysis!
  const len = sourceDuration(shot.speed, shot.end - shot.start)
  const max = Math.max(0, a.duration - len)
  const w = 100
  const h = 26
  const pts = a.interest.map((v, i) => `${(i / Math.max(1, a.interest.length - 1)) * w},${h - v * (h - 2) - 1}`).join(' ')
  return (
    <div className="space-y-1">
      <div className="flex justify-between">
        <span className="text-xs font-medium text-ink-2">In-point</span>
        <span className="font-mono text-[0.7rem] text-ink-3">
          {shot.srcStart.toFixed(2)}s – {(shot.srcStart + len).toFixed(2)}s of {a.duration.toFixed(1)}s
        </span>
      </div>
      <div className="relative h-10 overflow-hidden rounded-md bg-well">
        <div className="absolute inset-0 flex opacity-40">
          {clip.thumbs.map((t) => (
            <img key={t} src={t} alt="" className="h-full min-w-0 flex-1 object-cover" />
          ))}
        </div>
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="absolute inset-0 size-full">
          <polyline points={pts} fill="none" stroke="var(--accent-2)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        </svg>
        <div
          className="absolute inset-y-0 rounded border-2 border-accent bg-accent/25"
          style={{ left: `${(shot.srcStart / a.duration) * 100}%`, width: `${Math.max(1.5, (len / a.duration) * 100)}%` }}
        />
        <input
          type="range"
          min={0}
          max={max}
          step={0.02}
          value={Math.min(shot.srcStart, max)}
          aria-label="Move the in-point"
          className="absolute inset-0 size-full cursor-ew-resize opacity-0"
          onChange={(e) =>
            editPlan((p) => updateShot(p, shot.id, { srcStart: parseFloat(e.target.value), reason: 'In-point set by hand' }))
          }
          onPointerUp={() => playhead.seek(shot.start + 0.001)}
        />
      </div>
    </div>
  )
}

function ShotInspector({ shot, index, plan }: { shot: Shot; index: number; plan: EditPlan }) {
  const clips = useApp((s) => s.clips.filter((c) => c.status === 'ready' && c.analysis))
  const clip = clips.find((c) => c.id === shot.clipId)
  const set = (patch: Partial<Shot>) => editPlan((p) => updateShot(p, shot.id, patch))
  const setFx = (patch: Partial<Shot['fx']>) => set({ fx: { ...shot.fx, ...patch } })
  const mode = speedMode(shot.speed)
  const t = playhead.time
  const canSplit = t > shot.start + 0.12 && t < shot.end - 0.12

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <span className="display text-sm">Shot {index + 1}</span>
          <span className="font-mono text-[0.7rem] text-ink-3">
            {fmtTime(shot.start)} → {fmtTime(shot.end)} · {(shot.end - shot.start).toFixed(2)}s
          </span>
        </div>
        <p className="mt-0.5 text-xs leading-snug text-ink-3">{shot.reason}</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          className={cx('btn btn-sm', shot.locked && 'btn-primary')}
          onClick={() => set({ locked: !shot.locked })}
          title="Locked shots survive Remix (L)"
        >
          {shot.locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />} {shot.locked ? 'Locked' : 'Lock'}
        </button>
        <button
          className="btn btn-sm"
          disabled={!clip}
          onClick={() => clip && editPlan((p) => repick(p, shot.id, { id: clip.id, kind: clip.kind, analysis: clip.analysis! }))}
          title="Try the next-best moment in this clip"
        >
          <Dices className="size-3.5" /> Re-pick
        </button>
        <button
          className="btn btn-sm"
          disabled={!canSplit}
          onClick={() => editPlan((p) => splitShot(p, shot.id, playhead.time))}
          title="Split at the playhead (S)"
        >
          <Scissors className="size-3.5" /> Split
        </button>
        <button
          className="btn btn-sm hover:text-hot"
          disabled={plan.shots.length < 2}
          onClick={() => {
            editPlan((p) => removeShot(p, shot.id))
            setState({ selectedShotId: null })
          }}
          title="Remove; the shot before fills the gap (Delete)"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      <div className="space-y-1.5">
        <div className="text-xs font-medium text-ink-2">Clip</div>
        <div className="grid grid-cols-4 gap-1">
          {clips.map((c) => (
            <button
              key={c.id}
              className="tile aspect-video overflow-hidden p-0"
              data-on={c.id === shot.clipId}
              title={c.name}
              onClick={() =>
                c.id !== shot.clipId && editPlan((p) => swapClip(p, shot.id, { id: c.id, kind: c.kind, analysis: c.analysis! }))
              }
            >
              {c.thumbs[0] ? (
                <img src={c.thumbs[0]} alt={c.name} className="size-full object-cover" />
              ) : (
                <span className="text-[0.6rem]">{c.name}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {clip?.kind === 'video' && <InPoint shot={shot} clip={clip} />}

      <div className="space-y-1.5">
        <div className="text-xs font-medium text-ink-2">Speed</div>
        <Seg
          value={mode}
          onChange={(m) => set({ speed: SPEEDS[m] })}
          options={[
            { value: 'normal', label: '1×' },
            { value: 'slow', label: 'Slow-mo' },
            { value: 'velocity', label: 'Velocity', title: 'Fast → slow → fast' },
            { value: 'hit', label: 'Hit', title: 'Slow-motion that snaps to speed' },
          ]}
        />
        {shot.speed.kind === 'constant' && (
          <Slider
            label="Rate"
            value={shot.speed.speed}
            min={0.25}
            max={2}
            onChange={(speed) => set({ speed: { kind: 'constant', speed } })}
            format={(v) => `${v.toFixed(2)}×`}
          />
        )}
      </div>

      {index > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-ink-2">Transition in</div>
          <div className="flex flex-wrap gap-1">
            {(Object.keys(TRANSITION_NAMES) as TransitionType[]).map((tt) => (
              <button
                key={tt}
                className="chip"
                data-on={shot.transition.type === tt}
                onClick={() => set({ transition: { type: tt, duration: tt === 'cut' ? 0 : shot.transition.duration || 0.25 } })}
              >
                {TRANSITION_NAMES[tt]}
              </button>
            ))}
          </div>
          {shot.transition.type !== 'cut' && (
            <Slider
              label="Length"
              value={shot.transition.duration}
              min={0.06}
              max={Math.max(
                0.1,
                Math.min(1.5, (shot.end - shot.start) * 0.9, (plan.shots[index - 1].end - plan.shots[index - 1].start) * 0.9),
              )}
              onChange={(duration) => set({ transition: { ...shot.transition, duration } })}
              format={(v) => `${v.toFixed(2)}s`}
            />
          )}
        </div>
      )}

      <div className="space-y-2">
        <div className="text-xs font-medium text-ink-2">Effects</div>
        <Slider
          label="Beat punch"
          value={shot.fx.pulse}
          max={0.2}
          onChange={(pulse) => setFx({ pulse })}
          format={(v) => `${Math.round(v * 500)}%`}
        />
        <Slider label="Shake" value={shot.fx.shake} max={1.2} onChange={(shake) => setFx({ shake })} />
        <Slider label="RGB split" value={shot.fx.rgb} max={1.2} onChange={(rgb) => setFx({ rgb })} />
        <Slider label="Flash in" value={shot.fx.flash} onChange={(flash) => setFx({ flash })} />
        <Slider
          label="Slow push"
          value={shot.fx.push}
          max={0.15}
          onChange={(push) => setFx({ push })}
          format={(v) => `${Math.round(v * 100)}%`}
        />
      </div>
    </div>
  )
}

function CaptionEditor({ id }: { id: string }) {
  const captions = useCaptionLines()
  const c = captions.find((x) => x.id === id)
  if (!c) return <p className="text-xs text-ink-3">That caption is gone.</p>
  const text = c.words.map((w) => w.text).join(' ')
  const update = (patch: { text?: string; start?: number; end?: number }) =>
    editCaptions((lines) =>
      lines.map((l) => {
        if (l.id !== id) return l
        const start = patch.start ?? l.start
        const end = Math.max(start + 0.1, patch.end ?? l.end)
        const words =
          patch.text !== undefined || patch.start !== undefined || patch.end !== undefined
            ? spreadWords(patch.text ?? text, start, end)
            : l.words
        return { ...l, start, end, words }
      }),
    )
  return (
    <div className="space-y-3">
      <div className="display text-sm">{c.title ? 'Title card' : 'Caption'}</div>
      <textarea
        className="field min-h-16 resize-y"
        defaultValue={text}
        key={id}
        onBlur={(e) => e.target.value !== text && update({ text: e.target.value })}
      />
      <div className="grid grid-cols-2 gap-2">
        <Slider
          label="Starts"
          value={c.start}
          min={0}
          max={c.end - 0.1}
          step={0.01}
          onChange={(start) => update({ start })}
          format={fmtTime}
        />
        <Slider
          label="Ends"
          value={c.end}
          min={c.start + 0.1}
          max={c.end + 4}
          step={0.01}
          onChange={(end) => update({ end })}
          format={fmtTime}
        />
      </div>
      <button
        className="btn btn-sm hover:text-hot"
        onClick={() => {
          editCaptions((lines) => lines.filter((l) => l.id !== id))
          setState({ selectedCaptionId: null })
        }}
      >
        <Trash2 className="size-3.5" /> Delete caption
      </button>
    </div>
  )
}

function useCaptionLines() {
  return useRenderProject().plan?.captions ?? []
}

export function Inspector({ plan }: { plan: EditPlan }) {
  const selected = useApp((s) => s.selectedShotId)
  const selectedCaption = useApp((s) => s.selectedCaptionId)
  const index = plan.shots.findIndex((s) => s.id === selected)
  if (selectedCaption) return <CaptionEditor id={selectedCaption} />
  if (index < 0)
    return (
      <div className="space-y-2 text-xs leading-relaxed text-ink-3">
        <p className="text-sm font-medium text-ink-2">Pick a shot or a caption on the timeline.</p>
        <p>Drag a cut to move it; it snaps to the beat (hold Alt to move freely). Lock the shots you love and Remix the rest.</p>
        <p>
          <span className="kbd">S</span> split · <span className="kbd">L</span> lock · <span className="kbd">⌫</span> remove ·{' '}
          <span className="kbd">←</span>
          <span className="kbd">→</span> previous / next shot · <span className="kbd">⌘Z</span> undo
        </p>
      </div>
    )
  return <ShotInspector key={plan.shots[index].id} shot={plan.shots[index]} index={index} plan={plan} />
}
