/// <reference lib="webworker" />
// Song analysis off the main thread.

import { analyzeSong } from '../lib/audio/analyze'
import type { SongAnalysis } from '../lib/types'

declare const self: DedicatedWorkerGlobalScope

export type SongWorkerRequest = { id: number; samples: Float32Array; sampleRate: number }
export type SongWorkerResponse =
  | { id: number; type: 'progress'; fraction: number; stage: string }
  | { id: number; type: 'done'; analysis: SongAnalysis }
  | { id: number; type: 'error'; message: string }

self.onmessage = (e: MessageEvent<SongWorkerRequest>) => {
  const { id, samples, sampleRate } = e.data
  const post = (msg: SongWorkerResponse) => self.postMessage(msg)
  try {
    const analysis = analyzeSong(samples, { sampleRate, onProgress: (fraction, stage) => post({ id, type: 'progress', fraction, stage }) })
    post({ id, type: 'done', analysis })
  } catch (err) {
    post({ id, type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
