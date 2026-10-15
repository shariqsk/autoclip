// Everything the UI can ask for: bringing in media, making and remixing edits, drafts, hand edits
// with undo, captions and voiceover.

import { analyzeClipFile, analyzeSongPcm } from '../lib/analysis'
import { audioContext, bufferFromSamples, decodeAudioFile, toAnalysisPcm } from '../lib/audio/decode'
import { encodeWav } from '../lib/audio/wav'
import { beatWords, groupWords, parseCaptionFile, titleCard, toEditTime } from '../lib/captions/parse'
import { makePlan } from '../lib/edit/plan'
import { getStyle } from '../lib/edit/presets'
import { newSeed } from '../lib/edit/rng'
import { speak, toWhisperPcm, transcribe, type ModelStatus } from '../lib/ml/client'
import type { CaptionLine, Clip, EditPlan } from '../lib/types'
import { clearSaved } from './persist'
import { activeDraft, getState, setState, toast, updateClip, updateDraft, type AppState, type Draft } from './store'

const AUDIO_EXT = /\.(mp3|m4a|aac|wav|flac|ogg|oga|opus|weba)$/i
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv)$/i
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|heic)$/i
const CAPTION_EXT = /\.(srt|lrc|vtt)$/i

export function kindOf(file: File): 'audio' | 'video' | 'image' | 'captions' | null {
  if (file.type.startsWith('audio/') || AUDIO_EXT.test(file.name)) return 'audio'
  if (file.type.startsWith('video/') || VIDEO_EXT.test(file.name)) return 'video'
  if (file.type.startsWith('image/') || IMAGE_EXT.test(file.name)) return 'image'
  if (CAPTION_EXT.test(file.name)) return 'captions'
  return null
}

/** Route dropped files: the first audio file becomes the song, video and images become clips. */
export async function addFiles(files: File[]) {
  const audio = files.filter((f) => kindOf(f) === 'audio')
  const media = files.filter((f) => kindOf(f) === 'video' || kindOf(f) === 'image')
  const captions = files.filter((f) => kindOf(f) === 'captions')
  const unknown = files.filter((f) => !kindOf(f))
  if (unknown.length) toast(`Skipped ${unknown.map((f) => f.name).join(', ')}: not audio, video or an image.`, 'error')
  if (audio.length) void setSongFile(audio[0])
  if (audio.length > 1) toast('Using the first song. AutoClip cuts to one track at a time.')
  if (media.length) addClips(media)
  if (captions.length) await importCaptions(captions[0])
}

export async function setSongFile(file: File, preDecoded?: AudioBuffer) {
  setState({
    song: {
      name: file.name.replace(/\.[^.]+$/, ''),
      file,
      buffer: null,
      analysis: null,
      status: 'decoding',
      progress: 0,
      stage: 'Decoding',
    },
    words: null,
    windowOverride: null,
    dropOverride: null,
  })
  try {
    const buffer = preDecoded ?? (await decodeAudioFile(file))
    setState((s) => ({ song: s.song && { ...s.song, buffer, status: 'analyzing', stage: 'Listening' } }))
    const pcm = await toAnalysisPcm(buffer)
    const analysis = await analyzeSongPcm(pcm, 22050, (progress, stage) =>
      setState((s) => ({ song: s.song && { ...s.song, progress, stage } })),
    )
    setState((s) => ({ song: s.song && { ...s.song, analysis, status: 'ready', progress: 1, stage: 'Ready' } }))
    maybeAutoEdit()
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    setState((s) => ({ song: s.song && { ...s.song, status: 'error', error } }))
    toast(error, 'error')
  }
}

let clipCounter = 0
// Analysis runs a couple of clips at a time; the queue keeps the order the files were added in.
const queue: string[] = []
let running = 0
const MAX_PARALLEL = 2

export function addClips(files: File[]) {
  const clips: Clip[] = files.map((file) => ({
    id: `clip${Date.now().toString(36)}${(clipCounter++).toString(36)}`,
    name: file.name.replace(/\.[^.]+$/, ''),
    kind: kindOf(file) === 'image' ? 'image' : 'video',
    file,
    url: URL.createObjectURL(file),
    thumbs: [],
    analysis: null,
    status: 'queued',
    progress: 0,
  }))
  setState((s) => ({ clips: [...s.clips, ...clips] }))
  queue.push(...clips.map((c) => c.id))
  pump()
}

