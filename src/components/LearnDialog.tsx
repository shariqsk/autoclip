// Learn a style from edits you love: drop them in (or paste links on desktop), AutoClip lines their
// cuts up with their music, shows what it found, and saves the result as a style of your own.

import { Link2, Plus, Sparkles, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { desktop } from '../lib/desktop'
import { readReference } from '../lib/learn/client'
import { learnStyle, type EditMeasure, type RefPhase } from '../lib/learn/measure'
import { downloadLink, makeEdit } from '../state/actions'
import { getState, setState, toast, updateSettings, useApp } from '../state/store'
import { setLearnDropHandler } from '../state/learnDrop'
import { getSavedStyle, newLearnedId, saveLearnedStyle } from '../state/styles'
import { Downloads } from './Downloads'
import { cx } from './format'
import { Modal } from './Modal'
import { Progress } from './ui'

interface Ref {
  key: string
  name: string
  status: 'reading' | 'done' | 'error'
  fraction: number
  stage: string
  measure?: EditMeasure
  error?: string
}

const PHASE_CLASS: Record<RefPhase, string> = {
  cold: 'learn-shot-cold',
  intro: 'learn-shot-intro',
  build: 'learn-shot-build',
  hero: 'learn-shot-hero',
  flurry: 'learn-shot-flurry',
  ride: 'learn-shot-ride',
  outro: 'learn-shot-intro',
}

/** The edit's rhythm at a glance: one block per shot, coloured by where it sits in the arc. */
function RhythmStrip({ m }: { m: EditMeasure }) {
  return (
    <div className="learn-strip relative flex h-5 w-full gap-px overflow-hidden" aria-hidden="true">
      {m.shots.map((s, i) => (
        <span key={i} className={cx('learn-shot h-full', PHASE_CLASS[s.phase])} style={{ flex: s.end - s.start }} />
      ))}
      {m.drop !== null && <span className="learn-drop absolute inset-y-0 w-0.5" style={{ left: `${(m.drop / m.duration) * 100}%` }} />}
    </div>
  )
}

function RefRow({ r, onRemove }: { r: Ref; onRemove: () => void }) {
  const m = r.measure
  return (
    <li className="learn-ref space-y-1.5 py-3">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold" title={r.name}>
          {r.name}
        </span>
        {m && (
          <span className="tag shrink-0">
            {Math.round(m.bpm)} BPM · {m.cuts.total} cuts · {Math.round((m.cuts.onBeat / Math.max(1, m.cuts.total)) * 100)}% on the beat
          </span>
        )}
        <button className="btn btn-bare btn-sm btn-sq shrink-0" title="Remove" aria-label={`Remove ${r.name}`} onClick={onRemove}>
          <X className="size-3.5" />
        </button>
      </div>
      {r.status === 'reading' && (
        <div className="space-y-1">
          <Progress value={r.fraction} />
          <div className="tag">{r.stage}…</div>
        </div>
      )}
      {r.status === 'error' && <div className="text-xs text-signal">{r.error}</div>}
      {m && <RhythmStrip m={m} />}
    </li>
  )
}

function LearnBody({ styleId }: { styleId: string | null }) {
  const existing = styleId ? getSavedStyle(styleId) : undefined
  const [refs, setRefs] = useState<Ref[]>(() =>
    (existing?.references ?? []).map((measure, i) => ({
      key: `saved${i}`,
      name: measure.name,
      status: 'done',
      fraction: 1,
      stage: '',
      measure,
    })),
  )
  const [name, setName] = useState(existing?.preset.name ?? 'My style')
  const inputRef = useRef<HTMLInputElement>(null)
  const counter = useRef(0)

  const update = (key: string, patch: Partial<Ref>) => setRefs((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const add = (files: File[]) => {
    const videos = files.filter((f) => f.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|mkv)$/i.test(f.name))
    if (videos.length < files.length) toast('Only videos can be learned from: they need their picture and their music.', 'error')
    for (const file of videos) {
      const key = `r${counter.current++}`
      setRefs((rs) => [...rs, { key, name: file.name.replace(/\.[^.]+$/, ''), status: 'reading', fraction: 0, stage: 'Opening' }])
      readReference(file, (fraction, stage) => update(key, { fraction, stage }))
        .then((measure) => update(key, { status: 'done', measure, fraction: 1 }))
        .catch((err) => update(key, { status: 'error', error: err instanceof Error ? err.message : String(err) }))
    }
  }

  useEffect(() => {
    setLearnDropHandler(add)
    return () => setLearnDropHandler(null)
  })

  const measures = refs.flatMap((r) => (r.measure ? [r.measure] : []))
  const reading = refs.some((r) => r.status === 'reading')
  const learned = measures.length ? learnStyle(measures, { id: styleId ?? 'learned-preview', name: name.trim() || 'My style' }) : null

  const save = () => {
    if (!learned) return
    const id = styleId ?? newLearnedId(name)
    const preset = { ...learned.preset, id: id as typeof learned.preset.id, name: name.trim() || 'My style' }
    saveLearnedStyle({ preset, facts: learned.facts, basedOn: learned.basedOn, references: measures })
    updateSettings({ style: preset.id })
    setState({ learn: null })
    toast(`${preset.name} is ready. It's in your styles.`, 'success')
    if (getState().song?.analysis && getState().clips.some((c) => c.status === 'ready')) makeEdit({ recut: true })
  }

  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-ink-2">
        Drop in edits you love, with their music. AutoClip lines each cut up with the beat and learns the pacing, the build, what happens on
        the drop and the effects. Three to ten edits in one vibe work best. Nothing leaves this device.
      </p>

      <div
        className="learn-drop-zone grid place-items-center gap-3 px-4 py-6 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          e.stopPropagation()
          add([...e.dataTransfer.files])
        }}
      >
        <div className="tag">Drop edits here</div>
        <button className="btn" onClick={() => inputRef.current?.click()}>
          <Plus className="size-3.5" /> Choose videos
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) add([...e.target.files])
            e.target.value = ''
          }}
        />
      </div>

      {desktop && (
        <form
          className="start-link flex items-center"
          onSubmit={async (e) => {
            e.preventDefault()
            const form = e.currentTarget
            const url = new FormData(form).get('link')?.toString().trim() ?? ''
            if (!url) return
            form.reset()
            const got = await downloadLink(url, 'video')
            if (got) add([new File([got.file], `${got.title}.mp4`, { type: got.file.type })])
          }}
        >
          <Link2 className="mx-3 size-4 shrink-0 text-signal" />
          <input
            name="link"
            className="min-w-0 flex-1 bg-transparent py-3 pr-2 text-sm outline-none placeholder:text-ink-3"
            placeholder="Or paste a TikTok, YouTube or Instagram link"
          />
          <button className="btn btn-sm mr-1.5">Add</button>
        </form>
      )}
      <Downloads className="start-downloads" />

      {refs.length > 0 && (
        <ul className="learn-refs">
          {refs.map((r) => (
            <RefRow key={r.key} r={r} onRemove={() => setRefs((rs) => rs.filter((x) => x.key !== r.key))} />
          ))}
        </ul>
      )}

      {learned && (
        <section className="learn-result space-y-3 p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-signal" />
            <h3 className="text-sm font-semibold">What it learned</h3>
            <span className="tag ml-auto">
              {measures.length} edit{measures.length === 1 ? '' : 's'} · rest from {learned.basedOn}
            </span>
          </div>
          <ul className="space-y-1.5 text-sm leading-snug">
            {learned.facts.map((f) => (
              <li key={f} className="flex gap-2">
                <span className="mt-[0.45em] size-1.5 shrink-0 rounded-full bg-signal" />
                {f}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-end gap-2 pt-1">
            <label className="min-w-40 flex-1">
              <span className="tag">Name</span>
              <input className="field mt-1" value={name} maxLength={28} onChange={(e) => setName(e.target.value)} />
            </label>
            <button className="btn btn-signal h-9 px-4" onClick={save} disabled={reading || !name.trim()}>
              {styleId ? 'Update style' : 'Save style'}
            </button>
          </div>
          {reading && <div className="tag">Still reading an edit; it will be included when it finishes.</div>}
        </section>
      )}
    </div>
  )
}

export function LearnDialog() {
  const learn = useApp((s) => s.learn)
  if (!learn) return null
  return (
    <Modal
      wide
      onClose={() => setState({ learn: null })}
      title={learn.styleId ? 'Teach it more' : 'Learn a style'}
      kicker="From your edits"
    >
      <LearnBody styleId={learn.styleId} />
    </Modal>
  )
}
