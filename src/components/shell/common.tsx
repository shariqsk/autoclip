// Pieces every layout's top bar uses: the status line, the look picker and the small actions.

import { CircleHelp, Palette, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { LAYOUTS, setLook, useLook } from '../../hooks/useTheme'
import { getStyle } from '../../lib/edit/presets'
import { resetProject } from '../../state/actions'
import { playhead } from '../../state/playhead'
import { activeDraft, getState, setState, useApp } from '../../state/store'
import { cx } from '../format'

function useStatus(): { text: string; live: boolean; busy: boolean } {
  const song = useApp((s) => s.song)
  const clips = useApp((s) => s.clips)
  const draft = useApp((s) => activeDraft(s))
  const takeNo = useApp((s) => s.drafts.findIndex((d) => d.id === s.activeDraftId) + 1)
  const demo = useApp((s) => s.demoLoading)
  const downloads = useApp((s) => s.downloads.filter((d) => !d.error).length)
  const watching = clips.filter((c) => c.status === 'queued' || c.status === 'analyzing').length
  const ready = clips.filter((c) => c.status === 'ready').length
  if (demo !== null) return { text: `Shooting demo footage ${Math.round(demo * 100)}%`, live: false, busy: true }
  if (downloads) return { text: `Downloading ${downloads} link${downloads > 1 ? 's' : ''}`, live: false, busy: true }
  if (song && song.status !== 'ready' && song.status !== 'error') return { text: `Listening · ${song.stage}`, live: false, busy: true }
  if (watching) return { text: `Watching footage · ${ready}/${clips.length}`, live: false, busy: true }
  if (draft) return { text: `Take ${takeNo} · ${getStyle(draft.style).name} · ${draft.plan.shots.length} shots`, live: true, busy: false }
  if (song && !clips.length) return { text: 'Song in · add footage', live: false, busy: false }
  if (!song && clips.length) return { text: 'Footage in · add a song', live: false, busy: false }
  return { text: 'Ready', live: false, busy: false }
}

export function Status({ className }: { className?: string }) {
  const { text, live, busy } = useStatus()
  return (
    <div className={cx('status flex min-w-0 items-center gap-2', className)}>
      <span className={cx('status-dot size-2 shrink-0 rounded-full', live ? 'bg-signal' : busy ? 'tally bg-signal-2' : 'bg-ink-3')} />
      <span className="truncate">{text}</span>
    </div>
  )
}

/** Four layouts, three colourways each. */
export function LookPicker({ className, align = 'right' }: { className?: string; align?: 'left' | 'right' }) {
  const { layout, colorway } = useLook()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])
  return (
    <div ref={ref} className={cx('relative', className)}>
      <button className="btn btn-bare btn-sm" onClick={() => setOpen(!open)} aria-expanded={open} title="Layout and colours (⌘.)">
        <Palette className="size-3.5" /> <span className="hidden sm:inline">{LAYOUTS.find((l) => l.id === layout)!.name}</span>
      </button>
      {open && (
        <div className={cx('look-picker rise absolute z-50 mt-2 w-[22rem] p-2', align === 'right' ? 'right-0' : 'left-0')}>
          {LAYOUTS.map((l) => (
            <div key={l.id} className={cx('look-row flex items-center gap-3 p-2', layout === l.id && 'look-row-on')}>
              <button className="min-w-0 flex-1 text-left" onClick={() => setLook(l.id)}>
                <div className="text-sm font-semibold">{l.name}</div>
                <div className="truncate text-xs opacity-60">{l.note}</div>
              </button>
              <div className="flex gap-1.5">
                {l.colorways.map((c) => (
                  <button
                    key={c.id}
                    title={`${l.name} · ${c.name}`}
                    aria-label={`${l.name}, ${c.name}`}
                    onClick={() => setLook(l.id, c.id)}
                    className={cx('look-swatch grid size-7 grid-cols-2 overflow-hidden', colorway === c.id && 'look-swatch-on')}
                  >
                    <span style={{ background: c.swatch[0] }} />
                    <span style={{ background: c.swatch[2] }} />
                    <span style={{ background: c.swatch[1] }} className="col-span-2" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function TopActions({ className }: { className?: string }) {
  const hasProject = useApp((s) => !!s.song || s.clips.length > 0)
  return (
    <div className={cx('flex items-center gap-0.5', className)}>
      <LookPicker />
      {hasProject && (
        <button
          className="btn btn-bare btn-sm btn-sq"
          title="New project"
          onClick={() => {
            if (confirm('Start a new project? The song, footage and takes will be cleared.')) resetProject()
          }}
        >
          <RotateCcw className="size-3.5" />
        </button>
      )}
      <button className="btn btn-bare btn-sm btn-sq" title="How it works and shortcuts (?)" onClick={() => setState({ helpOpen: true })}>
        <CircleHelp className="size-3.5" />
      </button>
      <a
        className="btn btn-bare btn-sm btn-sq"
        href="https://github.com/shariqsk/autoclip"
        target="_blank"
        rel="noreferrer"
        title="Source on GitHub"
      >
        <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor" aria-hidden="true">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
        </svg>
      </a>
    </div>
  )
}

/**
 * Sets --beat on the page (1 on a beat, decaying to 0) while the edit plays, so layouts can pulse,
 * glow and blink in time with the music.
 */
export function BeatPulse() {
  useEffect(() => {
    let raf = 0
    let last = -1
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const s = getState()
      const d = s.drafts.find((x) => x.id === s.activeDraftId)
      let v = 0
      if (d && playhead.playing) {
        const t = playhead.time
        for (const h of d.plan.hits) {
          const dt = t - h.time
          if (dt >= 0 && dt < 0.35) v = Math.max(v, (h.kind === 'drop' ? 1 : h.strength) * Math.exp(-dt / 0.12))
        }
      }
      const rounded = Math.round(v * 50) / 50
      if (rounded !== last) {
        document.documentElement.style.setProperty('--beat', String(rounded))
        last = rounded
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return null
}
