/// <reference lib="webworker" />
// Finding faces off the main thread.

import { scanFaces } from '../lib/people/scan'
import type { FaceSighting } from '../lib/types'

declare const self: DedicatedWorkerGlobalScope

export type FacesWorkerRequest = { id: number; file: File; offset: number; duration: number; modelUrl: string }
export type FacesWorkerResponse =
  | { id: number; type: 'progress'; fraction: number }
  | { id: number; type: 'done'; step: number; sightings: FaceSighting[] }
  | { id: number; type: 'error'; message: string }

self.onmessage = async (e: MessageEvent<FacesWorkerRequest>) => {
  const { id, file, offset, duration, modelUrl } = e.data
  const post = (msg: FacesWorkerResponse) => self.postMessage(msg)
  try {
    const r = await scanFaces(file, { offset, duration, modelUrl }, (fraction) => post({ id, type: 'progress', fraction }))
    post({ id, type: 'done', ...r })
  } catch (err) {
    post({ id, type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
