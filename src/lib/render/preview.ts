// Live preview: plays the edit in real time. Frames come from <video> elements (two per clip, so the
// next shot can be cued while the current one plays), the clock is the audio output, and the
// compositor and captions are the same ones the exporter uses.

import { drawCaptions, type CaptionOptions } from '../captions/render'
import { speedAt } from '../edit/speed'
import { frameAt, shotIndexAt, type Layer } from '../edit/timeline'
import type { ClipAnalysis, EditPlan } from '../types'
import { Compositor, type LayerInput, type Look } from './compositor'
import { focusAt, stillZoom } from './framing'

export interface PreviewClip {
  id: string
  kind: 'video' | 'image'
  url: string
  analysis: ClipAnalysis
}

export interface PreviewProject {
  plan: EditPlan
  clips: PreviewClip[]
  look: Look
  captions: CaptionOptions | null
  audio: AudioBuffer | null
}

const SYNC_TOLERANCE = 0.12

export class PreviewEngine {
  private compositor: Compositor
  private captionCanvas: OffscreenCanvas
  private captionCtx: OffscreenCanvasRenderingContext2D
  private captionShown = false
  private project: PreviewProject | null = null
  private clips = new Map<string, PreviewClip>()
  private videos = new Map<string, HTMLVideoElement>()
  private images = new Map<string, HTMLImageElement>()
  private durations: Record<string, number> = {}
  private ctx: AudioContext
  private gain: GainNode
  private source: AudioBufferSourceNode | null = null
  private startedAt = 0
  private offset = 0
  private raf = 0
  private dirty = true
  private captures: ((dataUrl: string) => void)[] = []
  playing = false
  loop = true
  onTime: (t: number) => void = () => {}
  onEnded: () => void = () => {}

  readonly canvas: HTMLCanvasElement

  constructor(canvas: HTMLCanvasElement, audioContext: AudioContext) {
    this.canvas = canvas
    this.compositor = new Compositor(canvas)
    this.captionCanvas = new OffscreenCanvas(canvas.width, canvas.height)
    this.captionCtx = this.captionCanvas.getContext('2d')!
    this.ctx = audioContext
    this.gain = this.ctx.createGain()
    this.gain.connect(this.ctx.destination)
    this.raf = requestAnimationFrame(this.tick)
  }

  get duration(): number {
    return this.project ? this.project.plan.songEnd - this.project.plan.songStart : 0
  }

  get currentTime(): number {
    if (!this.playing) return this.offset
    return Math.min(this.duration, this.offset + (this.ctx.currentTime - this.startedAt))
  }

  setVolume(v: number) {
    this.gain.gain.value = v
  }

  resize(width: number, height: number) {
    this.compositor.resize(width, height)
    this.captionCanvas.width = width
    this.captionCanvas.height = height
    this.captionShown = false
    this.compositor.setCaption(null)
    this.dirty = true
  }

  setProject(project: PreviewProject) {
    const audioChanged = project.audio !== this.project?.audio
    this.project = project
    this.clips = new Map(project.clips.map((c) => [c.id, c]))
    this.durations = Object.fromEntries(project.clips.map((c) => [c.id, c.kind === 'image' ? Infinity : c.analysis.duration]))
    for (const [key, v] of this.videos) {
      const clipId = key.split('#')[0]
      if (!this.clips.has(clipId)) {
        v.removeAttribute('src')
        v.load()
        this.videos.delete(key)
      }
    }
    if (this.offset > this.duration) this.offset = 0
    if (audioChanged && this.playing) this.startAudio(this.currentTime)
    this.dirty = true
  }

  private video(clipId: string, slot: number): HTMLVideoElement {
    const key = `${clipId}#${slot}`
    let v = this.videos.get(key)
    if (!v) {
      v = document.createElement('video')
      v.muted = true
      v.playsInline = true
      v.preload = 'auto'
      v.crossOrigin = 'anonymous'
      v.src = this.clips.get(clipId)!.url
      v.addEventListener('seeked', () => (this.dirty = true))
      v.addEventListener('loadeddata', () => (this.dirty = true))
      this.videos.set(key, v)
    }
    return v
  }

  private image(clipId: string): HTMLImageElement {
    let img = this.images.get(clipId)
    if (!img) {
      img = new Image()
      img.src = this.clips.get(clipId)!.url
      img.onload = () => (this.dirty = true)
      this.images.set(clipId, img)
    }
    return img
  }

  private startAudio(at: number) {
    this.source?.stop()
    this.source?.disconnect()
    this.source = null
    const audio = this.project?.audio
    if (!audio) return
    const src = this.ctx.createBufferSource()
    src.buffer = audio
    src.connect(this.gain)
    src.start(0, at)
    this.source = src
  }

  async play() {
    if (!this.project || this.playing) return
    if (this.ctx.state === 'suspended') await this.ctx.resume()
    if (this.offset >= this.duration - 0.05) this.offset = 0
    this.startedAt = this.ctx.currentTime
    this.startAudio(this.offset)
    this.playing = true
  }

  pause() {
    if (!this.playing) return
    this.offset = this.currentTime
    this.playing = false
    this.source?.stop()
    this.source = null
    for (const v of this.videos.values()) v.pause()
    this.dirty = true
  }

  toggle() {
    if (this.playing) this.pause()
    else void this.play()
  }