function pump() {
  while (running < MAX_PARALLEL && queue.length) {
    const id = queue.shift()!
    const clip = getState().clips.find((c) => c.id === id)
    if (!clip) continue
    running++
    updateClip(id, { status: 'analyzing' })
    analyzeClipFile(clip.file, clip.kind, (progress) => updateClip(id, { progress }))
      .then(({ analysis, thumbs }) =>
        updateClip(id, { analysis, thumbs: thumbs.map((b) => URL.createObjectURL(b)), status: 'ready', progress: 1 }),
      )
      .catch((err) => {
        const error = err instanceof Error ? err.message : String(err)
        updateClip(id, { status: 'error', error })
        toast(`${clip.name}: ${error}`, 'error')
      })
      .finally(() => {
        running--
        pump()
        maybeAutoEdit()
      })
  }
}

export function removeClip(id: string) {
  const clip = getState().clips.find((c) => c.id === id)
  if (clip) {
    URL.revokeObjectURL(clip.url)
    clip.thumbs.forEach((t) => URL.revokeObjectURL(t))
  }
  setState((s) => ({ clips: s.clips.filter((c) => c.id !== id) }))
}

export function pinClip(id: string, pin: Clip['pin']) {
  const clip = getState().clips.find((c) => c.id === id)
  updateClip(id, { pin: clip?.pin === pin ? undefined : pin })
}

export function moveClip(id: string, delta: number) {
  setState((s) => {
    const i = s.clips.findIndex((c) => c.id === id)
    const j = i + delta
    if (i < 0 || j < 0 || j >= s.clips.length) return {}
    const clips = [...s.clips]
    ;[clips[i], clips[j]] = [clips[j], clips[i]]
    return { clips }
  })
}

export function readyClips(): Clip[] {
  return getState().clips.filter((c) => c.status === 'ready' && c.analysis)
}

/** The first edit makes itself as soon as there's a song and footage, which is the whole point. */
function maybeAutoEdit() {
  const s = getState()
  if (s.drafts.length || s.song?.status !== 'ready') return
  if (s.clips.some((c) => c.status === 'queued' || c.status === 'analyzing')) return
  if (!readyClips().length) return
  makeEdit()
}

let draftCounter = 0

/**
 * Make a new draft. A remix keeps the active draft's locked shots and rolls a new seed. `recut`
 * (used when you change the style, length or order) replaces the active draft instead, unless
 * you've edited or starred it, so drafts only pile up when you mean them to.
 */
export function makeEdit(opts: { remix?: boolean; recut?: boolean } = {}) {
  const s = getState()
  const analysis = s.song?.analysis
  const clips = readyClips()
  if (!analysis) return toast('Add a song first.', 'error')
  // A drop set by hand replaces the detected ones nearby and becomes the strongest.
  const song =
    s.dropOverride === null
      ? analysis
      : {
          ...analysis,
          drops: [
            { time: s.dropOverride, strength: 1 },
            ...analysis.drops.filter((d) => Math.abs(d.time - s.dropOverride!) > 8).map((d) => ({ ...d, strength: d.strength * 0.8 })),
          ].sort((a, b) => a.time - b.time),
        }
  if (!clips.length) return toast('Add some clips first.', 'error')
  const current = activeDraft(s)
  const style = s.settings.style
  const plan = makePlan(
    song,
    clips.map((c) => ({ id: c.id, kind: c.kind, analysis: c.analysis!, pin: c.pin })),
    {
      style,
      length: s.settings.length,
      order: s.settings.order,
      variety: s.settings.variety,
      seed: newSeed(),
      window: s.windowOverride ?? undefined,
      locked: opts.remix && current && current.style === style ? current.plan.shots.filter((x) => x.locked) : undefined,
    },
  )
  if (opts.recut && current && !current.edited && !current.starred) {
    const name = current.name.replace(/^\S+/, getStyle(style).name)
    updateDraft(current.id, { plan, style, name, thumb: undefined, captionsOverride: undefined, past: [], future: [] })
    setState({ selectedShotId: null })
  } else {
    const n = ++draftCounter
    const draft: Draft = {
      id: `d${Date.now().toString(36)}${n}`,
      name: `${getStyle(style).name} #${n}`,
      style,
      plan,
      createdAt: Date.now(),
      past: [],
      future: [],
    }
    setState((st) => ({ drafts: [...st.drafts, draft], activeDraftId: draft.id, selectedShotId: null }))
  }
  if (s.settings.captions.source === 'auto') void runAutoCaptions()
  if (s.settings.voiceover.enabled) void generateVoice()
}

export function selectDraft(id: string) {
  setState({ activeDraftId: id, selectedShotId: null })
}

export function deleteDraft(id: string) {
  setState((s) => {
    const drafts = s.drafts.filter((d) => d.id !== id)
    const activeDraftId = s.activeDraftId === id ? (drafts.at(-1)?.id ?? null) : s.activeDraftId
    return { drafts, activeDraftId }
  })
}

