// Export: decode every frame the edit needs with WebCodecs (frame-accurate, not the <video> element),
// composite it on the GPU with the same shader as the preview, and encode H.264 + AAC into an MP4,
// all in the browser. Nothing is uploaded anywhere.

import {
  ALL_FORMATS,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  canEncodeAudio,
  getFirstEncodableVideoCodec,
  Input,
  Mp4OutputFormat,
  Output,
  type InputVideoTrack,
  type WrappedCanvas,
} from 'mediabunny'
import { drawBehind, drawCaptions, type CaptionOptions } from '../captions/render'
import { frameAt, type Layer } from '../edit/timeline'
import type { ClipAnalysis, EditPlan } from '../types'
import { Compositor, type LayerInput, type Look } from './compositor'
import { focusAt, motionAt, stillZoom } from './framing'
import { loadMatte, matteFrame } from '../people/matte'

export interface ExportClip {
  id: string
  kind: 'video' | 'image'
  file: File
  analysis: ClipAnalysis
  /** Seconds into the file where this clip starts (moments cut from a longer clip). */
  offset?: number
}

export interface ExportOptions {
  plan: EditPlan
  clips: ExportClip[]
  look: Look
  captions: CaptionOptions | null
  width: number
  height: number
  fps: number
  /** Megabits per second. */
  bitrate: number
  /** Kilobits per second for the sound (192 unless a size limit needs it smaller). */
  audioBitrate?: number
  audio: AudioBuffer
  signal?: AbortSignal
  onProgress?: (fraction: number, stage: string) => void
}

export class ExportCancelled extends Error {
  constructor() {
    super('Export cancelled')
    this.name = 'ExportCancelled'
  }
}

interface FrameNeed {
  a: { shot: string; idx: number } | null
  b: { shot: string; idx: number } | null
}

