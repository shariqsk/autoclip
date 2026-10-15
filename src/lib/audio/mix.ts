// The edit's soundtrack, rendered offline: the chosen part of the song with fades, sound effects
// synthesized on the fly (whooshes on transitions, a sub impact on drops, a reverse swell into
// them), the clips' own sound under hero shots, and a voiceover with the music ducked beneath it.
// Preview and export both play this one buffer.

import type { EditPlan, TransitionType } from '../types'
import { sourceDuration, speedAt } from '../edit/speed'

export interface VoiceoverClip {
  buffer: AudioBuffer
  /** Seconds into the edit. */
  at: number
}

export interface MixOptions {
  musicVolume: number
  fadeIn: number
  fadeOut: number
  sfx: boolean
  sfxVolume: number
  /** Play each clip's own sound: never, under hero (drop) shots only, or under every shot. */
  clipAudio: 'off' | 'hero' | 'all'
  clipVolume: number
  clipBuffers: Map<string, AudioBuffer>
  voiceovers: VoiceoverClip[]
  voiceVolume: number
  /** How far the music dips under the voice, 0–1. */
  duck: number
}

export const DEFAULT_MIX: Omit<MixOptions, 'clipBuffers' | 'voiceovers'> = {
  musicVolume: 1,
  fadeIn: 0.15,
  fadeOut: 1.2,
  sfx: true,
  sfxVolume: 0.7,
  clipAudio: 'off',
  clipVolume: 0.8,
  voiceVolume: 1,
  duck: 0.65,
}

const WHOOSH_ON: TransitionType[] = ['whip', 'zoom', 'spin', 'glitch']

function noiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate)
  const d = buf.getChannelData(0)
  let s = 12345
  for (let i = 0; i < d.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    d[i] = (s / 0x7fffffff) * 2 - 1
  }
  return buf
}

function whoosh(ctx: BaseAudioContext, out: AudioNode, noise: AudioBuffer, at: number, gain: number, short: boolean) {
  const dur = short ? 0.28 : 0.5
  const t0 = Math.max(0, at - dur * 0.6)
  const src = ctx.createBufferSource()
  src.buffer = noise
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 1.4
  bp.frequency.setValueAtTime(350, t0)
  bp.frequency.exponentialRampToValueAtTime(3200, t0 + dur * 0.6)
  bp.frequency.exponentialRampToValueAtTime(700, t0 + dur)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.6)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  src.connect(bp).connect(g).connect(out)
  src.start(t0, ((at * 7.31) % 1) * 0.5, dur + 0.05)
}

function impact(ctx: BaseAudioContext, out: AudioNode, noise: AudioBuffer, at: number, gain: number) {
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(95, at)
  osc.frequency.exponentialRampToValueAtTime(32, at + 0.6)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(gain, at + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, at + 1.4)
  osc.connect(g).connect(out)
  osc.start(at)
  osc.stop(at + 1.5)

  const n = ctx.createBufferSource()
  n.buffer = noise
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(4000, at)
  lp.frequency.exponentialRampToValueAtTime(200, at + 0.4)
  const ng = ctx.createGain()
  ng.gain.setValueAtTime(gain * 0.5, at)
  ng.gain.exponentialRampToValueAtTime(0.0001, at + 0.45)
  n.connect(lp).connect(ng).connect(out)
  n.start(at, 0, 0.5)
}

function swell(ctx: BaseAudioContext, out: AudioNode, noise: AudioBuffer, end: number, length: number, gain: number) {
  const t0 = Math.max(0, end - length)
  const n = ctx.createBufferSource()
  n.buffer = noise
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.setValueAtTime(800, t0)
  hp.frequency.exponentialRampToValueAtTime(5000, end)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(gain, end - 0.02)
  g.gain.linearRampToValueAtTime(0, end)
  n.connect(hp).connect(g).connect(out)
  n.start(t0, 0, length + 0.05)
}

