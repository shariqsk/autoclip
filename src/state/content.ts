// The content mix: read what kind of shot each moment of the footage is (big moments, action,
// b-roll, celebrations, talking, text) and use as much of each as you ask for.

import { contentSeries, smoothByScene } from '../lib/content/classify'
import { scanClipContent } from '../lib/content/client'
import type { Clip, ClipAnalysis, ContentKind } from '../lib/types'
import { recut } from './actions'
import { getState, setState, toast, updateSettings } from './store'
import type { Settings } from './settings'

/** Clips that can be read for shot types and haven't been yet. */
export function unreadClips(s = getState()): Clip[] {
  return s.clips.filter((c) => c.status === 'ready' && c.kind === 'video' && c.analysis && !s.content[c.id])
}

let reading = false

/** Once you've had your footage read, new clips are read as they come in, so the mix keeps up with the bin. */
export function readNewClips() {
  const s = getState()
  if (Object.keys(s.content).length && unreadClips(s).length) return readFootage()
}

/** Read the shot types of every clip not read yet (those added meanwhile too), then re-cut so the mix takes effect. */
export async function readFootage() {
  if (reading) return
  reading = true
  const tried = new Set<string>()
  let failed = 0
  let lastError = ''
  try {
    for (let todo = unreadClips(); todo.length; todo = unreadClips().filter((c) => !tried.has(c.id))) {
      for (const [i, clip] of todo.entries()) {
        tried.add(clip.id)
        const { duration, cuts } = clip.analysis!
        const progress = (fraction: number, stage: 'download' | 'scan') =>
          setState({ contentScan: { done: i, total: todo.length, fraction, stage, clip: clip.name } })
        progress(i / todo.length, 'scan')
        try {
          const content = await scanClipContent(clip.file, clip.offset ?? 0, duration, cuts, (f, stage) =>
            progress(stage === 'download' ? f : (i + f) / todo.length, stage),
          )
          setState((s) => ({ content: { ...s.content, [clip.id]: smoothByScene(content, cuts) } }))
        } catch (err) {
          failed++
          lastError = err instanceof Error ? err.message : String(err)
        }
      }
    }
    if (failed) toast(`Couldn't read ${failed === tried.size ? 'the footage' : `${failed} of ${tried.size} clips`}: ${lastError}`, 'error')
    if (failed < tried.size) recut()
  } finally {
    reading = false
    setState({ contentScan: null })
  }
}

/** Change the mix; reads any footage not read yet (the mix needs it), then re-cuts. */
export function setMix(mix: Settings['mix']) {
  updateSettings({ mix })
  if (unreadClips().length) void readFootage()
  else recut()
}

export function setMixAmount(kind: ContentKind, amount: Settings['mix'][ContentKind]) {
  setMix({ ...getState().settings.mix, [kind]: amount })
}

/** A clip's shot-type odds at each of its analysis samples, for planning. */
export function clipContent(clip: Pick<Clip, 'id'> & { analysis: ClipAnalysis }) {
  return contentSeries(clip.analysis, getState().content[clip.id]) ?? undefined
}
