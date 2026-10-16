/// <reference lib="webworker" />
// Reading shot types off the main thread.

import { scanContent } from '../lib/content/scan'
import type { ClipContent } from '../lib/types'

declare const self: DedicatedWorkerGlobalScope

export type ContentWorkerRequest = { id: number; file: File; offset: number; duration: number }
export type ContentWorkerResponse =
  | { id: number; type: 'progress'; fraction: number; stage: 'download' | 'scan' }
  | { id: number; type: 'done'; content: ClipContent }
  | { id: number; type: 'error'; message: string }

self.onmessage = async (e: MessageEvent<ContentWorkerRequest>) => {
  const { id, file, offset, duration } = e.data
  const post = (msg: ContentWorkerResponse) => self.postMessage(msg)
  try {
    const content = await scanContent(file, { offset, duration }, (fraction, stage) => post({ id, type: 'progress', fraction, stage }))
    post({ id, type: 'done', content })
  } catch (err) {
    post({ id, type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
