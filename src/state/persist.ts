// Autosave. The whole project (the song and clip files themselves, their analyses, every take and the
// captions) is kept in the browser's IndexedDB, so closing the tab loses nothing. It never leaves the
// device. One project is kept; starting a new one replaces it.

import { decodeAudioFile } from '../lib/audio/decode'
import { setSongFile } from './actions'
import type { CaptionLine, CaptionWord, ClipAnalysis, ClipContent, ClipFaces, Person, SongAnalysis } from '../lib/types'
import { getState, setState, subscribe, type AppState, type Draft } from './store'

const DB = 'autoclip'
const STORE = 'project'
const KEY = 'current'

interface SavedClip {
  id: string
  name: string
  kind: 'video' | 'image'
  file: File
  analysis: ClipAnalysis
  thumbs: Blob[]
  pin?: 'hero' | 'skip'
  offset?: number
  momentOf?: string
}

export interface SavedProject {
  savedAt: number
  song: { name: string; file: File; analysis: SongAnalysis }
  clips: SavedClip[]
  drafts: Omit<Draft, 'past' | 'future'>[]
  activeDraftId: string | null
  windowOverride: AppState['windowOverride']
  dropOverride: number | null
  words: { key: string; words: CaptionWord[] } | null
  fileCaptions: CaptionLine[] | null
  fileCaptionsName: string | null
  /** Faces found and the people they make up (portraits as images). Absent in older projects. */
  faces?: Record<string, ClipFaces>
  people?: (Omit<Person, 'thumb'> & { thumb?: Blob })[]
  /** Shot types read from each clip. Absent in older projects. */
  content?: Record<string, ClipContent>
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function loadSaved(): Promise<SavedProject | null> {
  try {
    return ((await tx('readonly', (s) => s.get(KEY))) as SavedProject | undefined) ?? null
  } catch {
    return null
  }
}

export async function clearSaved() {
  try {
    await tx('readwrite', (s) => s.delete(KEY))
  } catch {
    /* nothing saved */
  }
}

async function snapshot(s: AppState): Promise<SavedProject | null> {
  if (!s.song?.file || !s.song.analysis) return null
  const ready = s.clips.filter((c) => c.status === 'ready' && c.analysis)
  const clips: SavedClip[] = await Promise.all(
    ready.map(async (c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      file: c.file,
      analysis: c.analysis!,
      thumbs: await Promise.all(c.thumbs.map(async (u) => (await fetch(u)).blob())),
      pin: c.pin,
      offset: c.offset,
      momentOf: c.momentOf,
    })),
  )
  return {
    savedAt: Date.now(),
    song: { name: s.song.name, file: s.song.file, analysis: s.song.analysis },
    clips,
    drafts: s.drafts.map(({ past: _past, future: _future, ...d }) => d),
    activeDraftId: s.activeDraftId,
    windowOverride: s.windowOverride,
    dropOverride: s.dropOverride,
    words: s.words,
    fileCaptions: s.fileCaptions,
    fileCaptionsName: s.fileCaptionsName,
    faces: Object.fromEntries(Object.entries(s.faces).filter(([id]) => ready.some((c) => c.id === id))),
    content: Object.fromEntries(Object.entries(s.content).filter(([id]) => ready.some((c) => c.id === id))),
    people: await Promise.all(
      s.people.map(async ({ thumb, ...p }) => ({
        ...p,
        thumb: thumb ? await (await fetch(thumb)).blob().catch(() => undefined) : undefined,
      })),
    ),
  }
}

let timer: ReturnType<typeof setTimeout> | null = null
let last: Pick<
  AppState,
  'song' | 'clips' | 'drafts' | 'activeDraftId' | 'words' | 'fileCaptions' | 'dropOverride' | 'faces' | 'people' | 'content'
> | null = null

/** Save shortly after anything worth saving changes, once nothing is still being analyzed. */
export function startAutosave() {
  return subscribe(() => {
    const s = getState()
    const changed =
      !last ||
      s.song !== last.song ||
      s.clips !== last.clips ||
      s.drafts !== last.drafts ||
      s.activeDraftId !== last.activeDraftId ||
      s.words !== last.words ||
      s.fileCaptions !== last.fileCaptions ||
      s.dropOverride !== last.dropOverride ||
      s.faces !== last.faces ||
      s.people !== last.people ||
      s.content !== last.content
    if (!changed) return
    last = s
    if (s.song?.status !== 'ready' || s.clips.some((c) => c.status === 'queued' || c.status === 'analyzing')) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(async () => {
      const snap = await snapshot(getState())
      if (snap) await tx('readwrite', (st) => st.put(snap, KEY)).catch(() => {})
    }, 800)
  })
}

/** Bring a saved project back, without analyzing anything again. */
export async function restore(p: SavedProject) {
  const buffer = await decodeAudioFile(p.song.file)
  // Projects saved before hit detection existed: listen to the song again so cuts can land on hits.
  if (!p.song.analysis.hits) {
    void setSongFile(p.song.file, buffer)
  }
  setState({
    song: { name: p.song.name, file: p.song.file, buffer, analysis: p.song.analysis, status: 'ready', progress: 1, stage: 'Ready' },
    clips: p.clips.map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      file: c.file,
      url: URL.createObjectURL(c.file),
      thumbs: c.thumbs.map((b) => URL.createObjectURL(b)),
      analysis: c.analysis,
      status: 'ready',
      progress: 1,
      pin: c.pin,
      offset: c.offset,
      momentOf: c.momentOf,
    })),
    drafts: p.drafts.map((d) => ({ ...d, past: [], future: [] })),
    activeDraftId: p.activeDraftId ?? p.drafts.at(-1)?.id ?? null,
    windowOverride: p.windowOverride,
    dropOverride: p.dropOverride,
    faces: p.faces ?? {},
    content: p.content ?? {},
    people: (p.people ?? []).map(({ thumb, ...person }) => ({
      ...person,
      centroids: person.centroids ?? [],
      thumb: thumb ? URL.createObjectURL(thumb) : undefined,
    })),
    words: p.words,
    fileCaptions: p.fileCaptions,
    fileCaptionsName: p.fileCaptionsName,
  })
}
