// Watch (and listen to) one clip: decode small frames a few times a second with WebCodecs via
// Mediabunny, measure motion, detail, brightness and the soundtrack's loudness, find cuts inside the
// clip, and grab poster frames. Runs in a worker.

import { ALL_FORMATS, AudioBufferSink, BlobSource, CanvasSink, Input } from 'mediabunny'
import type { ClipAnalysis } from '../types'
import {
  brightness,
  detectCuts,
  interestScore,
  motion,
  sharpness,
  signature,
  signatureDistance,
  smoothSeries,
  toGray,
  type Gray,
} from './metrics'

export interface ClipResult {
  analysis: ClipAnalysis
  thumbs: Blob[]
}

const SAMPLE_WIDTH = 96
const MAX_SAMPLES = 900
const THUMB_COUNT = 4

// Frames from the decoder are copied into one small canvas made for frequent reads.
let scratch: OffscreenCanvas | null = null
let scratchCtx: OffscreenCanvasRenderingContext2D | null = null

function readGray(canvas: OffscreenCanvas | HTMLCanvasElement): Gray {
  if (!scratch || scratch.width !== canvas.width || scratch.height !== canvas.height) {
    scratch = new OffscreenCanvas(canvas.width, canvas.height)
    scratchCtx = scratch.getContext('2d', { willReadFrequently: true })!
  }
  scratchCtx!.drawImage(canvas, 0, 0)
  const img = scratchCtx!.getImageData(0, 0, canvas.width, canvas.height)
  return toGray(img.data, canvas.width, canvas.height)
}

async function toBlob(canvas: OffscreenCanvas | HTMLCanvasElement): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 })
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('thumbnail failed'))), 'image/jpeg', 0.8))
}

export async function analyzeImage(file: Blob): Promise<ClipResult> {
  const bmp = await createImageBitmap(file)
  const w = SAMPLE_WIDTH
  const h = Math.max(2, Math.round((bmp.height / bmp.width) * w))
  const small = new OffscreenCanvas(w, h)
  small.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
  const g = readGray(small)
  const thumbW = 320
  const thumb = new OffscreenCanvas(thumbW, Math.round((bmp.height / bmp.width) * thumbW))
  thumb.getContext('2d')!.drawImage(bmp, 0, 0, thumb.width, thumb.height)
  const analysis: ClipAnalysis = {
    duration: 0,
    width: bmp.width,
    height: bmp.height,
    fps: 0,
    times: [0],
    motion: [0.15],
    brightness: [brightness(g)],
    sharpness: [Math.min(1, sharpness(g) / 0.08)],
    loudness: [0],
    focusX: [0.5],
    focusY: [0.5],
    interest: [0.4],
    cuts: [],
  }
  bmp.close()
  return { analysis, thumbs: [await toBlob(thumb)] }
}

async function loudnessSeries(input: Input, times: number[], dt: number): Promise<number[]> {
  const track = await input.getPrimaryAudioTrack()
  if (!track || !(await track.canDecode())) return times.map(() => 0)
  const sums = new Float64Array(times.length)
  const counts = new Float64Array(times.length)
  const sink = new AudioBufferSink(track)
  for await (const { buffer, timestamp } of sink.buffers()) {
    const data = buffer.getChannelData(0)
    const rate = buffer.sampleRate
    // Decimate: one sample in eight is plenty for an RMS envelope.
    for (let i = 0; i < data.length; i += 8) {
      const bin = Math.floor((timestamp + i / rate) / dt)
      if (bin < 0 || bin >= times.length) continue
      sums[bin] += data[i] * data[i]
      counts[bin]++
    }
  }
  const db = Array.from(sums, (s, i) => (counts[i] ? 10 * Math.log10(s / counts[i] + 1e-9) : -90))
  const top = [...db].sort((a, b) => a - b)[Math.floor(db.length * 0.98)] ?? 0
  return db.map((d) => Math.min(1, Math.max(0, (d - (top - 36)) / 36)))
}

