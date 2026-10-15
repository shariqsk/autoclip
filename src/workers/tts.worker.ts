/// <reference lib="webworker" />
// Kokoro text-to-speech on your device (via kokoro-js): intro lines, hype-man callouts and
// narration for the edit. The model downloads once (~90 MB) and is cached by the browser.

import { KokoroTTS } from 'kokoro-js'

declare const self: DedicatedWorkerGlobalScope

export type TtsRequest = { id: number; text: string; voice: string; speed: number }
export type TtsResponse =
  | { id: number; type: 'loading'; fraction: number | null }
  | { id: number; type: 'working' }
  | { id: number; type: 'done'; audio: Float32Array; sampleRate: number }
  | { id: number; type: 'error'; message: string }

const post = (m: TtsResponse, transfer: Transferable[] = []) => self.postMessage(m, transfer)
const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX'
let tts: Promise<KokoroTTS> | null = null

self.onmessage = async (e: MessageEvent<TtsRequest>) => {
  const { id, text, voice, speed } = e.data
  try {
    tts ??= KokoroTTS.from_pretrained(MODEL, {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: (info: { status: string; loaded?: number; total?: number }) => {
        if (info.status === 'progress_total' || info.status === 'progress')
          post({ id, type: 'loading', fraction: info.total ? (info.loaded ?? 0) / info.total : null })
      },
    })
    tts.catch(() => (tts = null))
    const model = await tts
    post({ id, type: 'working' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await model.generate(text, { voice: voice as any, speed })
    const audio = raw.audio as Float32Array
    post({ id, type: 'done', audio, sampleRate: raw.sampling_rate }, [audio.buffer])
  } catch (err) {
    post({ id, type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
