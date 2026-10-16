// Reading a reference edit, from the main thread: the picture is watched in a worker while the song
// analyser listens to the edit's own soundtrack, then the two are lined up.

import type { LearnWorkerRequest, LearnWorkerResponse } from '../../workers/learn.worker'
import { analyzeSongPcm } from '../analysis'
import { decodeAudioFile, toAnalysisPcm } from '../audio/decode'
import { ANALYSIS_RATE } from '../audio/features'
import { measureEdit, type EditMeasure } from './measure'
import type { WatchedEdit } from './watch'

let worker: Worker | null = null
let nextId = 1

function watch(file: File, onProgress: (f: number) => void): Promise<WatchedEdit> {
  worker ??= new Worker(new URL('../../workers/learn.worker.ts', import.meta.url), { type: 'module' })
  const w = worker
  const id = nextId++
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent<LearnWorkerResponse>) => {
      const msg = e.data
      if (msg.id !== id) return
      if (msg.type === 'progress') onProgress(msg.fraction)
      else {
        w.removeEventListener('message', onMessage)
        if (msg.type === 'done') resolve(msg.result)
        else reject(new Error(msg.message))
      }
    }
    w.addEventListener('message', onMessage)
    w.postMessage({ id, file } satisfies LearnWorkerRequest)
  })
}

async function listen(file: File, onProgress: (f: number) => void) {
  let buffer: AudioBuffer
  try {
    buffer = await decodeAudioFile(file)
  } catch {
    throw new Error('This edit has no sound AutoClip can read. It needs the music to learn the timing.')
  }
  const pcm = await toAnalysisPcm(buffer)
  return analyzeSongPcm(pcm, ANALYSIS_RATE, (f) => onProgress(f))
}

/** Watch and listen to one reference edit and measure it. Progress is 0–1 with a short stage name. */
export async function readReference(file: File, onProgress: (fraction: number, stage: string) => void): Promise<EditMeasure> {
  let seen = 0
  let heard = 0
  const report = () => onProgress(0.65 * seen + 0.35 * heard, seen < 1 ? 'Watching' : 'Listening')
  const [watched, song] = await Promise.all([
    watch(file, (f) => {
      seen = f
      report()
    }),
    listen(file, (f) => {
      heard = f
      report()
    }),
  ])
  if (song.confidence < 0.15 || !song.beats.length) throw new Error("Couldn't hear a steady beat in this edit's music.")
  if (watched.cuts.length < 3) throw new Error('This video has almost no cuts, so there is no editing style to learn.')
  return measureEdit(file.name.replace(/\.[^.]+$/, ''), watched, song)
}
