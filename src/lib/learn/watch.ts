// Watch a reference edit closely: decode it at up to 30 frames a second (small, for speed), find its
// hard cuts and measure every frame's colour and movement. Runs in a worker.

import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny'
import { detectCuts, motion, signature, signatureDistance, toGray, type Gray } from '../video/metrics'
import { findEvents, frameColor, globalMotion, normalizeGray, type FrameEvents, type FrameSample } from './frames'

export interface WatchedEdit {
  duration: number
  width: number
  height: number
  /** Seconds between samples. */
  dt: number
  cuts: number[]
  frames: FrameSample[]
  events: FrameEvents
}

const WIDTH = 48
export const MAX_REFERENCE_SECONDS = 120

let scratch: OffscreenCanvas | null = null
let scratchCtx: OffscreenCanvasRenderingContext2D | null = null

function pixels(canvas: OffscreenCanvas | HTMLCanvasElement): ImageData {
  if (!scratch || scratch.width !== canvas.width || scratch.height !== canvas.height) {
    scratch = new OffscreenCanvas(canvas.width, canvas.height)
    scratchCtx = scratch.getContext('2d', { willReadFrequently: true })!
  }
  scratchCtx!.drawImage(canvas, 0, 0)
  return scratchCtx!.getImageData(0, 0, canvas.width, canvas.height)
}

export async function watchEdit(file: Blob, onProgress: (fraction: number) => void): Promise<WatchedEdit> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
  try {
    const track = await input.getPrimaryVideoTrack()
    if (!track) throw new Error('This file has no video.')
    if (!(await track.canDecode())) throw new Error(`Can't decode ${track.codec ?? 'this'} video. Try an H.264 MP4.`)
    const duration = await input.computeDuration()
    if (duration > MAX_REFERENCE_SECONDS) throw new Error('Use edits under two minutes long.')
    const width = await track.getDisplayWidth()
    const height = await track.getDisplayHeight()
    const stats = await track.computePacketStats(120)
    const fps = Math.min(30, Math.max(12, Math.round(stats.averagePacketRate) || 30))
    const dt = 1 / fps

    const times: number[] = []
    for (let t = dt / 2; t < duration - 0.01; t += dt) times.push(Math.round(t * 10000) / 10000)
    const h = Math.max(8, Math.round((height / width) * WIDTH))
    const sink = new CanvasSink(track, { width: WIDTH, height: h, fit: 'fill', poolSize: 2 })

    const frames: FrameSample[] = []
    const dists: number[] = []
    const sigs: Float32Array[] = []
    let prev: Gray | null = null
    let i = 0
    for await (const wrapped of sink.canvasesAtTimestamps(times)) {
      const t = times[i]
      if (wrapped) {
        const img = pixels(wrapped.canvas)
        const g = toGray(img.data, img.width, img.height)
        const color = frameColor(img.data, img.width, img.height)
        const move = prev ? motion(prev, g).amount : 0
        const global = prev ? globalMotion(prev.data, g.data, g.width, g.height) : { dx: 0, dy: 0, scale: 1, zoomGain: 0 }
        // Cuts are judged on the picture's content, not its brightness (see normalizeGray).
        const sig = signature({ ...g, data: normalizeGray(g.data) })
        dists.push(sigs.length ? signatureDistance(sigs[sigs.length - 1], sig) : 0)
        sigs.push(sig)
        frames.push({ t, motion: move, ...color, ...global })
        prev = g
      } else if (frames.length) {
        frames.push({ ...frames[frames.length - 1], t, motion: 0 })
        dists.push(0)
        sigs.push(sigs[sigs.length - 1])
      }
      if (++i % 15 === 0) onProgress(i / times.length)
    }
    if (frames.length < 10) throw new Error('That video is too short to learn from.')

    // Hard cuts. At full frame rate a jump between neighbouring frames needs less to stand out.
    const cutIdx = detectCuts(dists, 0.36, sigs)
    const cuts: number[] = []
    for (const k of cutIdx) {
      const at = Math.round(((frames[k - 1].t + frames[k].t) / 2) * 1000) / 1000
      // Fades in and out at the very ends aren't cuts, and one cut can trip on neighbouring frames.
      if (at < 0.25 || at > duration - 0.25) continue
      if (cuts.length && at - cuts[cuts.length - 1] < 0.1) continue
      cuts.push(at)
    }
    onProgress(1)
    return { duration, width, height, dt, cuts, frames, events: findEvents(frames, cuts, dt) }
  } finally {
    input.dispose()
  }
}
