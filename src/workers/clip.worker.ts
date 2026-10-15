/// <reference lib="webworker" />
// Clip analysis off the main thread, so the UI stays smooth while footage is being watched.

import { analyzeImage, analyzeVideo, type ClipResult } from '../lib/video/analyzeClip'

declare const self: DedicatedWorkerGlobalScope

export type ClipWorkerRequest = { id: number; file: File; kind: 'video' | 'image' }
export type ClipWorkerResponse =
  | { id: number; type: 'progress'; fraction: number }
  | { id: number; type: 'done'; result: ClipResult }
  | { id: number; type: 'error'; message: string }

self.onmessage = async (e: MessageEvent<ClipWorkerRequest>) => {
  const { id, file, kind } = e.data
  const post = (msg: ClipWorkerResponse) => self.postMessage(msg)
  try {
    const result =
      kind === 'image' ? await analyzeImage(file) : await analyzeVideo(file, (fraction) => post({ id, type: 'progress', fraction }))
    post({ id, type: 'done', result })
  } catch (err) {
    post({ id, type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
