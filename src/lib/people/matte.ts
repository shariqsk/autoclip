// Cutting the people out of a frame, so text can sit behind them. MediaPipe's selfie segmenter runs on
// the GPU in a few milliseconds a frame, fast enough to matte every frame of the preview and the export
// while a title is up. Loaded the first time it's needed; everything stays on this device.

import type { ImageSegmenter } from '@mediapipe/tasks-vision'

export interface Matte {
  /** 0–255 per pixel, rows from the top: how much of each pixel is a person. */
  data: Uint8Array
  width: number
  height: number
}

let loading: Promise<ImageSegmenter> | null = null
let ready: ImageSegmenter | null = null

const base = () => new URL(`${import.meta.env.BASE_URL}models/segment/`, location.href).href

/** Load the segmenter (once). Resolves when it can matte frames. */
export function loadMatte(): Promise<ImageSegmenter> {
  loading ??= (async () => {
    const { ImageSegmenter } = await import('@mediapipe/tasks-vision')
    // The model is fetched here rather than by URL: MediaPipe can't read the desktop app's own scheme.
    const model = new Uint8Array(await (await fetch(`${base()}selfie_segmenter.tflite`)).arrayBuffer())
    const seg = await ImageSegmenter.createFromOptions(
      { wasmLoaderPath: `${base()}vision_wasm_internal.js`, wasmBinaryPath: `${base()}vision_wasm_internal.wasm` },
      {
        baseOptions: { modelAssetBuffer: model, delegate: 'GPU' },
        runningMode: 'IMAGE',
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      },
    )
    ready = seg
    return seg
  })().catch((err) => {
    loading = null
    throw err
  })
  return loading
}

export const matteReady = () => !!ready

/** The person matte for a frame, or null if the segmenter isn't loaded yet (see loadMatte). */
export function matteFrame(source: TexImageSource): Matte | null {
  if (!ready) return null
  const result = ready.segment(source as Parameters<ImageSegmenter['segment']>[0])
  try {
    const mask = result.confidenceMasks?.[0]
    if (!mask) return null
    const f = mask.getAsFloat32Array()
    const data = new Uint8Array(f.length)
    for (let i = 0; i < f.length; i++) data[i] = Math.round(Math.min(1, Math.max(0, f[i])) * 255)
    return { data, width: mask.width, height: mask.height }
  } finally {
    result.close()
  }
}