export async function analyzeVideo(file: Blob, onProgress: (fraction: number) => void): Promise<ClipResult> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
  try {
    const track = await input.getPrimaryVideoTrack()
    if (!track) throw new Error('This file has no video track.')
    if (!(await track.canDecode())) throw new Error(`This browser can't decode ${track.codec ?? 'this'} video. Try an H.264 MP4.`)
    const duration = await input.computeDuration()
    const width = await track.getDisplayWidth()
    const height = await track.getDisplayHeight()
    const stats = await track.computePacketStats(120)
    const fps = Math.round(stats.averagePacketRate) || 30

    // ~5 samples a second, fewer for very long clips.
    const dt = Math.max(0.2, duration / MAX_SAMPLES)
    const times: number[] = []
    for (let t = 0; t < duration - 0.02; t += dt) times.push(Math.round(t * 1000) / 1000)
    if (!times.length) times.push(0)

    const sampleH = Math.max(2, Math.round((height / width) * SAMPLE_WIDTH))
    const sink = new CanvasSink(track, { width: SAMPLE_WIDTH, height: sampleH, fit: 'fill', poolSize: 2 })
    const raw = {
      motion: [] as number[],
      sharpness: [] as number[],
      brightness: [] as number[],
      focusX: [] as number[],
      focusY: [] as number[],
    }
    const sigDist: number[] = []
    let prev: Gray | null = null
    let prevSig: Float32Array | null = null
    let i = 0
    for await (const wrapped of sink.canvasesAtTimestamps(times)) {
      if (wrapped) {
        const g = readGray(wrapped.canvas)
        const m = prev ? motion(prev, g) : { amount: 0, x: 0.5, y: 0.5 }
        const sig = signature(g)
        raw.motion.push(m.amount)
        raw.focusX.push(m.x)
        raw.focusY.push(m.y)
        raw.sharpness.push(sharpness(g))
        raw.brightness.push(brightness(g))
        sigDist.push(prevSig ? signatureDistance(prevSig, sig) : 0)
        prev = g
        prevSig = sig
      } else {
        // Past the last decodable frame: repeat the previous values.
        raw.motion.push(raw.motion.at(-1) ?? 0)
        raw.focusX.push(raw.focusX.at(-1) ?? 0.5)
        raw.focusY.push(raw.focusY.at(-1) ?? 0.5)
        raw.sharpness.push(raw.sharpness.at(-1) ?? 0)
        raw.brightness.push(raw.brightness.at(-1) ?? 0)
        sigDist.push(0)
      }
      if (++i % 10 === 0) onProgress(0.8 * (i / times.length))
    }

    const cutIdx = detectCuts(sigDist)
    const cuts = cutIdx.map((k) => Math.round(((times[k - 1] + times[k]) / 2) * 1000) / 1000)
    // The frame right after a cut always "moves" a lot; that's the cut, not action.
    for (const k of cutIdx) raw.motion[k] = raw.motion[k - 1] ?? 0

    onProgress(0.85)
    const loudness = await loudnessSeries(input, times, dt).catch(() => times.map(() => 0))
    const scored = interestScore({ motion: raw.motion, sharpness: raw.sharpness, brightness: raw.brightness, loudness })

    // Smart-crop focus: follow the action, but slowly, like a camera operator would.
    const radius = Math.max(1, Math.round(1.2 / dt))
    const focusX = smoothSeries(
      raw.focusX.map((x, k) => (scored.motion[k] > 0.15 ? x : 0.5)),
      radius,
    )
    const focusY = smoothSeries(
      raw.focusY.map((y, k) => (scored.motion[k] > 0.15 ? y : 0.5)),
      radius,
    )

    onProgress(0.9)
    const thumbs: Blob[] = []
    const thumbSink = new CanvasSink(track, { width: 320, height: Math.round((height / width) * 320), fit: 'fill' })
    const thumbTimes = Array.from({ length: THUMB_COUNT }, (_, k) => (duration * (k + 0.5)) / THUMB_COUNT)
    for await (const wrapped of thumbSink.canvasesAtTimestamps(thumbTimes)) if (wrapped) thumbs.push(await toBlob(wrapped.canvas))

    onProgress(1)
    const round = (xs: number[]) => xs.map((x) => Math.round(x * 1000) / 1000)
    return {
      analysis: {
        duration,
        width,
        height,
        fps,
        times,
        motion: round(scored.motion),
        brightness: round(raw.brightness),
        sharpness: round(scored.sharpness),
        loudness: round(loudness),
        focusX: round(focusX),
        focusY: round(focusY),
        interest: round(scored.interest),
        cuts,
      },
      thumbs,
    }
  } finally {
    input.dispose()
  }
}
