/// <reference lib="webworker" />
// Watching reference edits off the main thread.

import { watchEdit, type WatchedEdit } from '../lib/learn/watch'

declare const self: DedicatedWorkerGlobalScope

export type LearnWorkerRequest = { id: number; file: File }
export type LearnWorkerResponse =
  | { id: number; type: 'progress'; fraction: number }
  | { id: number; type: 'done'; result: WatchedEdit }
  | { id: number; type: 'error'; message: string }

self.onmessage = async (e: MessageEvent<LearnWorkerRequest>) => {
  const { id, file } = e.data
  const post = (msg: LearnWorkerResponse) => self.postMessage(msg)
  try {
    post({ id, type: 'done', result: await watchEdit(file, (fraction) => post({ id, type: 'progress', fraction })) })
  } catch (err) {
    post({ id, type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
