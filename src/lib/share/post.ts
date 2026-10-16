// Getting an edit posted: what each platform wants (length, shape, how many hashtags it rewards),
// and the words to post it with: captions in a few tones, hashtags drawn from who and what the edit
// is about, and a title for YouTube. All written here from the edit itself, no account or service.

import type { StyleGroup, StylePreset } from '../edit/presets'

export type Platform = 'tiktok' | 'reels' | 'shorts'

export const PLATFORMS: Record<
  Platform,
  {
    name: string
    /** Longest it takes as a short-form video, in seconds. */
    maxSeconds: number
    /** Hashtags that help; past this they read as spam. */
    hashtags: number
    /** Where to upload by hand. */
    uploadUrl: string
    /** Always included. */
    staple: string[]
  }
> = {
  tiktok: { name: 'TikTok', maxSeconds: 600, hashtags: 5, uploadUrl: 'https://www.tiktok.com/upload', staple: ['fyp'] },
  reels: { name: 'Instagram Reels', maxSeconds: 180, hashtags: 5, uploadUrl: 'https://www.instagram.com/', staple: ['reels'] },
  shorts: { name: 'YouTube Shorts', maxSeconds: 180, hashtags: 3, uploadUrl: 'https://www.youtube.com/upload', staple: ['shorts'] },
}

export interface PostInput {
  platform: Platform
  /** Who the edit is about: starred people's names, or the nameplate. */
  subjects: string[]
  /** The title card, if there is one. */
  title: string
  /** The song as named ("Artist - Title" when known). */
  song: string
  style: Pick<StylePreset, 'id' | 'name' | 'group'>
  /** Picks between equally good wordings; the same seed gives the same words. */
  seed: number
}

export type Tone = 'hype' | 'story' | 'minimal' | 'ask'

export const TONES: { id: Tone; name: string }[] = [
  { id: 'hype', name: 'Hype' },
  { id: 'story', name: 'Story' },
  { id: 'minimal', name: 'Minimal' },
  { id: 'ask', name: 'Ask' },
]

export interface PostKit {
  captions: Record<Tone, string>
  hashtags: string[]
  /** For YouTube (up to 100 characters). */
  title: string
}

/** "Wallows - Bad Dream" → artist and track; anything else is just a track name. */
export function splitSong(song: string): { artist: string | null; track: string } {
  const clean = song.replace(/\.(mp3|m4a|wav|flac|ogg|aac|mp4)$/i, '').replace(/\s*[([](official.*?|lyrics?|audio|video)[)\]]/gi, '')
  const m = clean.match(/^(.+?)\s+[-–—]\s+(.+)$/)
  return m ? { artist: m[1].trim(), track: m[2].trim() } : { artist: null, track: clean.trim() }
}

/** A hashtag from any words: letters and digits only (in any script), lower case, no spaces. */
export function toHashtag(words: string): string | null {
  const tag = words
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
  return tag.length >= 2 && tag.length <= 30 ? tag : null
}

const STYLE_TAGS: Record<string, string[]> = {
  hype: ['edit', 'highlights'],
  rush: ['edit', 'highlights'],
  phonk: ['phonk', 'phonkedit'],
  velocity: ['edit', 'velocity'],
  cinematic: ['cinematic', 'edit'],
  lyric: ['lyricedit', 'edit'],
  spotlight: ['edit', 'cinematic'],
  smooth: ['vlog', 'edit'],
  throwback: ['throwback', 'memories'],
}
const GROUP_TAGS: Record<StyleGroup, string[]> = { hype: ['edit'], cinematic: ['cinematic'], chill: ['vlog'], mine: ['edit'] }

/** The most useful tags first: the platform's own, who it's about, then the kind of edit and the song. */
export function hashtagsFor(input: PostInput): string[] {
  const p = PLATFORMS[input.platform]
  const { artist } = splitSong(input.song)
  const titleTag = input.title.trim().split(/\s+/).length <= 3 ? toHashtag(input.title) : null
  const ordered = [
    ...(input.platform === 'shorts' ? p.staple : []),
    ...input.subjects.map(toHashtag),
    ...(STYLE_TAGS[input.style.id] ?? GROUP_TAGS[input.style.group ?? 'mine']).slice(0, 1),
    titleTag,
    artist ? toHashtag(artist) : null,
    ...(STYLE_TAGS[input.style.id] ?? []).slice(1),
    ...(input.platform === 'shorts' ? [] : p.staple),
  ]
  const out: string[] = []
  for (const t of ordered) if (t && !out.includes(t)) out.push(t)
  return out.slice(0, p.hashtags)
}

const pick = <T>(xs: T[], seed: number, salt: number) => xs[Math.abs(Math.floor(seed * 7 + salt * 13)) % xs.length]

export function captionsFor(input: PostInput): Record<Tone, string> {
  const who = input.subjects.length ? input.subjects.slice(0, 2).join(' & ') : input.title.trim() || null
  const { artist, track } = splitSong(input.song)
  const credit = artist ? `🎵 ${artist} - ${track}` : track ? `🎵 ${track}` : ''
  const s = input.seed
  const hype = who
    ? pick([`${who} hits different 🔥`, `${who}. That's it. That's the edit.`, `They're not ready for ${who} ⚡`], s, 1)
    : pick(['This one hits different 🔥', 'Turn the sound up 🔊', 'Watch it twice ⚡'], s, 1)
  const story = who
    ? pick(
        [`Every moment that made ${who}.`, `${who}: the build-up, the moment, the aftermath.`, `How it went for ${who}, start to finish.`],
        s,
        2,
      )
    : pick(['The build-up, the moment, the aftermath.', 'How it all went down, start to finish.'], s, 2)
  const minimal = who ?? (track || input.style.name)
  const ask = who
    ? pick([`Rate this ${who} edit 1–10 👇`, `Best moment of ${who}? 👇`, `Who should I edit after ${who}? 👇`], s, 3)
    : pick(['Rate this edit 1–10 👇', 'What should I edit next? 👇', 'Best moment? 👇'], s, 3)
  const withCredit = (text: string) => (credit ? `${text}\n\n${credit}` : text)
  return { hype: withCredit(hype), story: withCredit(story), minimal, ask: withCredit(ask) }
}

/** A YouTube title: the subject and a hook, with #shorts, within YouTube's 100 characters. */
export function titleFor(input: PostInput): string {
  const who = input.subjects.slice(0, 2).join(' & ') || input.title.trim() || splitSong(input.song).track || 'Edit'
  const hook = pick(['🔥', 'edit', 'edit 🔥', '⚡'], input.seed, 4)
  const tail = input.platform === 'shorts' ? ' #shorts' : ''
  return `${who} ${hook}`.slice(0, 100 - tail.length).trim() + tail
}

export function postKit(input: PostInput): PostKit {
  return { captions: captionsFor(input), hashtags: hashtagsFor(input), title: titleFor(input) }
}

/** The text to paste: the caption, then the hashtags. */
export function postText(caption: string, hashtags: string[]): string {
  const tags = hashtags.map((t) => `#${t}`).join(' ')
  return tags ? `${caption}\n\n${tags}` : caption
}
