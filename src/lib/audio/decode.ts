// Decode a song with the browser's own decoder (MP3, AAC/M4A, WAV, FLAC, OGG, and the audio track
// of most videos), keep it at full quality for playback and export, and make a 22 kHz mono copy for
// analysis.

import { ANALYSIS_RATE } from './features'

let ctx: AudioContext | null = null
export function audioContext(): AudioContext {
  ctx ??= new AudioContext({ latencyHint: 'interactive' })
  return ctx
}

export async function decodeAudioFile(file: Blob): Promise<AudioBuffer> {
  const bytes = await file.arrayBuffer()
  try {
    return await audioContext().decodeAudioData(bytes)
  } catch {
    throw new Error("Couldn't read that audio. Try an MP3, M4A, WAV or FLAC file.")
  }
}

/** Mono, resampled for analysis. */
export async function toAnalysisPcm(buffer: AudioBuffer): Promise<Float32Array> {
  const length = Math.ceil(buffer.duration * ANALYSIS_RATE)
  const offline = new OfflineAudioContext(1, length, ANALYSIS_RATE)
  const src = offline.createBufferSource()
  src.buffer = buffer
  src.connect(offline.destination)
  src.start()
  const rendered = await offline.startRendering()
  return rendered.getChannelData(0)
}

export function bufferFromSamples(samples: Float32Array, sampleRate: number): AudioBuffer {
  const buffer = new AudioBuffer({ length: samples.length, numberOfChannels: 2, sampleRate })
  buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0)
  buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 1)
  return buffer
}
