// Client side of the analysis workers: a small pool for clips (two at a time keeps hardware decoders
// busy without starving the UI) and one worker for songs.

import type { ClipWorkerRequest, ClipWorkerResponse } from '../workers/clip.worker'
import type { SongWorkerRequest, SongWorkerResponse } from '../workers/song.worker'
import type { ClipResult } from './video/analyzeClip'
import type { SongAnalysis } from './types'

let nextId = 1

const CLIP_WORKERS = 2
const clipWorkers: Worker[] = []
let rr = 0

function clipWorker(): Worker {
  if (clipWorkers.length < CLIP_WORKERS) {
    const w = new Worker(new URL('../workers/clip.worker.ts', import.meta.url), { type: 'module' })
    clipWorkers.push(w)
    return w
  }
  return clipWorkers[rr++ % clipWorkers.length]
}

export function analyzeClipFile(file: File, kind: 'video' | 'image', onProgress: (f: number) => void): Promise<ClipResult> {
  const id = nextId++
  const worker = clipWorker()
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent<ClipWorkerResponse>) => {
      const msg = e.data
      if (msg.id !== id) return
      if (msg.type === 'progress') onProgress(msg.fraction)
      else {
        worker.removeEventListener('message', onMessage)
        if (msg.type === 'done') resolve(msg.result)
        else reject(new Error(msg.message))
      }
    }
    worker.addEventListener('message', onMessage)
    worker.postMessage({ id, file, kind } satisfies ClipWorkerRequest)
  })
}

let songWorker: Worker | null = null

export function analyzeSongPcm(
  samples: Float32Array,
  sampleRate: number,
  onProgress: (f: number, stage: string) => void,
): Promise<SongAnalysis> {
  songWorker ??= new Worker(new URL('../workers/song.worker.ts', import.meta.url), { type: 'module' })
  const worker = songWorker
  const id = nextId++
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent<SongWorkerResponse>) => {
      const msg = e.data
      if (msg.id !== id) return
      if (msg.type === 'progress') onProgress(msg.fraction, msg.stage)
      else {
        worker.removeEventListener('message', onMessage)
        if (msg.type === 'done') resolve(msg.analysis)
        else reject(new Error(msg.message))
      }
    }
    worker.addEventListener('message', onMessage)
    worker.postMessage({ id, samples, sampleRate } satisfies SongWorkerRequest)
  })
}
