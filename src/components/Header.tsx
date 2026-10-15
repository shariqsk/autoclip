import { CircleHelp, Palette, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { THEMES, type ThemeId } from '../hooks/useTheme'
import { resetProject } from '../state/actions'
import { setState, useApp } from '../state/store'
import { Logo } from './Logo'
import { cx } from './format'

export function Header({ theme, setTheme }: { theme: ThemeId; setTheme: (t: ThemeId) => void }) {
  const hasProject = useApp((s) => !!s.song || s.clips.length > 0)
  const [themesOpen, setThemesOpen] = useState(false)
  return (
    <header className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <div className="flex items-center gap-2.5">
        <Logo />
        <div className="leading-none">
          <div className="display text-[1.05rem]">AutoClip</div>
          <div className="mt-0.5 hidden text-[0.68rem] text-ink-3 sm:block">Beat-synced edits, cut for you</div>
        </div>
      </div>
      <div className="ml-auto flex items-center gap-1">
        {hasProject && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              if (confirm('Start over? Your song, clips and drafts will be cleared.')) resetProject()
            }}
          >
            <RotateCcw className="size-3.5" /> <span className="hidden sm:inline">New</span>
          </button>
        )}
        <div className="relative">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setThemesOpen(!themesOpen)}
            aria-expanded={themesOpen}
            title="Change the look (⌘.)"
          >
            <Palette className="size-3.5" /> <span className="hidden sm:inline">{THEMES.find((t) => t.id === theme)!.name}</span>
          </button>
          {themesOpen && (
            <div className="panel rise absolute right-0 z-40 mt-2 w-56 p-1.5" onMouseLeave={() => setThemesOpen(false)}>
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  className={cx(
                    'flex w-full items-center gap-3 rounded-[var(--r-ctl)] px-2.5 py-2 text-left',
                    theme === t.id ? 'bg-panel-2' : 'hover:bg-panel-2',
                  )}
                  onClick={() => {
                    setTheme(t.id)
                    setThemesOpen(false)
                  }}
                >
                  <span className="flex overflow-hidden rounded-md border border-black/20">
                    {t.swatch.map((c) => (
                      <span key={c} className="h-6 w-3" style={{ background: c }} />
                    ))}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">{t.name}</span>
                    <span className="block text-xs text-ink-3">{t.note}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          className="btn btn-ghost btn-sm btn-icon"
          title="How it works and shortcuts (?)"
          onClick={() => setState({ helpOpen: true })}
        >
          <CircleHelp className="size-4" />
        </button>
        <a
          className="btn btn-ghost btn-sm btn-icon"
          href="https://github.com/shariqsk/autoclip"
          target="_blank"
          rel="noreferrer"
          title="Source on GitHub"
        >
          <GithubMark />
        </a>
      </div>
    </header>
  )
}

function GithubMark() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}
