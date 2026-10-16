// The library: every edit you've kept, ready to post. Select some, pick where they go (Instagram and
// TikTok unless you say otherwise), then post now, at a time you choose, or spread over the coming
// days. Scheduled posts go out from the desktop shell even with this window closed.

import { CalendarClock, Check, FolderOpen, Send, Sparkles, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { useLibrary } from '../hooks/useLibrary'
import { desktop, type LibraryItem, type LibraryPost } from '../lib/desktop'
import { PLATFORMS, type Platform } from '../lib/share/post'
import { autoSlots, whenLabel } from '../lib/share/schedule'
import { setState, toast, useApp } from '../state/store'
import { cx, fmtTime } from './format'
import { Modal } from './Modal'
import { Toggle } from './ui'

const ORDER: Platform[] = ['reels', 'tiktok', 'shorts']
const SHORT: Record<Platform, string> = { reels: 'Instagram', tiktok: 'TikTok', shorts: 'Shorts' }
const KEY = 'autoclip:post-platforms'

function savedPlatforms(): Platform[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Platform[] | null
    if (Array.isArray(v) && v.length) return v.filter((p) => p in PLATFORMS)
  } catch {
    /* fall through */
  }
  // Instagram and TikTok by default. Shorts flags copyrighted music hard, so it's opt-in.
  return ['reels', 'tiktok']
}

function PostBadge({ item, platform, post }: { item: LibraryItem; platform: Platform; post: LibraryPost }) {
  const lib = desktop!.library
  const label = SHORT[platform]
  if (post.status === 'none') return null
  const set = (patch: Partial<LibraryPost>) => void lib.update(item.id, { posts: { [platform]: patch } })
  return (
    <li className={cx('lib-post flex items-center gap-1.5 text-xs', `lib-post-${post.status}`)}>
      <span className="font-semibold">{label}</span>
      <span className="min-w-0 flex-1 truncate text-ink-2">
        {post.status === 'scheduled' && post.at !== null && whenLabel(post.at)}
        {post.status === 'posting' && 'Posting…'}
        {post.status === 'due' && 'Ready to post'}
        {post.status === 'posted' && (post.url ? 'Posted' : 'Posted ✓')}
        {post.status === 'failed' && `Failed: ${post.error ?? 'unknown'}`}
      </span>
      {post.status === 'due' && (
        <>
          <button
            className="btn btn-sm"
            onClick={() => void lib.handoff(item.id, platform)}
            title={`Open ${label} with the video ready and the caption copied`}
          >
            <Send className="size-3" /> Open
          </button>
          <button
            className="btn btn-bare btn-sm btn-sq"
            onClick={() => set({ status: 'posted', postedAt: Date.now() })}
            title="It's up: mark it posted"
            aria-label={`Mark posted to ${label}`}
          >
            <Check className="size-3.5" />
          </button>
        </>
      )}
      {post.status === 'failed' && (
        <button className="btn btn-sm" onClick={() => set({ status: 'scheduled', at: Date.now(), error: null })}>
          Retry
        </button>
      )}
      {post.status === 'posted' && post.url && (
        <a className="btn btn-bare btn-sm" href={post.url} target="_blank" rel="noreferrer">
          View
        </a>
      )}
      {(post.status === 'scheduled' || post.status === 'due') && (
        <button
          className="btn btn-bare btn-sm btn-sq"
          onClick={() => set({ status: 'none', at: null })}
          title="Don't post here"
          aria-label={`Unschedule ${label}`}
        >
          <X className="size-3.5" />
        </button>
      )}
    </li>
  )
}

