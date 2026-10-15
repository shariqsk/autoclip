// The top bar: wordmark, a broadcast-style status line for whatever the app is doing, and the looks.

import { CircleHelp, RotateCcw } from 'lucide-react'
import { THEMES, type ThemeId } from '../hooks/useTheme'
import { getStyle } from '../lib/edit/presets'
import { resetProject } from '../state/actions'
import { activeDraft, setState, useApp } from '../state/store'
import { cx } from './format'
import { Wordmark } from './Logo'

function Status() {
  const song = useApp((s) => s.song)
  const clips = useApp((s) => s.clips)
  const draft = useApp((s) => activeDraft(s))
  const takeNo = useApp((s) => s.drafts.findIndex((d) => d.id === s.activeDraftId) + 1)
  const demo = useApp((s) => s.demoLoading)
  const watching = clips.filter((c) => c.status === 'queued' || c.status === 'analyzing').length
  const ready = clips.filter((c) => c.status === 'ready').length

  let live = false
  let text = 'Standing by'
  if (demo !== null) text = `Shooting demo footage ${Math.round(demo * 100)}%`
  else if (song && song.status !== 'ready' && song.status !== 'error') text = `Listening · ${song.stage}`
  else if (watching) text = `Watching footage · ${ready}/${clips.length}`
  else if (draft) {
    live = true
    text = `Take ${String(takeNo).padStart(2, '0')} on air · ${getStyle(draft.style).name} · ${draft.plan.shots.length} shots`
  } else if (song && !clips.length) text = 'Song in · waiting for footage'
  else if (!song && clips.length) text = 'Footage in · waiting for a song'

  return (
    <div className="mono hidden min-w-0 items-center gap-2 text-[0.68rem] tracking-[0.12em] text-ink-2 uppercase md:flex">
      <span className={cx('size-2 shrink-0', live ? 'tally bg-signal' : watching || demo !== null ? 'tally bg-signal-2' : 'bg-ink-3')} />
      <span className="truncate">{text}</span>
    </div>
  )
}

export function Header({ theme, setTheme }: { theme: ThemeId; setTheme: (t: ThemeId) => void }) {
  const hasProject = useApp((s) => !!s.song || s.clips.length > 0)
  return (
    <header className="flex h-12 shrink-0 items-center gap-5 border-b border-line px-4">
      <button onClick={() => hasProject || undefined} className="shrink-0" aria-label="AutoClip">
        <Wordmark />
      </button>
      <Status />
      <div className="ml-auto flex items-center gap-1">
        <div className="mr-2 flex items-center gap-1" role="radiogroup" aria-label="Look">
          {THEMES.map((t) => (
            <button
              key={t.id}
              role="radio"
              aria-checked={theme === t.id}
              title={`${t.name}: ${t.note} (⌘.)`}
              onClick={() => setTheme(t.id)}
              className={cx(
                'grid size-6 grid-cols-2 border p-0.5 transition-colors',
                theme === t.id ? 'border-ink' : 'border-line-2 hover:border-ink-3',
              )}
            >
              <span style={{ background: t.swatch[0] }} />
              <span style={{ background: t.swatch[2] }} />
              <span style={{ background: t.swatch[1] }} className="col-span-2" />
            </button>
          ))}
        </div>
        {hasProject && (
          <button
            className="btn btn-bare btn-sm"
            onClick={() => {
              if (confirm('Start a new project? The song, footage and takes will be cleared.')) resetProject()
            }}
          >
            <RotateCcw className="size-3" /> <span className="hidden sm:inline">New</span>
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
    </header>
  )
}
