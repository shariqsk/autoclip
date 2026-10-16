// The first screen, laid out like a fight poster: the headline, the card (what AutoClip does, bout
// by bout), and a marquee. Resumes the last project if there is one.

import { ArrowRight, History, Link2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { desktop } from '../lib/desktop'
import { addFiles, loadDemo, openLinkDialog } from '../state/actions'
import { loadSaved, restore, type SavedProject } from '../state/persist'
import { toast, useApp } from '../state/store'
import { Downloads } from './Downloads'
import { Progress } from './ui'

const CARD: [string, string, string][] = [
  ['Main event', 'Every cut on the beat', 'Tempo, every beat and bar, the build and the drop: found in about a second.'],
  [
    'Co-main',
    'The KO lands on the drop',
    'Every second of footage scored for impact, motion and crowd roar; the best moment goes on the hit.',
  ],
  ['Feature', 'Black and white walkout', 'Slowed intro, a build that tightens, colour slamming back on a freeze-frame.'],
  ['Prelims', 'Lyrics, heard', 'Whisper transcribes the vocals on your device for word-timed captions.'],
  ['Prelims', 'The announcer', 'A Kokoro voice reads your intro line with the music ducked under it.'],
  ['Prelims', 'Out in seconds', 'Up to 4K at 60 frames, encoded right here. Nothing is uploaded.'],
]

const TICKER = [
  'Beat detection',
  'Drop detection',
  'Arc planning',
  'Freeze-frames',
  'Speed ramps',
  'Smart reframing',
  'On-device captions',
  'AI announcer',
  '4K export',
  'Nothing uploaded',
]

export function Welcome() {
  const demo = useApp((s) => s.demoLoading)
  const inputRef = useRef<HTMLInputElement>(null)
  const [saved, setSaved] = useState<SavedProject | null>(null)
  const [resuming, setResuming] = useState(false)

  useEffect(() => {
    void loadSaved().then(setSaved)
  }, [])

  return (
    <div className="flex min-h-full flex-col">
      <div className="grid flex-1 border-b border-line lg:grid-cols-[1.3fr_1fr]">
        <div className="halftone flex flex-col justify-between gap-10 px-6 py-8 sm:px-10 sm:py-12">
          <div className="tag">Auto editor · beat-synced · runs on your device</div>
          <h1 className="head slam text-[clamp(3.2rem,7.2vw,8.2rem)] leading-[0.86]">
            <span className="block whitespace-nowrap">Drop a song.</span>
            <span className="block whitespace-nowrap">Drop the tape.</span>
            <span className="mt-[0.06em] inline-block bg-signal px-[0.07em] pt-[0.04em] whitespace-nowrap text-signal-ink">
              Get the cut.
            </span>
          </h1>
          <div className="space-y-6">
            <p className="max-w-xl text-lg leading-snug text-ink-2">
              AutoClip hears the build and the drop, finds the knockout in your footage and cuts a synced edit on its own: UFC, hoops, cars,
              travel, anything with a beat.
            </p>
            <div className="flex flex-wrap gap-3">
              <button className="slab" onClick={() => inputRef.current?.click()}>
                Choose files <ArrowRight className="size-6" />
              </button>
              <button className="btn h-auto px-5 text-xs" onClick={() => void loadDemo()} disabled={demo !== null}>
                {demo !== null ? `Shooting demo ${Math.round(demo * 100)}%` : 'Watch a demo cut'}
              </button>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept="audio/*,video/*,image/*,.srt,.lrc"
                hidden
                onChange={(e) => {
                  if (e.target.files?.length) void addFiles([...e.target.files])
                  e.target.value = ''
                }}
              />
            </div>
            {demo !== null && <Progress value={demo} className="max-w-md" />}
            {desktop && (
              <form
                className="flex max-w-xl border border-line-2 focus-within:border-signal"
                onSubmit={(e) => {
                  e.preventDefault()
                  const url = new FormData(e.currentTarget).get('link')?.toString() ?? ''
                  if (url.trim()) openLinkDialog(url.trim())
                }}
              >
                <Link2 className="m-3 size-4 shrink-0 text-signal" />
                <input
                  name="link"
                  className="min-w-0 flex-1 bg-transparent py-3 pr-2 text-sm outline-none placeholder:text-ink-3"
                  placeholder="Or paste a Spotify, YouTube or TikTok link"
                />
                <button className="btn h-auto border-0 border-l border-line-2 px-4">Import</button>
              </form>
            )}
            <Downloads className="max-w-xl border border-line px-3" />
            {saved && (
              <button
                className="group flex max-w-md items-center gap-3 border border-line-2 px-3 py-2.5 text-left hover:border-ink"
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
            )}
            <p className="tag">Or drag a song and your clips onto this window, all at once.</p>
          </div>
        </div>

        <aside className="border-t border-line lg:border-t-0 lg:border-l">
          <div className="border-b border-line px-6 py-5">
            <div className="tag text-signal">Tonight</div>
            <div className="head mt-1 text-5xl">The card</div>
          </div>
          <ol>
            {CARD.map(([billing, bout, body], i) => (
              <li key={bout} className="grid grid-cols-[3rem_1fr] gap-x-3 border-b border-line px-6 py-4">
                <span className="head text-3xl text-ink-3">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <div className="tag">{billing}</div>
                  <div className={`head mt-1 ${i === 0 ? 'text-3xl text-signal' : 'text-2xl'}`}>{bout}</div>
                  <p className="mt-1 text-sm leading-snug text-ink-2">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </div>
      <div className="overflow-hidden bg-signal py-2 text-signal-ink" aria-hidden="true">
        <div className="marquee flex w-max">
          {[0, 1].map((k) => (
            <div key={k} className="head flex shrink-0 items-center text-2xl">
              {TICKER.map((t) => (
                <span key={t} className="flex items-center">
                  <span className="px-5">{t}</span>
                  <span className="size-2 bg-signal-ink" />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
