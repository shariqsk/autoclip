// Import from a link (desktop app): paste a Spotify, YouTube, TikTok, Instagram or SoundCloud link,
// or several, and choose whether it's the song or footage.

import { Film, Link2, Music2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { linkProblem, parseLink } from '../lib/links'
import { importFromLink } from '../state/actions'
import { setState, useApp } from '../state/store'
import { cx } from './format'
import { Modal } from './Modal'

const EXAMPLES = ['Spotify', 'YouTube', 'TikTok', 'Instagram', 'SoundCloud', 'X']

export function LinkDialog() {
  const open = useApp((s) => s.linkDialog)
  return open ? <LinkForm key={`${open.url}|${open.mode}`} open={open} /> : null
}

function LinkForm({ open }: { open: { url: string; mode: 'audio' | 'video' | null } }) {
  const hasSong = useApp((s) => !!s.song)
  const [text, setText] = useState(open.url)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const t = setTimeout(() => ref.current?.focus(), 30)
    return () => clearTimeout(t)
  }, [])

  const links = useMemo(
    () =>
      text
        .split(/\s+/)
        .map((t) => ({ raw: t, info: parseLink(t), problem: linkProblem(t) }))
        .filter((l) => l.info),
    [text],
  )

  const one = links.length === 1 ? links[0] : null
  // A single music link defaults to the song; several links, or video sites, default to footage.
  const suggested =
    open.mode ?? (one && one.info!.kind === 'audio' ? 'audio' : one && !hasSong && one.info!.kind !== 'video' ? 'audio' : 'video')
  const close = () => setState({ linkDialog: null })
  const go = (mode: 'audio' | 'video') => {
    const usable = links.filter((l) => !l.problem)
    if (mode === 'audio') void importFromLink(usable[0].raw, 'audio')
    else for (const l of usable) void importFromLink(l.raw, 'video')
    close()
  }
  const problem = links.find((l) => l.problem)?.problem

  return (
    <Modal onClose={close} title="From a link" kicker="Desktop">
      <div className="space-y-4">
        <textarea
          ref={ref}
          className="field min-h-[5.5rem] resize-y font-mono text-xs leading-relaxed"
          placeholder={'https://open.spotify.com/track/…\nhttps://www.tiktok.com/@…/video/…'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && links.length) go(suggested)
          }}
        />
        <div className="tag flex flex-wrap gap-x-3 gap-y-1">
          {links.length ? (
            links.map((l, i) => (
              <span key={i} className={cx(l.problem ? 'text-signal' : 'text-ink-2')}>
                <Link2 className="mr-1 inline size-3" />
                {l.info!.site}
              </span>
            ))
          ) : (
            <span>Works with {EXAMPLES.join(', ')} and most video sites. Paste several to bring in a whole highlight reel.</span>
          )}
        </div>
        {problem && <p className="text-sm text-signal">{problem}</p>}

        <div className="grid grid-cols-2 gap-px bg-line-2">
          {(
            [
              ['audio', Music2, 'Use as the song', links.length > 1 ? 'Takes the first link' : 'Audio only'],
              ['video', Film, 'Add as footage', links.length > 1 ? `All ${links.length} links` : 'Video, up to 1080p'],
            ] as const
          ).map(([mode, Icon, title, note]) => (
            <button
              key={mode}
              disabled={!links.length || !!problem}
              onClick={() => go(mode)}
              className={cx(
                'bg-bg px-4 py-3 text-left transition-colors disabled:opacity-35',
                suggested === mode ? 'bg-signal text-signal-ink' : 'hover:bg-bg-2',
              )}
            >
              <Icon className="size-4" />
              <div className="head mt-2 text-2xl">{title}</div>
              <div className={cx('tag mt-1', suggested === mode && 'text-signal-ink/70')}>{note}</div>
            </button>
          ))}
        </div>
        <p className="text-xs leading-snug text-ink-3">
          Downloads run on this computer with yt-dlp. Spotify tracks are matched to the same recording on YouTube. Only use music and
          footage you have the rights to.
        </p>
      </div>
    </Modal>
  )
}
