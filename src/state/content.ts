// The content mix: read what kind of shot each moment of the footage is (big moments, action,
// b-roll, celebrations, talking, text) and use as much of each as you ask for.

import { contentSeries, smoothByScene } from '../lib/content/classify'
import { scanClipContent } from '../lib/content/client'
import type { Clip, ClipAnalysis, ContentKind } from '../lib/types'
import { makeEdit } from './actions'
import { getState, setState, toast, updateSettings } from './store'
import type { Settings } from './settings'

/** Clips that can be read for shot types and haven't been yet. */
export function unreadClips(s = getState()): Clip[] {
  return s.clips.filter((c) => c.status === 'ready' && c.kind === 'video' && c.analysis && !s.content[c.id])
}

let reading = false

/** Read the shot types of every clip not read yet, then re-cut so the mix takes effect. */
export async function readFootage() {
  if (reading) return
  const todo = unreadClips()
  if (!todo.length) return
  reading = true
  setState({ contentScan: { done: 0, total: todo.length, fraction: 0, stage: 'scan' } })
  let failed = 0
  let lastError = ''
  try {
    for (const [i, clip] of todo.entries()) {
      try {
        const content = await scanClipContent(clip.file, clip.offset ?? 0, clip.analysis!.duration, (f, stage) =>
          setState({
            contentScan: { done: i, total: todo.length, fraction: stage === 'download' ? f : (i + f) / todo.length, stage },
          }),
        )
        setState((s) => ({ content: { ...s.content, [clip.id]: smoothByScene(content, clip.analysis!.cuts) } }))
      } catch (err) {
        failed++
        lastError = err instanceof Error ? err.message : String(err)
      }
    }
    if (failed)
      toast(`Couldn't read ${failed === todo.length ? 'the footage' : `${failed} of ${todo.length} clips`}: ${lastError}`, 'error')
    recut()
  } finally {
    reading = false
    setState({ contentScan: null })
  }
}

function recut() {
  const s = getState()
  if (s.song?.analysis && s.drafts.length && s.clips.some((c) => c.status === 'ready')) makeEdit({ recut: true })
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
