// Director inspector: everything about the selected shot (clip, in-point, speed, transition,
// effects, lock) or the selected caption (words and timing).

import { Dices, Lock, Scissors, Trash2, Unlock } from 'lucide-react'
import { useMemo } from 'react'
import { spreadWords } from '../../lib/captions/parse'
import { removeShot, repick, splitShot, swapClip, updateShot } from '../../lib/edit/ops'
import { TRANSITION_NAMES } from '../../lib/edit/presets'
import { sourceDuration } from '../../lib/edit/speed'
import type { Clip, EditPlan, Shot, SpeedRamp, TransitionType } from '../../lib/types'
import { useRenderProject } from '../../hooks/useRenderProject'
import { editCaptions, editPlan } from '../../state/actions'
import { playhead } from '../../state/playhead'
import { setState, useApp } from '../../state/store'
import { cx, fmtTime, PHASE_NAMES } from '../format'
import { Seg, Slider } from '../ui'

type SpeedMode = 'normal' | 'slow' | 'velocity' | 'freeze'

function speedMode(s: SpeedRamp): SpeedMode {
  if (s.kind === 'velocity') return 'velocity'
  if (s.kind === 'ease-in' || s.kind === 'freeze') return 'freeze'
  return s.speed < 0.95 ? 'slow' : 'normal'
}

const SPEEDS: Record<SpeedMode, SpeedRamp> = {
  normal: { kind: 'constant', speed: 1 },
  slow: { kind: 'constant', speed: 0.5 },
  velocity: { kind: 'velocity', fast: 1.6, slow: 0.35 },
  freeze: { kind: 'freeze', from: 0.4, at: 0.45 },
}

