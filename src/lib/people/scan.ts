// Finding faces in a clip: decode frames a couple of times a second, detect every face with
// SSD-MobileNet, and give each one a 128-number identity fingerprint (face-api's recognition net), all
// on this device. Runs in a worker; the models ship with the app under models/face/.

import * as faceapi from '@vladmandic/face-api'
import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny'
import type { FaceSighting } from '../types'

const WIDTH = 640
/** Faces smaller than this share of the frame height are crowd, not cast. */
const MIN_FACE = 0.045

// The bundled tfjs typings leave out the backend calls; these are the few used here.
const tf = faceapi.tf as unknown as {
  setBackend(name: string): Promise<boolean>
  ready(): Promise<void>
  browser: { fromPixels(pixels: ImageData): { dispose(): void } }
}

let ready: Promise<void> | null = null

function load(modelUrl: string): Promise<void> {
  ready ??= (async () => {
    // face-api only knows browsers and Node. In a worker it gets OffscreenCanvas for its canvases;
    // frames reach it as tensors, so images and videos are never used (stubs keep its checks happy).
    class Never {}
    faceapi.env.setEnv({
      Canvas: OffscreenCanvas,
      CanvasRenderingContext2D: OffscreenCanvasRenderingContext2D,
      Image: Never,
      ImageData,
      Video: Never,
      createCanvasElement: () => new OffscreenCanvas(1, 1),
      createImageElement: () => new Never(),
      fetch: (input: RequestInfo, init?: RequestInit) => fetch(input, init),
      readFile: () => {
        throw new Error('No file system in a worker')
      },
    } as unknown as Parameters<typeof faceapi.env.setEnv>[0])
    await tf.setBackend('webgl').catch(() => tf.setBackend('cpu'))
    await tf.ready()
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(modelUrl),
      faceapi.nets.faceLandmark68Net.loadFromUri(modelUrl),
      faceapi.nets.faceRecognitionNet.loadFromUri(modelUrl),
    ])
  })()
  ready.catch(() => (ready = null))
  return ready
}

/** How often to look: twice a second for short clips, less for long ones (at most ~600 looks). */
export const scanStep = (duration: number) => Math.max(0.5, Math.round((duration / 600) * 10) / 10)

export async function scanFaces(
  file: Blob,
  opts: { offset: number; duration: number; modelUrl: string },
  onProgress: (fraction: number) => void,
): Promise<{ step: number; sightings: FaceSighting[] }> {
  await load(opts.modelUrl)
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
  try {
    const track = await input.getPrimaryVideoTrack()
    if (!track) throw new Error('No video in this clip')
    const width = await track.getDisplayWidth()
    const height = await track.getDisplayHeight()
    const h = Math.max(2, Math.round((height / width) * WIDTH))
    const step = scanStep(opts.duration)
    const times: number[] = []
    for (let t = step / 2; t < opts.duration - 0.05; t += step) times.push(Math.round(t * 1000) / 1000)
    const sink = new CanvasSink(track, { width: WIDTH, height: h, fit: 'fill', poolSize: 2 })
    const scratch = new OffscreenCanvas(WIDTH, h)
    const ctx = scratch.getContext('2d', { willReadFrequently: true })!
    const detector = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5, maxResults: 12 })
    const sightings: FaceSighting[] = []
    let i = 0
    for await (const wrapped of sink.canvasesAtTimestamps(times.map((t) => t + opts.offset))) {
      const t = times[i++]
      if (i % 5 === 0) onProgress(i / times.length)
      if (!wrapped) continue
      ctx.drawImage(wrapped.canvas, 0, 0)
      const pixels = tf.browser.fromPixels(ctx.getImageData(0, 0, WIDTH, h))
      try {
        const found = await faceapi
          .detectAllFaces(pixels as unknown as faceapi.TNetInput, detector)
          .withFaceLandmarks()
          .withFaceDescriptors()
        for (const f of found) {
          const b = f.detection.box
          if (b.height / h < MIN_FACE) continue
          sightings.push({
            t,
            box: [b.x / WIDTH, b.y / h, b.width / WIDTH, b.height / h].map((v) => Math.round(v * 1000) / 1000) as FaceSighting['box'],
            score: Math.round(f.detection.score * 100) / 100,
            descriptor: f.descriptor,
          })
        }
      } finally {
        pixels.dispose()
      }
    }
    onProgress(1)
    return { step, sightings }
  } finally {
    input.dispose()
  }
}