  seek(t: number) {
    const clamped = Math.max(0, Math.min(this.duration, t))
    this.offset = clamped
    if (this.playing) {
      this.startedAt = this.ctx.currentTime
      this.startAudio(clamped)
    }
    this.dirty = true
    this.onTime(clamped)
  }

  private layerInput(layer: Layer | null, shotIndex: number): LayerInput | null | 'pending' {
    if (!layer) return null
    const clip = this.clips.get(layer.shot.clipId)
    if (!clip) return null
    if (clip.kind === 'image') {
      const img = this.image(clip.id)
      if (!img.complete || !img.naturalWidth) return 'pending'
      return { source: img, width: img.naturalWidth, height: img.naturalHeight, focusX: 0.5, focusY: 0.5, zoom: stillZoom(layer) }
    }
    const v = this.video(clip.id, shotIndex % 2)
    const want = layer.srcTime
    const shot = layer.shot
    const rate = speedAt(shot.speed, layer.progress)
    if (this.playing && rate > 0.07) {
      v.playbackRate = Math.min(16, Math.max(0.0625, rate))
      if (Math.abs(v.currentTime - want) > SYNC_TOLERANCE && !v.seeking) v.currentTime = want
      if (v.paused) void v.play().catch(() => {})
    } else {
      // Paused, or a freeze-frame: hold the exact frame.
      if (!v.paused) v.pause()
      if (Math.abs(v.currentTime - want) > 0.02 && !v.seeking) v.currentTime = want
    }
    if (v.readyState < 2) return 'pending'
    const focus = focusAt(clip.analysis, want)
    return { source: v, width: v.videoWidth, height: v.videoHeight, focusX: focus.x, focusY: focus.y, zoom: 1 }
  }

  /** Cue the next shot's video so it's already at the right frame when the cut comes. */
  private preload(t: number) {
    const plan = this.project!.plan
    const i = shotIndexAt(plan.shots, t)
    const next = plan.shots[i + 1]
    if (!next || next.start - t > 1.5) return
    const clip = this.clips.get(next.clipId)
    if (!clip || clip.kind !== 'video') return
    const v = this.video(clip.id, (i + 1) % 2)
    const want = next.srcStart - next.transition.duration / 2
    if (!v.seeking && Math.abs(v.currentTime - want) > 0.05 && v.paused) v.currentTime = Math.max(0, want)
  }

  private tick = () => {
    this.raf = requestAnimationFrame(this.tick)
    const project = this.project
    if (!project || (!this.playing && !this.dirty)) return
    let t = this.currentTime
    if (this.playing && t >= this.duration - 0.001) {
      if (this.loop) {
        this.offset = 0
        this.startedAt = this.ctx.currentTime
        this.startAudio(0)
        t = 0
      } else {
        this.pause()
        this.offset = this.duration
        this.onEnded()
      }
    }

    const plan = project.plan
    const state = frameAt(plan, t, this.durations)
    const ia = Math.max(
      0,
      plan.shots.findIndex((s) => s.id === state.a?.shot.id),
    )
    const ib = state.b ? plan.shots.findIndex((s) => s.id === state.b!.shot.id) : -1
    const a = this.layerInput(state.a, ia)
    const b = state.b ? this.layerInput(state.b, ib) : null
    if (this.playing) this.preload(t)
    // Pause videos that aren't on screen so they don't drift or burn battery.
    const onScreen = new Set([state.a && `${state.a.shot.clipId}#${ia % 2}`, state.b && `${state.b.shot.clipId}#${ib % 2}`])
    for (const [key, v] of this.videos) if (!onScreen.has(key) && !v.paused) v.pause()

    if (a === 'pending' || b === 'pending') {
      this.onTime(t)
      return
    }

    const { width, height } = this.canvas
    if (project.captions && plan.captions.length) {
      const shown = drawCaptions(this.captionCtx, plan.captions, t, project.captions, width, height)
      if (shown || this.captionShown) this.compositor.setCaption(shown ? this.captionCanvas : null)
      this.captionShown = shown
    } else if (this.captionShown) {
      this.compositor.setCaption(null)
      this.captionShown = false
    }
    this.compositor.render({ a, b, transition: state.transition, fx: state.fx, look: project.look, time: t })
    this.dirty = false
    if (this.captures.length && a) {
      const shot = this.snapshot()
      for (const resolve of this.captures.splice(0)) resolve(shot)
    }
    this.onTime(t)
  }

  /** Grab the current frame as an image (for draft thumbnails). */
  snapshot(maxWidth = 240): string {
    const scale = Math.min(1, maxWidth / this.canvas.width)
    const c = document.createElement('canvas')
    c.width = Math.round(this.canvas.width * scale)
    c.height = Math.round(this.canvas.height * scale)
    c.getContext('2d')!.drawImage(this.canvas, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.75)
  }

  /**
   * A poster frame at time `t`, taken once that frame has really rendered (videos seeked and
   * decoded). While playing, the next rendered frame is used instead so playback isn't disturbed.
   */
  capture(t: number): Promise<string> {
    const back = this.currentTime
    const wasPlaying = this.playing
    if (!wasPlaying) this.seek(t)
    return new Promise((resolve) =>
      this.captures.push((img) => {
        if (!wasPlaying) this.seek(back)
        resolve(img)
      }),
    )
  }

  invalidate() {
    this.dirty = true
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.source?.stop()
    for (const v of this.videos.values()) {
      v.pause()
      v.removeAttribute('src')
      v.load()
    }
    this.videos.clear()
    this.compositor.dispose()
  }
}
