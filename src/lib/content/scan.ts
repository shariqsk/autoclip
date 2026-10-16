// Reading what kind of shot each moment of a clip is: frames go through CLIP's image half
// (ViT-B/32, 8-bit, downloaded once and cached) and are matched against the shipped descriptions of
// each shot type. Runs in a worker.

import { AutoProcessor, CLIPVisionModelWithProjection, RawImage, type ProgressInfo } from '@huggingface/transformers'
import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny'
import type { ClipContent, ContentKind } from '../types'
import { classify } from './classify'
import prompts from './prompts.json'

type Loaded = {
  processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>
  vision: Awaited<ReturnType<typeof CLIPVisionModelWithProjection.from_pretrained>>
}
let ready: Promise<Loaded> | null = null

function load(onDownload: (fraction: number | null) => void): Promise<Loaded> {
  ready ??= (async () => {
    const progress_callback = (info: ProgressInfo) => {
      if (info.status === 'progress_total') onDownload(info.total ? info.loaded / info.total : null)
    }
    const [processor, vision] = await Promise.all([
      AutoProcessor.from_pretrained(prompts.model, { progress_callback }),
      // The accuracy was measured with the 8-bit model on WASM; keep exactly that.
      CLIPVisionModelWithProjection.from_pretrained(prompts.model, { dtype: 'q8', device: 'wasm', progress_callback }),
    ])
    return { processor, vision }
  })()
  ready.catch(() => (ready = null))
  return ready
}

/** How often to look: shots change type far less often than faces move. */
export const contentStep = (duration: number) => Math.max(0.75, Math.round((duration / 300) * 10) / 10)

export async function scanContent(
  file: Blob,
  opts: { offset: number; duration: number },
  onProgress: (fraction: number, stage: 'download' | 'scan') => void,
): Promise<ClipContent> {
  const { processor, vision } = await load((f) => onProgress(f ?? 0, 'download'))
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
  try {
    const track = await input.getPrimaryVideoTrack()
    if (!track) throw new Error('No video in this clip')
    const width = await track.getDisplayWidth()
    const height = await track.getDisplayHeight()
    // CLIP looks at 224×224; a little more keeps the resize sharp.
    const w = 320
    const h = Math.max(2, Math.round((height / width) * w))
    const step = contentStep(opts.duration)
    const times: number[] = []
    for (let t = step / 2; t < opts.duration - 0.05; t += step) times.push(Math.round(t * 1000) / 1000)
    const sink = new CanvasSink(track, { width: w, height: h, fit: 'fill', poolSize: 2 })
    const scratch = new OffscreenCanvas(w, h)
    const ctx = scratch.getContext('2d', { willReadFrequently: true })!
    const embeddings = prompts.categories as Record<ContentKind, number[][]>
    const kept: number[] = []
    const probs: number[][] = []
    let i = 0
    for await (const wrapped of sink.canvasesAtTimestamps(times.map((t) => t + opts.offset))) {
      const t = times[i++]
      if (i % 4 === 0) onProgress(i / times.length, 'scan')
      if (!wrapped) continue
      ctx.drawImage(wrapped.canvas, 0, 0)
      const img = ctx.getImageData(0, 0, w, h)
      const image = new RawImage(img.data, w, h, 4).rgb()
      const { image_embeds } = await vision(await processor(image))
      const v = image_embeds.normalize(2, -1).data as Float32Array
      kept.push(t)
      probs.push(classify(v, embeddings))
    }
    onProgress(1, 'scan')
    return { step, times: kept, probs }
  } finally {
    input.dispose()
  }
}
