// Main-thread side of the face worker: one worker, one clip at a time.

import type { FacesWorkerRequest, FacesWorkerResponse } from '../../workers/faces.worker'
import type { ClipFaces } from '../types'

let worker: Worker | null = null
let nextId = 1

// A path, not a full URL: face-api only understands http(s) addresses and mangles app:// (the desktop
// app's) into app:/, so the worker resolves the path against its own origin instead.
const modelUrl = () => `${import.meta.env.BASE_URL}models/face/`

export function scanClipFaces(file: File, offset: number, duration: number, onProgress: (f: number) => void): Promise<ClipFaces> {
  worker ??= new Worker(new URL('../../workers/faces.worker.ts', import.meta.url), { type: 'module' })
  const w = worker
  const id = nextId++
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent<FacesWorkerResponse>) => {
      const msg = e.data
      if (msg.id !== id) return
      if (msg.type === 'progress') onProgress(msg.fraction)
      else {
        w.removeEventListener('message', onMessage)
        if (msg.type === 'done') resolve({ step: msg.step, sightings: msg.sightings })
        else reject(new Error(msg.message))
      }
    }
    w.addEventListener('message', onMessage)
    w.postMessage({ id, file, offset, duration, modelUrl: modelUrl() } satisfies FacesWorkerRequest)
  })
}