export function LibraryDialog() {
  const open = useApp((s) => s.libraryOpen)
  const items = useLibrary()
  const [picked, setPicked] = useState<string[]>([])
  const [platforms, setPlatforms] = useState<Platform[]>(savedPlatforms)
  const [when, setWhen] = useState('')
  const [cleanup, setCleanup] = useState(false)
  if (!open || !desktop) return null
  const lib = desktop.library
  const all = items ?? []
  const chosen = all.filter((i) => picked.includes(i.id))

  const togglePlatform = (p: Platform) => {
    const next = platforms.includes(p) ? platforms.filter((x) => x !== p) : [...platforms, p]
    setPlatforms(next)
    localStorage.setItem(KEY, JSON.stringify(next))
  }

  /** Schedule each chosen item for the chosen platforms at the given times (one per item). */
  const schedule = async (times: number[]) => {
    if (!platforms.length) return toast('Pick at least one platform.', 'error')
    await Promise.all(
      chosen.map((item, i) =>
        lib.update(item.id, {
          deleteAfterPost: cleanup,
          posts: Object.fromEntries(platforms.map((p) => [p, { status: 'scheduled', at: times[i] ?? times[0], error: null }])),
        }),
      ),
    )
    setPicked([])
  }
  const taken = all.flatMap((i) => Object.values(i.posts).flatMap((p) => (p.status === 'scheduled' && p.at ? [p.at] : [])))

  return (
    <Modal
      onClose={() => setState({ libraryOpen: false })}
      title="Library"
      kicker={`${all.length} edit${all.length === 1 ? '' : 's'} kept`}
      wide
    >
      <div className="space-y-4">
        <div className="lib-bar flex flex-wrap items-center gap-2 border-b border-line pb-3">
          <span className="tag mr-1">Post to</span>
          {ORDER.map((p) => (
            <button
              key={p}
              className={cx('style-chip', platforms.includes(p) ? 'border-signal text-ink' : 'opacity-60')}
              aria-pressed={platforms.includes(p)}
              onClick={() => togglePlatform(p)}
            >
              {platforms.includes(p) && <Check className="mr-0.5 inline size-2.5" />}
              {SHORT[p]}
            </button>
          ))}
          <span className="tag ml-auto">{chosen.length ? `${chosen.length} selected` : 'Select edits to post them'}</span>
        </div>

        {chosen.length > 0 && (
          <div className="lib-actions grid gap-2 sm:grid-cols-[auto_auto_1fr_auto]">
            <button className="slab text-base" onClick={() => void schedule([Date.now()])}>
              Post now <Send className="size-4" />
            </button>
            <button
              className="btn"
              onClick={() => void schedule(autoSlots(chosen.length, Date.now(), { taken }))}
              title="One a slot, at lunchtime and in the evening, over the coming days"
            >
              <Sparkles className="size-3.5" /> Auto-schedule
            </button>
            <div className="flex items-center gap-1.5">
              <input
                type="datetime-local"
                className="field min-w-0 flex-1 py-1 text-xs"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                aria-label="Post at"
              />
              <button className="btn btn-sm" disabled={!when} onClick={() => void schedule(chosen.map(() => new Date(when).getTime()))}>
                <CalendarClock className="size-3.5" /> Schedule
              </button>
            </div>
            <button
              className="btn btn-bare"
              onClick={() => {
                if (confirm(`Delete ${chosen.length} edit${chosen.length === 1 ? '' : 's'} from the library?`))
                  void lib.remove(chosen.map((i) => i.id)).then(() => setPicked([]))
              }}
            >
              <Trash2 className="size-3.5" /> Delete
            </button>
            <div className="sm:col-span-4">
              <Toggle
                label="Delete each video once it's posted"
                hint="Keeps the library tidy: an edit goes once it's up everywhere it was scheduled."
                checked={cleanup}
                onChange={setCleanup}
              />
            </div>
          </div>
        )}

        {items === null ? (
          <p className="tag">Opening the library…</p>
        ) : all.length === 0 ? (
          <p className="text-sm leading-relaxed text-ink-2">
            Nothing kept yet. Export a vertical edit and press <b>Save to library</b>; it lands here with its captions and hashtags, ready
            to post or schedule.
          </p>
        ) : (
          <ul className="lib-grid grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
            {all.map((item) => {
              const on = picked.includes(item.id)
              return (
                <li
                  key={item.id}
                  className={cx(
                    'lib-card relative overflow-hidden border border-line',
                    on && 'lib-card-on outline-2 -outline-offset-2 outline-signal',
                  )}
                >
                  <button
                    className="block w-full"
                    onClick={() => setPicked((ids) => (on ? ids.filter((x) => x !== item.id) : [...ids, item.id]))}
                    aria-pressed={on}
                    aria-label={`Select ${item.name}`}
                  >
                    <div className="relative aspect-[9/16] bg-black">
                      <img
                        src={`${location.origin}/__library/${item.id}/thumb.jpg`}
                        alt=""
                        className="size-full object-cover"
                        loading="lazy"
                      />
                      <span
                        className={cx(
                          'absolute top-1.5 left-1.5 grid size-5 place-items-center border',
                          on ? 'border-signal bg-signal text-white' : 'border-white/70 bg-black/30',
                        )}
                      >
                        {on && <Check className="size-3" />}
                      </span>
                      <span className="mono absolute right-1.5 bottom-1.5 bg-black/60 px-1 text-[0.65rem] text-white">
                        {fmtTime(item.duration)}
                      </span>
                    </div>
                  </button>
                  <div className="space-y-1 p-2">
                    <div className="flex items-center gap-1">
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold" title={item.name}>
                        {item.name}
                      </span>
                      <button
                        className="btn btn-bare btn-sm btn-sq"
                        onClick={() => void lib.reveal(item.id)}
                        title="Show in Finder"
                        aria-label="Show in Finder"
                      >
                        <FolderOpen className="size-3" />
                      </button>
                    </div>
                    <ul className="space-y-1">
                      {ORDER.map((p) => (
                        <PostBadge key={p} item={item} platform={p} post={item.posts[p]} />
                      ))}
                    </ul>
                    {item.deleteAfterPost && <div className="tag">Deletes once posted</div>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <p className="tag leading-snug">
          Scheduled posts go out while AutoClip is open (closing the window is fine; quitting isn't). Until your accounts are connected,
          each one arrives as a notification: click it and the platform opens with the video ready and the caption copied.
        </p>
      </div>
    </Modal>
  )
}
