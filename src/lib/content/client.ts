// Main-thread side of the shot-type worker: one worker, one clip at a time.

import type { ContentWorkerRequest, ContentWorkerResponse } from '../../workers/content.worker'
import type { ClipContent } from '../types'

let worker: Worker | null = null
let nextId = 1

export function scanClipContent(
  file: File,
  offset: number,
  duration: number,
  onProgress: (fraction: number, stage: 'download' | 'scan') => void,
): Promise<ClipContent> {
  worker ??= new Worker(new URL('../../workers/content.worker.ts', import.meta.url), { type: 'module' })
  const w = worker
  const id = nextId++
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent<ContentWorkerResponse>) => {
      const msg = e.data
      if (msg.id !== id) return
      if (msg.type === 'progress') onProgress(msg.fraction, msg.stage)
      else {
        w.removeEventListener('message', onMessage)
        if (msg.type === 'done') resolve(msg.content)
        else reject(new Error(msg.message))
      }
    }
    w.addEventListener('message', onMessage)
    w.postMessage({ id, file, offset, duration } satisfies ContentWorkerRequest)
  })
}