export function duplicateDraft(id: string) {
  const d = getState().drafts.find((x) => x.id === id)
  if (!d) return
  const n = ++draftCounter
  const copy: Draft = {
    ...d,
    id: `d${Date.now().toString(36)}${n}`,
    name: `${d.name} copy`,
    createdAt: Date.now(),
    past: [],
    future: [],
    starred: false,
  }
  setState((s) => ({ drafts: [...s.drafts, copy], activeDraftId: copy.id }))
}

/** A hand edit to the active draft's plan, with undo. */
export function editPlan(fn: (plan: EditPlan) => EditPlan) {
  const d = activeDraft()
  if (!d) return
  const next = fn(d.plan)
  if (next === d.plan) return
  updateDraft(d.id, { plan: next, past: [...d.past, d.plan].slice(-60), future: [], edited: true })
}

export function undo() {
  const d = activeDraft()
  if (!d?.past.length) return
  updateDraft(d.id, { plan: d.past[d.past.length - 1], past: d.past.slice(0, -1), future: [d.plan, ...d.future] })
}

export function redo() {
  const d = activeDraft()
  if (!d?.future.length) return
  updateDraft(d.id, { plan: d.future[0], future: d.future.slice(1), past: [...d.past, d.plan] })
}

// ——— Captions ———

export async function importCaptions(file: File) {
  const text = await file.text()
  const lines = parseCaptionFile(file.name, text)
  if (!lines.length) return toast(`No captions found in ${file.name}.`, 'error')
  setState((s) => ({
    fileCaptions: lines,
    fileCaptionsName: file.name,
    settings: { ...s.settings, captions: { ...s.settings.captions, source: 'file' } },
  }))
  toast(`Loaded ${lines.length} caption lines from ${file.name}.`, 'success')
}

export const captionStatus = { current: null as ModelStatus | null, listeners: new Set<() => void>() }
function setCaptionStatus(s: ModelStatus | null) {
  captionStatus.current = s
  captionStatus.listeners.forEach((l) => l())
}

export async function runAutoCaptions() {
  const s = getState()
  const d = activeDraft(s)
  const buffer = s.song?.buffer
  if (!d || !buffer) return
  const key = `${s.settings.captions.model}:${d.plan.songStart.toFixed(2)}-${d.plan.songEnd.toFixed(2)}`
  if (s.words?.key === key) return
  try {
    setCaptionStatus({ phase: 'loading', fraction: null })
    const pcm = await toWhisperPcm(buffer, d.plan.songStart, d.plan.songEnd)
    const english = s.settings.captions.model.includes('.en')
    const words = await transcribe(pcm, s.settings.captions.model, english, setCaptionStatus)
    // Whisper's times are relative to the excerpt; store them in song time.
    setState({ words: { key, words: words.map((w) => ({ ...w, start: w.start + d.plan.songStart, end: w.end + d.plan.songStart })) } })
    if (!words.length) toast("Whisper didn't hear any words in this part of the song.")
  } catch (err) {
    toast(`Auto captions failed: ${err instanceof Error ? err.message : err}`, 'error')
  } finally {
    setCaptionStatus(null)
  }
}

/** Captions for a draft from the current settings (unless they were edited by hand). */
/** The parts of the app state captions are built from. */
export type CaptionInputs = Pick<AppState, 'settings' | 'words' | 'fileCaptions' | 'song'>

