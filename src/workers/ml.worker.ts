/// <reference lib="webworker" />
// Whisper on your device via transformers.js: turns the song's vocals (or any speech in the
// soundtrack) into word-timed captions. Models download once and are cached by the browser.

import { pipeline, type ProgressInfo } from '@huggingface/transformers'

declare const self: DedicatedWorkerGlobalScope

export type MlRequest = { id: number; type: 'transcribe'; audio: Float32Array; model: string; english: boolean }
export type MlResponse =
  | { id: number; type: 'loading'; fraction: number | null }
  | { id: number; type: 'working' }
  | { id: number; type: 'done'; words: { text: string; start: number; end: number }[] }
  | { id: number; type: 'error'; message: string }

const post = (m: MlResponse) => self.postMessage(m)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let asr: { model: string; instance: Promise<any> } | null = null

async function device(): Promise<'webgpu' | 'wasm'> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<object | null> } }).gpu
  try {
    if (await gpu?.requestAdapter()) return 'webgpu'
  } catch {
    /* fall back to WASM */
  }
  return 'wasm'
}

self.onmessage = async (e: MessageEvent<MlRequest>) => {
  const { id, audio, model, english } = e.data
  try {
    if (asr?.model !== model) {
      const dev = await device()
      asr = {
        model,
        instance: pipeline('automatic-speech-recognition', model, {
          device: dev,
          dtype: { encoder_model: dev === 'webgpu' ? 'fp32' : 'q8', decoder_model_merged: 'q8' },
          progress_callback: (info: ProgressInfo) => {
            if (info.status === 'progress_total') post({ id, type: 'loading', fraction: info.total ? info.loaded / info.total : null })
          },
        }),
      }
      asr.instance.catch(() => (asr = null))
    }
    const transcriber = await asr.instance
    post({ id, type: 'working' })
    const out = await transcriber(audio, {
      return_timestamps: 'word',
      chunk_length_s: 30,
      stride_length_s: 5,
      ...(english ? {} : { task: 'transcribe' }),
    })
    const result = Array.isArray(out) ? out[0] : out
    const chunks: { text: string; timestamp: [number, number | null] }[] = result.chunks ?? []
    const words = chunks
      .map((c) => ({ text: c.text.trim(), start: c.timestamp[0], end: c.timestamp[1] ?? c.timestamp[0] + 0.3 }))
      // Whisper's stock hallucinations on instrumentals and silence.
      .filter((w) => w.text && !/^\[.*\]$|^\(.*\)$|^♪+$/.test(w.text))
    post({ id, type: 'done', words })
  } catch (err) {
    post({ id, type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
