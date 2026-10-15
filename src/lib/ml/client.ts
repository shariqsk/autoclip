// Main-thread side of the ML workers. Each worker is created on first use, so visitors who never
// turn on auto-captions or voiceover never download a model.

import type { MlRequest, MlResponse } from '../../workers/ml.worker'
import type { TtsRequest, TtsResponse } from '../../workers/tts.worker'
import type { CaptionWord } from '../types'

export type ModelStatus = { phase: 'loading'; fraction: number | null } | { phase: 'working' }

let nextId = 1
let ml: Worker | null = null
let tts: Worker | null = null

function call<Req extends { id: number }, Res extends { id: number; type: string }, Out>(
  worker: Worker,
  req: Omit<Req, 'id'>,
  onStatus: (s: ModelStatus) => void,
  done: (res: Res) => Out | undefined,
  transfer: Transferable[] = [],
): Promise<Out> {
  const id = nextId++
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent<Res & { fraction?: number | null; message?: string }>) => {
      const msg = e.data
      if (msg.id !== id) return
      if (msg.type === 'loading') onStatus({ phase: 'loading', fraction: msg.fraction ?? null })
      else if (msg.type === 'working') onStatus({ phase: 'working' })
      else {
        worker.removeEventListener('message', onMessage)
        if (msg.type === 'error') reject(new Error(msg.message))
        else resolve(done(msg) as Out)
      }
    }
    worker.addEventListener('message', onMessage)
    worker.postMessage({ ...req, id }, transfer)
  })
}

/** Transcribe 16 kHz mono audio into timed words. */
export function transcribe(
  audio: Float32Array,
  model: string,
  english: boolean,
  onStatus: (s: ModelStatus) => void,
): Promise<CaptionWord[]> {
  ml ??= new Worker(new URL('../../workers/ml.worker.ts', import.meta.url), { type: 'module' })
  return call<MlRequest, MlResponse, CaptionWord[]>(ml, { type: 'transcribe', audio, model, english }, onStatus, (res) =>
    res.type === 'done' ? res.words : undefined,
  )
}

/** Speak a line with a Kokoro voice. */
export function speak(
  text: string,
  voice: string,
  speed: number,
  onStatus: (s: ModelStatus) => void,
): Promise<{ audio: Float32Array; sampleRate: number }> {
  tts ??= new Worker(new URL('../../workers/tts.worker.ts', import.meta.url), { type: 'module' })
  return call<TtsRequest, TtsResponse, { audio: Float32Array; sampleRate: number }>(tts, { text, voice, speed }, onStatus, (res) =>
    res.type === 'done' ? { audio: res.audio, sampleRate: res.sampleRate } : undefined,
  )
}

/** Resample any AudioBuffer section to 16 kHz mono for Whisper. */
export async function toWhisperPcm(buffer: AudioBuffer, start: number, end: number): Promise<Float32Array> {
  const rate = 16000
  const length = Math.ceil((end - start) * rate)
  const ctx = new OfflineAudioContext(1, length, rate)
  const src = ctx.createBufferSource()
  src.buffer = buffer
  // Lift the vocal band a little; Whisper hears singers better over a loud mix.
  const eq = ctx.createBiquadFilter()
  eq.type = 'peaking'
  eq.frequency.value = 2000
  eq.Q.value = 0.7
  eq.gain.value = 4
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 120
  src.connect(hp).connect(eq).connect(ctx.destination)
  src.start(0, start, end - start)
  const out = await ctx.startRendering()
  return out.getChannelData(0)
}