export function captionsFor(d: Draft, s: CaptionInputs = getState()): CaptionLine[] {
  if (d.captionsOverride) return d.captionsOverride
  const c = s.settings.captions
  const { songStart, songEnd } = d.plan
  const lines: CaptionLine[] = []
  if (c.source === 'auto' && s.words)
    lines.push(
      ...toEditTime(groupWords(s.words.words.filter((w) => w.start >= songStart - 0.5 && w.end <= songEnd + 0.5)), songStart, songEnd),
    )
  if (c.source === 'file' && s.fileCaptions) lines.push(...toEditTime(s.fileCaptions, songStart, songEnd))
  const song = s.song?.analysis
  if (c.source === 'text' && c.beatText.trim() && song) {
    // One word per beat, timed to finish right on the first drop (or start at the top if there isn't one).
    const words = c.beatText.trim().split(/\s+/)
    const beats = song.beats.map((b) => b.time).filter((t) => t >= songStart && t < songEnd)
    const drop = song.drops.find((x) => x.time > songStart && x.time < songEnd)?.time
    const dropIdx = drop ? beats.findIndex((b) => Math.abs(b - drop) < 0.05) : -1
    const startIdx = dropIdx >= 0 ? Math.max(0, dropIdx - words.length) : 0
    lines.push(...toEditTime(beatWords(c.beatText, beats, beats[startIdx] ?? songStart), songStart, songEnd))
  }
  if (c.title.trim()) {
    const first = song?.beats.find((b) => b.time >= songStart + 0.01)
    const end = Math.min(songEnd, (song?.drops.find((x) => x.time > songStart)?.time ?? songStart + 2.5) - 0.05, songStart + 3.5)
    lines.unshift(...toEditTime([titleCard(c.title.trim(), songStart, Math.max(first?.time ?? songStart + 1.5, end))], songStart, songEnd))
  }
  const plate = s.settings.nameplate
  const hero = d.plan.shots.find((x) => x.phase === 'hero')
  if (plate.name.trim() && hero) {
    lines.push({
      id: 'nameplate',
      start: hero.start + 0.05,
      end: Math.min(hero.end + 1.2, hero.start + 3),
      words: [{ text: plate.name.trim(), start: hero.start, end: hero.end }],
      nameplate: { sub: plate.sub.trim() },
    })
  }
  // A title card takes the screen on its own: hold other captions until it's gone.
  const title = lines.find((l) => l.title)
  return lines.filter((l) => l.title || l.nameplate || !title || l.start >= title.end - 0.01).sort((a, b) => a.start - b.start)
}

// ——— Voiceover ———

export const voiceStatus = { current: null as ModelStatus | null, listeners: new Set<() => void>() }
function setVoiceStatus(s: ModelStatus | null) {
  voiceStatus.current = s
  voiceStatus.listeners.forEach((l) => l())
}

export function voiceKey(s = getState()) {
  const v = s.settings.voiceover
  return `${v.voice}|${v.speed}|${v.text.trim()}`
}

export async function generateVoice() {
  const s = getState()
  const v = s.settings.voiceover
  if (!v.text.trim()) return
  const key = voiceKey(s)
  if (s.voice?.key === key) return
  try {
    setVoiceStatus({ phase: 'loading', fraction: null })
    const { audio, sampleRate } = await speak(v.text.trim(), v.voice, v.speed, setVoiceStatus)
    const buffer = new AudioBuffer({ length: audio.length, numberOfChannels: 1, sampleRate })
    buffer.copyToChannel(audio as Float32Array<ArrayBuffer>, 0)
    setState({ voice: { key, buffer } })
  } catch (err) {
    toast(`Voiceover failed: ${err instanceof Error ? err.message : err}`, 'error')
  } finally {
    setVoiceStatus(null)
  }
}

// ——— Demo ———

export async function loadDemo() {
  if (getState().demoLoading !== null) return
  setState({ demoLoading: 0 })
  try {
    const [{ synthesizeDemoSong }, { generateDemoClips }] = await Promise.all([import('../lib/demo/song'), import('../lib/demo/clips')])
    const rate = audioContext().sampleRate
    const song = synthesizeDemoSong(rate)
    const buffer = bufferFromSamples(song.samples, rate)
    const songFile = new File([encodeWav([song.samples], rate)], 'AutoClip demo beat.wav', { type: 'audio/wav' })
    void setSongFile(songFile, buffer)
    const files = await generateDemoClips((f) => setState({ demoLoading: f }))
    addClips(files)
  } catch (err) {
    toast(err instanceof Error ? err.message : String(err), 'error')
  } finally {
    setState({ demoLoading: null })
  }
}

/** Set (or clear) the drop by hand, in song seconds, and re-cut around it. */
export function setDrop(time: number | null) {
  setState({ dropOverride: time })
  if (getState().song?.analysis && readyClips().length) makeEdit({ recut: true })
}

export function resetProject() {
  void clearSaved()
  const s = getState()
  s.clips.forEach((c) => {
    URL.revokeObjectURL(c.url)
    c.thumbs.forEach((t) => URL.revokeObjectURL(t))
  })
  setState({
    song: null,
    clips: [],
    drafts: [],
    activeDraftId: null,
    words: null,
    fileCaptions: null,
    fileCaptionsName: null,
    selectedShotId: null,
  })
}

/** Hand-edit the active draft's captions. The first edit freezes the generated ones into the draft. */
export function editCaptions(fn: (lines: CaptionLine[]) => CaptionLine[]) {
  const d = activeDraft()
  if (!d) return
  updateDraft(d.id, { captionsOverride: fn(captionsFor(d)), edited: true })
}

export function resetCaptions() {
  const d = activeDraft()
  if (d) updateDraft(d.id, { captionsOverride: undefined })
}
