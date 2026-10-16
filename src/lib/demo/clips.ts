// Demo footage, generated and encoded in the browser in a few seconds. Each clip has calm stretches
// and a clear moment of action (an impact, a burst, a whip), so the analysis has real highlights to
// find and the demo edit shows what the auto-editor does with them.

import { BufferTarget, CanvasSource, getFirstEncodableVideoCodec, Mp4OutputFormat, Output } from 'mediabunny'

type Draw = (ctx: OffscreenCanvasRenderingContext2D, t: number, w: number, h: number) => void

interface DemoClipDef {
  name: string
  duration: number
  draw: Draw
}

const TAU = Math.PI * 2
const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3)
const pulse = (t: number, at: number, width: number) => Math.exp(-(((t - at) / width) ** 2))

function rand(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
}

const DEFS: DemoClipDef[] = [
  {
    name: 'Collision.mp4',
    duration: 7,
    draw(ctx, t, w, h) {
      // Two fighters circle, then one lands: a flash, shockwave and camera shake at 4.2 s.
      const hit = 4.2
      const shake = pulse(t, hit + 0.05, 0.12) * 18
      ctx.fillStyle = '#120a0a'
      ctx.fillRect(0, 0, w, h)
      ctx.save()
      ctx.translate(Math.sin(t * 70) * shake, Math.cos(t * 63) * shake)
      const g = ctx.createRadialGradient(w / 2, h * 0.2, 10, w / 2, h * 0.2, w * 0.7)
      g.addColorStop(0, '#5a1a14')
      g.addColorStop(1, '#120a0a')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = '#d9c7a0'
      ctx.lineWidth = 3
      for (let i = 0; i < 3; i++) ctx.strokeRect(40 + i * 12, h * 0.55 - i * 30, w - 80 - i * 24, 4)
      const approach = t < hit ? ease(t / hit) : 1
      const ax = w * (0.2 + 0.22 * approach) + Math.sin(t * 3) * 10
      const bx = w * (0.8 - 0.22 * approach) + (t > hit ? (t - hit) * 140 : 0)
      const fallen = t > hit ? Math.min(1, (t - hit) * 2.5) : 0
      ctx.fillStyle = '#e8b04a'
      ctx.beginPath()
      ctx.ellipse(ax, h * 0.48, 26, 70, 0, 0, TAU)
      ctx.fill()
      ctx.fillStyle = '#4ab0e8'
      ctx.save()
      ctx.translate(bx, h * 0.48 + fallen * 40)
      ctx.rotate(fallen * 1.2)
      ctx.beginPath()
      ctx.ellipse(0, 0, 26, 70, 0, 0, TAU)
      ctx.fill()
      ctx.restore()
      const p = pulse(t, hit, 0.18)
      if (p > 0.01) {
        ctx.strokeStyle = `rgba(255,240,200,${p})`
        ctx.lineWidth = 6
        ctx.beginPath()
        ctx.arc((ax + bx) / 2, h * 0.42, 30 + (1 - p) * 220, 0, TAU)
        ctx.stroke()
        ctx.fillStyle = `rgba(255,255,255,${p * 0.8})`
        ctx.fillRect(0, 0, w, h)
      }
      ctx.restore()
    },
  },
  {
    name: 'Slam dunk.mp4',
    duration: 6,
    draw(ctx, t, w, h) {
      // A ball arcs to the rim and is slammed through at 3.4 s.
      const dunk = 3.4
      ctx.fillStyle = '#0d1424'
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#7a4a22'
      ctx.fillRect(0, h * 0.78, w, h * 0.22)
      for (let i = 0; i < 12; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.05 + 0.04 * Math.sin(t * 4 + i)})`
        ctx.beginPath()
        ctx.arc((i / 12) * w + 20, h * 0.15, 30, 0, TAU)
        ctx.fill()
      }
      const rimX = w * 0.75
      const rimY = h * 0.38
      ctx.fillStyle = '#ddd'
      ctx.fillRect(rimX + 40, rimY - 70, 8, 120)
      ctx.strokeStyle = '#ff5a1f'
      ctx.lineWidth = 6
      ctx.beginPath()
      ctx.moveTo(rimX - 34, rimY)
      ctx.lineTo(rimX + 34, rimY + pulse(t, dunk, 0.15) * 14)
      ctx.stroke()
      let bx: number
      let by: number
      if (t < dunk) {
        const k = ease(t / dunk)
        bx = w * 0.1 + (rimX - w * 0.1) * k
        by = h * 0.75 - Math.sin(k * Math.PI * 0.9) * h * 0.55 + k * (rimY - h * 0.75) * 0.6
      } else {
        bx = rimX
        by = rimY + Math.min(h * 0.4, (t - dunk) * 600)
      }
      ctx.fillStyle = '#f08a24'
      ctx.beginPath()
      ctx.arc(bx, by, 22, 0, TAU)
      ctx.fill()
      const p = pulse(t, dunk, 0.12)
      ctx.fillStyle = `rgba(255,200,120,${p * 0.6})`
      ctx.fillRect(0, 0, w, h)
    },
  },
  {
    name: 'Neon tunnel.mp4',
    duration: 8,
    draw(ctx, t, w, h) {
      // Steady forward motion that surges at 5 s.
      const speed = 1 + 5 * pulse(t, 5, 0.6)
      ctx.fillStyle = '#05010d'
      ctx.fillRect(0, 0, w, h)
      for (let i = 0; i < 18; i++) {
        const z = (i / 18 + t * 0.15 * speed) % 1
        const s = Math.pow(z, 2.2) * w * 1.1
        ctx.strokeStyle = `hsla(${(i * 25 + t * 40) % 360}, 90%, 60%, ${z})`
        ctx.lineWidth = 2 + z * 8
        ctx.strokeRect(w / 2 - s / 2, h / 2 - (s * h) / w / 2, s, (s * h) / w)
      }
    },
  },
  {
    name: 'Skate whip.mp4',
    duration: 6,
    draw(ctx, t, w, h) {
      // A slow pan along a skyline, then a fast whip and a kickflip at 3 s.
      const pan = t * 40 + 600 * ease((t - 2.6) / 0.6)
      const sky = ctx.createLinearGradient(0, 0, 0, h)
      sky.addColorStop(0, '#ff9a5a')
      sky.addColorStop(1, '#5a2a6a')
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, w, h)
      const r = rand(7)
      for (let i = 0; i < 40; i++) {
        const bw = 30 + r() * 60
        const bh = 60 + r() * 180
        const x = ((i * 70 - pan) % (w + 200)) + (i * 70 - pan < 0 ? w + 200 : 0) - 100
        ctx.fillStyle = '#1e1230'
        ctx.fillRect(x, h - bh, bw, bh)
      }
      const flip = ease((t - 3) / 0.5)
      const air = Math.sin(Math.min(1, Math.max(0, (t - 2.9) / 0.8)) * Math.PI) * 60
      ctx.save()
      ctx.translate(w / 2, h * 0.82 - air)
      ctx.rotate(flip * TAU)
      ctx.fillStyle = '#f2f2f2'
      ctx.fillRect(-60, -6, 120, 12)
      ctx.restore()
    },
  },
  {
    name: 'Crowd lights.mp4',
    duration: 7,
    draw(ctx, t, w, h) {
      // A crowd waving lights; the arena erupts at 4.8 s.
      const roar = pulse(t, 4.8, 0.5)
      ctx.fillStyle = `rgb(${10 + roar * 60},${8 + roar * 20},${20 + roar * 40})`
      ctx.fillRect(0, 0, w, h)
      const r = rand(3)
      for (let i = 0; i < 160; i++) {
        const x = r() * w
        const y = h * 0.4 + r() * h * 0.6
        const ph = r() * TAU
        const wave = Math.sin(t * (2 + roar * 10) + ph + x / 60) * (8 + roar * 30)
        ctx.fillStyle = `hsla(${40 + r() * 30}, 100%, ${60 + roar * 30}%, ${0.6 + 0.4 * Math.sin(t * 5 + ph)})`
        ctx.beginPath()
        ctx.arc(x + wave * 0.3, y + wave, 2 + roar * 3, 0, TAU)
        ctx.fill()
      }
      for (let k = 0; k < 4; k++) {
        const a = Math.sin(t * 0.7 + k) * 0.6
        ctx.save()
        ctx.translate(w * (0.2 + k * 0.2), 0)
        ctx.rotate(a)
        const beam = ctx.createLinearGradient(0, 0, 0, h)
        beam.addColorStop(0, `rgba(255,255,255,${0.25 + roar * 0.5})`)
        beam.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = beam
        ctx.beginPath()
        ctx.moveTo(-6, 0)
        ctx.lineTo(6, 0)
        ctx.lineTo(80, h)
        ctx.lineTo(-80, h)
        ctx.fill()
        ctx.restore()
      }
    },
  },
  {
    name: 'Ocean drift.mp4',
    duration: 9,
    draw(ctx, t, w, h) {
      // Calm: slow swells and a drifting sun. Good for quiet parts.
      const sky = ctx.createLinearGradient(0, 0, 0, h * 0.55)
      sky.addColorStop(0, '#1b3a5a')
      sky.addColorStop(1, '#f2b880')
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#ffe2a8'
      ctx.beginPath()
      ctx.arc(w * 0.3 + t * 6, h * 0.48, 34, 0, TAU)
      ctx.fill()
      for (let row = 0; row < 14; row++) {
        const y = h * 0.52 + row * 14
        ctx.strokeStyle = `rgba(${40 + row * 6},${90 + row * 6},${130 + row * 4},0.9)`
        ctx.lineWidth = 6
        ctx.beginPath()
        for (let x = 0; x <= w; x += 16) ctx.lineTo(x, y + Math.sin(x / 50 + t * 1.2 + row) * (3 + row * 0.6))
        ctx.stroke()
      }
    },
  },
]

export interface DemoClipFile {
  file: File
}

/** Render and encode the demo clips. Reports 0–1 progress. */
export async function generateDemoClips(onProgress: (f: number) => void, width = 640, height = 360, fps = 30): Promise<File[]> {
  const format = new Mp4OutputFormat({ fastStart: 'in-memory' })
  const codec = await getFirstEncodableVideoCodec(format.getSupportedVideoCodecs(), { width, height })
  if (!codec) throw new Error("This browser can't encode video, so the demo clips can't be made here.")
  const totalFrames = DEFS.reduce((a, d) => a + d.duration * fps, 0)
  let done = 0
  const files: File[] = []
  for (const def of DEFS) {
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')!
    const target = new BufferTarget()
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target })
    const source = new CanvasSource(canvas, { codec, bitrate: 2.5e6, keyFrameInterval: 1 })
    output.addVideoTrack(source, { frameRate: fps })
    await output.start()
    const frames = Math.round(def.duration * fps)
    for (let f = 0; f < frames; f++) {
      def.draw(ctx, f / fps, width, height)
      await source.add(f / fps, 1 / fps)
      if (++done % 15 === 0) onProgress(done / totalFrames)
    }
    await output.finalize()
    files.push(new File([target.buffer!], def.name, { type: 'video/mp4' }))
  }
  onProgress(1)
  return files
}