export async function exportEdit(opts: ExportOptions): Promise<Blob> {
  const { plan, width, height, fps, signal } = opts
  const progress = opts.onProgress ?? (() => {})
  const check = () => {
    if (signal?.aborted) throw new ExportCancelled()
  }
  const duration = plan.songEnd - plan.songStart
  const frameCount = Math.max(1, Math.round(duration * fps))
  const clipById = new Map(opts.clips.map((c) => [c.id, c]))
  const durations = Object.fromEntries(opts.clips.map((c) => [c.id, c.kind === 'image' ? Infinity : c.analysis.duration]))

  progress(0, 'Planning frames')
  // Pass 1: which source frames each output frame needs, so each shot can be decoded in one sweep.
  const states = Array.from({ length: frameCount }, (_, f) => frameAt(plan, f / fps, durations))
  const perShot = new Map<string, number[]>()
  const needs: FrameNeed[] = states.map((s) => {
    const want = (l: Layer | null) => {
      if (!l) return null
      const list = perShot.get(l.shot.id) ?? []
      // Decoding needs non-decreasing timestamps; a frame never steps back within a shot.
      const ts = Math.max(l.srcTime + (clipById.get(l.shot.clipId)?.offset ?? 0), list.at(-1) ?? 0)
      list.push(ts)
      perShot.set(l.shot.id, list)
      return { shot: l.shot.id, idx: list.length - 1 }
    }
    return { a: want(s.a), b: want(s.b) }
  })
  const lastUse = new Map<string, number>()
  needs.forEach((n, f) => {
    if (n.a) lastUse.set(n.a.shot, f)
    if (n.b) lastUse.set(n.b.shot, f)
  })

  // Decoders: one input per clip file, one sink + generator per shot (opened on first use).
  const inputs = new Map<string, { input: Input; track: InputVideoTrack }>()
  const stills = new Map<string, ImageBitmap>()
  const gens = new Map<string, AsyncGenerator<WrappedCanvas | null, void, unknown>>()
  const shotById = new Map(plan.shots.map((s) => [s.id, s]))
  const canvasCache = new Map<string, { idx: number; canvas: WrappedCanvas['canvas'] | null }>()

  const getTrack = async (clipId: string) => {
    let entry = inputs.get(clipId)
    if (!entry) {
      const clip = clipById.get(clipId)!
      const input = new Input({ source: new BlobSource(clip.file), formats: ALL_FORMATS })
      const track = await input.getPrimaryVideoTrack()
      if (!track) throw new Error(`${clip.file.name} has no video track`)
      entry = { input, track }
      inputs.set(clipId, entry)
    }
    return entry
  }

  const frameFor = async (need: { shot: string; idx: number }): Promise<LayerInput['source'] | null> => {
    const shot = shotById.get(need.shot)!
    const clip = clipById.get(shot.clipId)!
    if (clip.kind === 'image') {
      let bmp = stills.get(clip.id)
      if (!bmp) {
        bmp = await createImageBitmap(clip.file)
        stills.set(clip.id, bmp)
      }
      return bmp
    }
    const cached = canvasCache.get(need.shot)
    if (cached && cached.idx === need.idx) return cached.canvas
    let gen = gens.get(need.shot)
    if (!gen) {
      const { track } = await getTrack(clip.id)
      const a = clip.analysis
      // Decode just big enough to cover the output with headroom for zoom punches.
      const scale = Math.min(1, Math.max(width / a.width, height / a.height) * 1.3)
      const sink = new CanvasSink(track, {
        width: Math.max(2, Math.round((a.width * scale) / 2) * 2),
        height: Math.max(2, Math.round((a.height * scale) / 2) * 2),
        fit: 'fill',
        poolSize: 3,
      })
      gen = sink.canvasesAtTimestamps(perShot.get(need.shot)!)
      gens.set(need.shot, gen)
    }
    // Advance this shot's decoder to the frame index we need.
    let entry = canvasCache.get(need.shot) ?? { idx: -1, canvas: null }
    while (entry.idx < need.idx) {
      const r = await gen.next()
      entry = { idx: entry.idx + 1, canvas: r.done ? entry.canvas : (r.value?.canvas ?? entry.canvas) }
      if (r.done) break
    }
    canvasCache.set(need.shot, entry)
    return entry.canvas
  }

  const canvas = new OffscreenCanvas(width, height)
  const compositor = new Compositor(canvas)
  const captionCanvas = new OffscreenCanvas(width, height)
  const captionCtx = captionCanvas.getContext('2d')!
  let captionShown = false
  const behindCanvas = new OffscreenCanvas(width, height)
  const behindCtx = behindCanvas.getContext('2d')!
  let behindShown = false
  // Text behind people: cut the people out of every frame the title is up. If the segmenter can't
  // load, the title is still drawn, just over them.
  const behind = !!opts.captions?.titleBehind && plan.captions.some((l) => l.title)
  if (behind) await loadMatte().catch(() => {})

  const format = new Mp4OutputFormat({ fastStart: 'in-memory' })
  const codec = await getFirstEncodableVideoCodec(format.getSupportedVideoCodecs(), { width, height })
  if (!codec) throw new Error("This browser can't encode video. Try Chrome, Edge or the desktop app.")
  const target = new BufferTarget()
  const output = new Output({ format, target })
  const videoSource = new CanvasSource(canvas, { codec, bitrate: opts.bitrate * 1e6, keyFrameInterval: 2 })
  output.addVideoTrack(videoSource, { frameRate: fps })
  const audioCodec = (await canEncodeAudio('aac')) ? 'aac' : 'opus'
  const audioSource = new AudioBufferSource({ codec: audioCodec, bitrate: (opts.audioBitrate ?? 192) * 1e3 })
  output.addAudioTrack(audioSource)

  try {
    await output.start()
    progress(0.01, 'Mixing audio')
    await audioSource.add(opts.audio)
    audioSource.close()

    for (let f = 0; f < frameCount; f++) {
      check()
      const t = f / fps
      const state = states[f]
      const need = needs[f]
      const toInput = async (layer: Layer | null, n: FrameNeed['a']): Promise<LayerInput | null> => {
        if (!layer || !n) return null
        const source = await frameFor(n)
        if (!source) return null
        const clip = clipById.get(layer.shot.clipId)!
        const focus = clip.kind === 'image' ? { x: 0.5, y: 0.5 } : focusAt(clip.analysis, layer.srcTime)
        return {
          source,
          width: clip.analysis.width,
          height: clip.analysis.height,
          focusX: focus.x,
          focusY: focus.y,
          zoom: clip.kind === 'image' ? stillZoom(layer) : 1,
          motion: clip.kind === 'image' ? 0 : motionAt(clip.analysis, layer.srcTime),
          key: layer.shot.id,
        }
      }
      const a = await toInput(state.a, need.a)
      const b = await toInput(state.b, need.b)

      if (opts.captions && plan.captions.length) {
        const shown = drawCaptions(captionCtx, plan.captions, t, opts.captions, width, height)
        if (shown || captionShown) compositor.setCaption(shown ? captionCanvas : null)
        captionShown = shown
      }
      if (behind) {
        const shown = drawBehind(behindCtx, plan.captions, t, opts.captions!, width, height)
        if (shown || behindShown) compositor.setBehind(shown ? behindCanvas : null)
        behindShown = shown
        compositor.setMatte(shown && a && !state.transition ? matteFrame(a.source) : null)
      }
      compositor.render({ a, b, transition: state.transition, fx: state.fx, look: opts.look, time: t })
      await videoSource.add(t, 1 / fps)

      // Free decoders for shots that are finished.
      for (const n of [need.a, need.b]) {
        if (n && lastUse.get(n.shot) === f) {
          await gens.get(n.shot)?.return()
          gens.delete(n.shot)
          canvasCache.delete(n.shot)
        }
      }
      if (f % 5 === 0) progress(0.02 + 0.95 * (f / frameCount), 'Rendering frames')
    }

    videoSource.close()
    progress(0.98, 'Finishing the file')
    await output.finalize()
    progress(1, 'Done')
    return new Blob([target.buffer!], { type: 'video/mp4' })
  } catch (err) {
    await output.cancel().catch(() => {})
    throw err
  } finally {
    for (const g of gens.values()) await g.return().catch(() => {})
    for (const { input } of inputs.values()) input.dispose()
    for (const b of stills.values()) b.close()
    compositor.dispose()
  }
}
