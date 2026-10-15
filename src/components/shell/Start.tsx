// The ways in, shared by every layout's first screen: choose files, the demo, a link (desktop),
// links in flight and the last project.

import { ArrowRight, History, Link2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { desktop } from '../../lib/desktop'
import { loadDemo, openLinkDialog } from '../../state/actions'
import { loadSaved, restore, type SavedProject } from '../../state/persist'
import { toast, useApp } from '../../state/store'
import { Downloads } from '../Downloads'
import { cx } from '../format'
import { Progress } from '../ui'

export function DemoButton({ className, children }: { className?: string; children?: ReactNode }) {
  const demo = useApp((s) => s.demoLoading)
  return (
    <button className={cx('btn', className)} onClick={() => void loadDemo()} disabled={demo !== null}>
      {demo !== null ? `Shooting demo ${Math.round(demo * 100)}%` : (children ?? 'Watch a demo cut')}
    </button>
  )
}

export function DemoProgress({ className }: { className?: string }) {
  const demo = useApp((s) => s.demoLoading)
  return demo !== null ? <Progress value={demo} className={className} /> : null
}

export function LinkForm({ className }: { className?: string }) {
  if (!desktop) return null
  return (
    <form
      className={cx('start-link flex items-center', className)}
      onSubmit={(e) => {
        e.preventDefault()
        const url = new FormData(e.currentTarget).get('link')?.toString() ?? ''
        if (url.trim()) openLinkDialog(url.trim())
      }}
    >
      <Link2 className="mx-3 size-4 shrink-0 text-signal" />
      <input
        name="link"
        className="min-w-0 flex-1 bg-transparent py-3 pr-2 text-sm outline-none placeholder:text-ink-3"
        placeholder="Or paste a Spotify, YouTube or TikTok link"
      />
      <button className="btn btn-sm mr-1.5">Import</button>
    </form>
  )
}

export function Resume({ className }: { className?: string }) {
  const [saved, setSaved] = useState<SavedProject | null>(null)
  const [resuming, setResuming] = useState(false)
  useEffect(() => {
    void loadSaved().then(setSaved)
  }, [])
  if (!saved) return null
  return (
    <button
      className={cx('start-resume group flex items-center gap-3 px-3 py-2.5 text-left', className)}
      disabled={resuming}
      onClick={async () => {
        setResuming(true)
        try {
          await restore(saved)
        } catch {
          toast("Couldn't open the saved project.", 'error')
          setResuming(false)
        }
      }}
    >
      <History className="size-4 shrink-0 text-signal" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">Pick up where you left off: {saved.song.name}</span>
        <span className="tag">
          {saved.clips.length} clips · {saved.drafts.length} takes ·{' '}
          {new Date(saved.savedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
        </span>
      </span>
      <ArrowRight className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
    </button>
  )
}

/** Link form, downloads and the resume button, stacked. */
export function StartExtras({ className }: { className?: string }) {
  return (
    <div className={cx('space-y-3', className)}>
      <LinkForm />
      <Downloads className="start-downloads" />
      <Resume />
    </div>
  )
}

/** What the stage says before there's a take to show. */
export function StageHint({ className }: { className?: string }) {
  const song = useApp((s) => s.song)
  const clips = useApp((s) => s.clips)
  const drafts = useApp((s) => s.drafts.length)
  if (drafts) return null
  const watching = clips.some((c) => c.status === 'queued' || c.status === 'analyzing')
  const [big, small] = !song
    ? ['Needs a song', 'Drop an MP3, M4A or WAV']
    : !clips.length
      ? ['Needs footage', 'Drop videos or photos']
      : song.status !== 'ready' || watching
        ? ['Rolling…', 'Listening and watching. The cut makes itself.']
        : ['Ready', 'Hit Cut it']
  return (
    <div className={cx('stage-hint pointer-events-none absolute inset-0 grid place-items-center p-6', className)}>
      <div className="text-center">
        <div className="stage-hint-big head rise">{big}</div>
        <div className="tag mt-3">{small}</div>
      </div>
    </div>
  )
}
