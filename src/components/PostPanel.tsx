// After an export: get it posted. Pick the platform, a caption in the tone you want and the hashtags
// to go with it (all editable), then one button saves the video, copies the words and opens the
// platform's upload page.

import { Check, Copy, ExternalLink, Plus, Shuffle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { desktop } from '../lib/desktop'
import { getStyle } from '../lib/edit/presets'
import { PLATFORMS, postKit, postText, toHashtag, TONES, type Platform, type Tone } from '../lib/share/post'
import { toast, useApp } from '../state/store'
import { cx } from './format'
import { Seg } from './ui'

async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast(`${what} copied.`, 'success')
  } catch {
    toast("Couldn't copy that.", 'error')
  }
}

export function PostPanel({ blob, name, platform: initial, seconds }: { blob: Blob; name: string; platform: Platform; seconds: number }) {
  const [platform, setPlatform] = useState<Platform>(initial)
  const [tone, setTone] = useState<Tone>('hype')
  const [shuffle, setShuffle] = useState(0)
  const people = useApp((s) => s.people)
  const nameplate = useApp((s) => s.settings.nameplate.name)
  const title = useApp((s) => s.settings.captions.title)
  const song = useApp((s) => s.song?.name ?? '')
  const style = useApp((s) => s.drafts.find((d) => d.id === s.activeDraftId)?.style ?? s.settings.style)
  const seed = useApp((s) => s.drafts.find((d) => d.id === s.activeDraftId)?.plan.seed ?? 1)

  const subjects = useMemo(() => {
    const stars = people.filter((p) => p.role === 'star' && p.name.trim()).map((p) => p.name.trim())
    return stars.length ? stars : nameplate.trim() ? [nameplate.trim()] : []
  }, [people, nameplate])
  const kit = useMemo(
    () => postKit({ platform, subjects, title, song, style: getStyle(style), seed: seed + shuffle }),
    [platform, subjects, title, song, style, seed, shuffle],
  )

  // Your edits to the words win until you change platform or tone.
  const [edits, setEdits] = useState<{ key: string; caption?: string; tags?: string[] }>({ key: '' })
  const key = `${platform}|${tone}|${shuffle}`
  const caption = edits.key === key && edits.caption !== undefined ? edits.caption : kit.captions[tone]
  const tags = edits.key === key && edits.tags ? edits.tags : kit.hashtags
  const [adding, setAdding] = useState('')
  const p = PLATFORMS[platform]
  const text = postText(caption, tags)
  const tooLong = seconds > p.maxSeconds

  const post = async () => {
    await copyText(platform === 'shorts' ? `${kit.title}\n\n${text}` : text, 'Caption')
    if (desktop) {
      try {
        const path = await desktop.postVideo(new Uint8Array(await blob.arrayBuffer()), `${name}.mp4`, p.uploadUrl)
        toast(`Saved to ${path.split('/').slice(-2).join('/')}. Drag it into ${p.name} and paste the caption.`, 'success')
      } catch (err) {
        toast(`Couldn't open ${p.name}: ${err instanceof Error ? err.message : err}`, 'error')
      }
    } else {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${name}.mp4`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      window.open(p.uploadUrl, '_blank', 'noopener')
    }
  }

  return (
    <div className="post-panel space-y-3 border-t border-line pt-4">
      <div className="flex items-baseline justify-between gap-2">
        <div className="head text-xl">Post it</div>
        <span className="tag">Written from your edit · change anything</span>
      </div>
      <Seg
        value={platform}
        onChange={setPlatform}
        options={(Object.keys(PLATFORMS) as Platform[]).map((id) => ({
          value: id,
          label: PLATFORMS[id].name.replace('Instagram ', '').replace('YouTube ', ''),
        }))}
      />
      {tooLong && (
        <p className="text-xs text-signal">
          This edit runs {Math.round(seconds)}s; {p.name} takes up to {p.maxSeconds / 60} minutes as a short. Pick a shorter length in
          Format.
        </p>
      )}
      {platform === 'shorts' && (
        <label className="block space-y-1">
          <span className="tag">Title</span>
          <div className="flex gap-1.5">
            <input className="field min-w-0 flex-1" value={kit.title} readOnly />
            <button
              className="btn btn-sm btn-sq"
              title="Copy the title"
              aria-label="Copy the title"
              onClick={() => void copyText(kit.title, 'Title')}
            >
              <Copy className="size-3.5" />
            </button>
          </div>
        </label>
      )}
      <div className="flex items-center gap-1.5">
        <Seg value={tone} onChange={setTone} options={TONES.map((t) => ({ value: t.id, label: t.name }))} className="flex-1" />
        <button
          className="btn btn-sm btn-sq"
          title="Different wording"
          aria-label="Different wording"
          onClick={() => setShuffle((n) => n + 1)}
        >
          <Shuffle className="size-3.5" />
        </button>
      </div>
      <textarea
        className="field min-h-24 w-full resize-y text-sm leading-snug"
        value={caption}
        onChange={(e) => setEdits({ key, caption: e.target.value, tags })}
        aria-label="Caption"
      />
      <div className="space-y-1.5">
        <div className="tag">
          Hashtags · {p.name} rewards {p.hashtags} or so
        </div>
        <ul className="flex flex-wrap gap-1">
          {[...new Set([...kit.hashtags, ...tags])].map((t) => {
            const on = tags.includes(t)
            return (
              <li key={t}>
                <button
                  className={cx('style-chip', on ? 'border-signal text-ink' : 'line-through opacity-60')}
                  aria-pressed={on}
                  onClick={() => setEdits({ key, caption, tags: on ? tags.filter((x) => x !== t) : [...tags, t] })}
                >
                  {on && <Check className="mr-0.5 inline size-2.5" />}#{t}
                </button>
              </li>
            )
          })}
          <li className="flex items-center">
            <form
              className="flex items-center"
              onSubmit={(e) => {
                e.preventDefault()
                const t = toHashtag(adding)
                if (t && !tags.includes(t)) setEdits({ key, caption, tags: [...tags, t] })
                setAdding('')
              }}
            >
              <input className="field w-24 py-0.5 text-xs" placeholder="#add" value={adding} onChange={(e) => setAdding(e.target.value)} />
              <button className="btn btn-bare btn-sm btn-sq" aria-label="Add hashtag" type="submit">
                <Plus className="size-3" />
              </button>
            </form>
          </li>
        </ul>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-1.5">
        <button className="slab text-lg" onClick={() => void post()}>
          Post to {p.name.replace('Instagram ', '').replace('YouTube ', '')} <ExternalLink className="size-4" />
        </button>
        <button
          className="btn btn-sq"
          title="Copy the caption and hashtags"
          aria-label="Copy the caption and hashtags"
          onClick={() => void copyText(text, 'Caption')}
        >
          <Copy className="size-3.5" />
        </button>
      </div>
      <p className="tag leading-snug">
        {desktop
          ? `Saves the video to Movies/AutoClip, shows it, copies the caption and opens ${p.name}: drag the video in and paste.`
          : `Downloads the video, copies the caption and opens ${p.name}: drop the video in and paste.`}
      </p>
    </div>
  )
}