function InPoint({ shot, clip }: { shot: Shot; clip: Clip }) {
  const a = clip.analysis!
  const len = sourceDuration(shot.speed, shot.end - shot.start)
  const max = Math.max(0, a.duration - len)
  const pts = a.interest.map((v, i) => `${(i / Math.max(1, a.interest.length - 1)) * 100},${26 - v * 24 - 1}`).join(' ')
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between">
        <span className="tag">In-point</span>
        <span className="mono text-[0.65rem] text-ink-2">
          {shot.srcStart.toFixed(2)}–{(shot.srcStart + len).toFixed(2)}s / {a.duration.toFixed(1)}s
        </span>
      </div>
      <div className="relative h-10 overflow-hidden bg-bg-3">
        <div className="absolute inset-0 flex opacity-40">
          {clip.thumbs.map((t) => (
            <img key={t} src={t} alt="" className="h-full min-w-0 flex-1 object-cover" />
          ))}
        </div>
        <svg viewBox="0 0 100 26" preserveAspectRatio="none" className="absolute inset-0 size-full">
          <polyline points={pts} fill="none" stroke="var(--ink)" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
        </svg>
        <div
          className="absolute inset-y-0 border-2 border-signal bg-signal/25"
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
  const allClips = useApp((s) => s.clips)
  const clips = useMemo(() => allClips.filter((c) => c.status === 'ready' && c.analysis), [allClips])
  const clip = clips.find((c) => c.id === shot.clipId)
  const set = (patch: Partial<Shot>) => editPlan((p) => updateShot(p, shot.id, patch))
  const setFx = (patch: Partial<Shot['fx']>) => set({ fx: { ...shot.fx, ...patch } })
  const t = playhead.time
  const canSplit = t > shot.start + 0.12 && t < shot.end - 0.12

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-baseline gap-2">
          <span className="head text-2xl">Shot {String(index + 1).padStart(2, '0')}</span>
          {shot.phase && <span className={cx('tag', shot.phase === 'hero' && 'text-signal')}>{PHASE_NAMES[shot.phase]}</span>}
        </div>
        <div className="mono mt-1 text-[0.65rem] text-ink-2">
          {fmtTime(shot.start)} → {fmtTime(shot.end)} · {(shot.end - shot.start).toFixed(2)}s
        </div>
        <p className="mt-1 text-xs leading-snug text-ink-3">{shot.reason}</p>
      </div>

      <div className="flex flex-wrap">
        <button
          className={cx('btn btn-sm -mr-px', shot.locked && 'btn-signal')}
          onClick={() => set({ locked: !shot.locked })}
          title="Locked shots survive Remix (L)"
        >
          {shot.locked ? <Lock className="size-3" /> : <Unlock className="size-3" />} {shot.locked ? 'Locked' : 'Lock'}
        </button>
        <button
          className="btn btn-sm -mr-px"
          disabled={!clip}
          onClick={() => clip && editPlan((p) => repick(p, shot.id, { id: clip.id, kind: clip.kind, analysis: clip.analysis! }))}
          title="Try the next-best moment in this clip"
        >
          <Dices className="size-3" /> Re-pick
        </button>
        <button
          className="btn btn-sm -mr-px"
          disabled={!canSplit}
          onClick={() => editPlan((p) => splitShot(p, shot.id, playhead.time))}
          title="Split at the playhead (S)"
        >
          <Scissors className="size-3" /> Split
        </button>
        <button
          className="btn btn-sm"
          disabled={plan.shots.length < 2}
          onClick={() => {
            editPlan((p) => removeShot(p, shot.id))
            setState({ selectedShotId: null })
          }}
          title="Remove; the shot before fills the gap (Delete)"
        >
          <Trash2 className="size-3" />
        </button>
      </div>

      <div className="space-y-1.5">
        <div className="tag">Clip</div>
        <div className="grid grid-cols-4 gap-px bg-line">
          {clips.map((c) => (
            <button
              key={c.id}
              className={cx(
                'relative aspect-video overflow-hidden bg-bg-3',
                c.id === shot.clipId && 'outline-2 -outline-offset-2 outline-signal',
              )}
              title={c.name}
              onClick={() =>
                c.id !== shot.clipId && editPlan((p) => swapClip(p, shot.id, { id: c.id, kind: c.kind, analysis: c.analysis! }))
              }
            >
              {c.thumbs[0] ? (
                <img src={c.thumbs[0]} alt={c.name} className="size-full object-cover" />
              ) : (
                <span className="tag">{c.name}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {clip?.kind === 'video' && <InPoint shot={shot} clip={clip} />}

      <div className="space-y-1.5">
        <div className="tag">Speed</div>
        <Seg
          value={speedMode(shot.speed)}
          onChange={(m) => set({ speed: SPEEDS[m] })}
          options={[
            { value: 'normal', label: '1×' },
            { value: 'slow', label: 'Slow' },
            { value: 'velocity', label: 'Ramp', title: 'Fast, slow, fast' },
            { value: 'freeze', label: 'Freeze', title: 'Slow motion into a freeze-frame' },
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
          <div className="tag">Into this shot</div>
          <div className="flex flex-wrap gap-1">
            {(Object.keys(TRANSITION_NAMES) as TransitionType[]).map((tt) => (
              <button
                key={tt}
                className="opt"
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

      <div className="space-y-2.5">
        <div className="tag">Effects</div>
        <Slider
          label="Beat punch"
          value={shot.fx.pulse}
          max={0.2}
          onChange={(pulse) => setFx({ pulse })}
          format={(v) => `${Math.round(v * 500)}`}
        />
        <Slider label="Shake" value={shot.fx.shake} max={1.2} onChange={(shake) => setFx({ shake })} />
        <Slider label="RGB split" value={shot.fx.rgb} max={1.2} onChange={(rgb) => setFx({ rgb })} />
        <Slider label="Flash in" value={shot.fx.flash} onChange={(flash) => setFx({ flash })} />
        <Slider label="Black and white" value={shot.fx.mono ?? 0} onChange={(mono) => setFx({ mono })} />
        <Slider label="Strobe" value={shot.fx.strobe ?? 0} onChange={(strobe) => setFx({ strobe })} />
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
  const captions = useRenderProject().plan?.captions ?? []
  const c = captions.find((x) => x.id === id)
  if (!c) return <p className="tag">That caption is gone.</p>
  const text = c.words.map((w) => w.text).join(' ')
  const update = (patch: { text?: string; start?: number; end?: number }) =>
    editCaptions((lines) =>
      lines.map((l) => {
        if (l.id !== id) return l
        const start = patch.start ?? l.start
        const end = Math.max(start + 0.1, patch.end ?? l.end)
        return { ...l, start, end, words: spreadWords(patch.text ?? text, start, end) }
      }),
    )
  return (
    <div className="space-y-3">
      <div className="head text-2xl">{c.title ? 'Title card' : c.nameplate ? 'Nameplate' : 'Caption'}</div>
      <textarea
        className="field min-h-16 resize-y"
        defaultValue={text}
        key={id}
        onBlur={(e) => e.target.value !== text && update({ text: e.target.value })}
      />
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
      <button
        className="btn btn-sm"
        onClick={() => {
          editCaptions((lines) => lines.filter((l) => l.id !== id))
          setState({ selectedCaptionId: null })
        }}
      >
        <Trash2 className="size-3" /> Delete
      </button>
    </div>
  )
}

export function Inspector({ plan }: { plan: EditPlan }) {
  const selected = useApp((s) => s.selectedShotId)
  const selectedCaption = useApp((s) => s.selectedCaptionId)
  const index = plan.shots.findIndex((s) => s.id === selected)
  if (selectedCaption) return <CaptionEditor id={selectedCaption} />
  if (index < 0)
    return (
      <div className="space-y-3 text-xs leading-relaxed text-ink-3">
        <p className="head text-2xl text-ink">Pick a shot</p>
        <p>
          Click any shot or caption on the tape. Drag a cut to move it: it snaps to the beat (hold Alt to move freely). Lock the shots you
          love, then Remix the rest.
        </p>
        <p className="mono text-[0.65rem] leading-6 uppercase">
          <span className="kbd">S</span> split · <span className="kbd">L</span> lock · <span className="kbd">⌫</span> remove ·{' '}
          <span className="kbd">←</span>
          <span className="kbd">→</span> shots · <span className="kbd">⌘Z</span> undo
        </p>
      </div>
    )
  return <ShotInspector key={plan.shots[index].id} shot={plan.shots[index]} index={index} plan={plan} />
}