export async function renderMix(song: AudioBuffer, plan: EditPlan, opts: MixOptions, sampleRate = 48000): Promise<AudioBuffer> {
  const duration = plan.songEnd - plan.songStart
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate)
  const master = ctx.createDynamicsCompressor()
  master.threshold.value = -6
  master.knee.value = 6
  master.ratio.value = 8
  master.attack.value = 0.003
  master.release.value = 0.15
  master.connect(ctx.destination)

  // Music, with fades and a duck bus for the voiceover and hero-shot clip audio.
  const music = ctx.createBufferSource()
  music.buffer = song
  const musicGain = ctx.createGain()
  const duck = ctx.createGain()
  music.connect(musicGain).connect(duck).connect(master)
  const v = opts.musicVolume
  musicGain.gain.setValueAtTime(0, 0)
  musicGain.gain.linearRampToValueAtTime(v, Math.max(0.01, opts.fadeIn))
  if (plan.songEnd < song.duration - 0.05) {
    musicGain.gain.setValueAtTime(v, Math.max(opts.fadeIn, duration - opts.fadeOut))
    musicGain.gain.linearRampToValueAtTime(0, duration)
  }
  music.start(0, plan.songStart, duration)

  const ducks: [number, number][] = []

  if (opts.sfx && opts.sfxVolume > 0) {
    const noise = noiseBuffer(ctx, 2)
    const sfx = ctx.createGain()
    sfx.gain.value = opts.sfxVolume
    sfx.connect(master)
    for (const shot of plan.shots) {
      if (WHOOSH_ON.includes(shot.transition.type)) whoosh(ctx, sfx, noise, shot.start, 0.35, shot.transition.type === 'glitch')
    }
    for (const h of plan.hits) {
      if (h.kind !== 'drop') continue
      impact(ctx, sfx, noise, h.time, 0.8)
      if (h.time > 1.5) swell(ctx, sfx, noise, h.time, Math.min(2.5, h.time - 0.2), 0.12)
    }
  }

  if (opts.clipAudio !== 'off') {
    const bus = ctx.createGain()
    bus.gain.value = opts.clipVolume
    bus.connect(master)
    for (const shot of plan.shots) {
      const buf = opts.clipBuffers.get(shot.clipId)
      if (!buf) continue
      const isHero = shot.fx.flash > 0
      if (opts.clipAudio === 'hero' && !isHero) continue
      const dur = shot.end - shot.start
      const src = ctx.createBufferSource()
      src.buffer = buf
      // Follow the speed ramp so the sound stays glued to the picture.
      const steps = 32
      const curve = new Float32Array(steps)
      for (let i = 0; i < steps; i++) curve[i] = Math.max(0.06, speedAt(shot.speed, i / (steps - 1)))
      src.playbackRate.setValueCurveAtTime(curve, shot.start, Math.max(0.01, dur))
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, shot.start)
      g.gain.linearRampToValueAtTime(1, shot.start + 0.03)
      g.gain.setValueAtTime(1, Math.max(shot.start + 0.03, shot.end - 0.05))
      g.gain.linearRampToValueAtTime(0, shot.end)
      src.connect(g).connect(bus)
      const srcLen = sourceDuration(shot.speed, dur)
      if (shot.srcStart < buf.duration) src.start(shot.start, shot.srcStart, Math.min(srcLen + 0.1, buf.duration - shot.srcStart))
      if (isHero) ducks.push([shot.start, shot.end])
    }
  }

  if (opts.voiceovers.length) {
    const bus = ctx.createGain()
    bus.gain.value = opts.voiceVolume
    // A little presence and a tight echo, so the voice sits on top of a loud track.
    const presence = ctx.createBiquadFilter()
    presence.type = 'peaking'
    presence.frequency.value = 3000
    presence.gain.value = 3
    presence.Q.value = 0.8
    const delay = ctx.createDelay(1)
    delay.delayTime.value = 0.11
    const fb = ctx.createGain()
    fb.gain.value = 0.18
    bus.connect(presence).connect(master)
    presence.connect(delay).connect(fb).connect(delay)
    fb.connect(master)
    for (const vo of opts.voiceovers) {
      const src = ctx.createBufferSource()
      src.buffer = vo.buffer
      src.connect(bus)
      src.start(Math.max(0, vo.at))
      ducks.push([vo.at, vo.at + vo.buffer.duration])
    }
  }

  // Duck the music under the voice and hero clip audio, with smooth ramps.
  const level = 1 - opts.duck
  const merged: [number, number][] = []
  for (const [a, b] of ducks.sort((x, y) => x[0] - y[0])) {
    const last = merged[merged.length - 1]
    if (last && a <= last[1] + 0.4) last[1] = Math.max(last[1], b)
    else merged.push([a, b])
  }
  for (const [a, b] of merged) {
    const s = Math.max(0, a - 0.12)
    duck.gain.setValueAtTime(1, s)
    duck.gain.linearRampToValueAtTime(level, a)
    duck.gain.setValueAtTime(level, Math.max(a, b))
    duck.gain.linearRampToValueAtTime(1, b + 0.25)
  }

  return ctx.startRendering()
}
