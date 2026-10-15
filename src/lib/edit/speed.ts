// Speed ramps: how fast the source plays at each point of a shot, and how much source a shot uses.

import type { SpeedRamp } from '../types'

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Playback speed at fraction `x` (0–1) through the shot. */
export function speedAt(ramp: SpeedRamp, x: number): number {
  switch (ramp.kind) {
    case 'constant':
      return ramp.speed
    case 'velocity': {
      // Fast in, a held slow-motion valley in the middle, fast out.
      const bump = Math.exp(-(((x - 0.5) / 0.2) ** 4))
      return ramp.fast + (ramp.slow - ramp.fast) * bump
    }
    case 'ease-in':
      return ramp.from + (ramp.to - ramp.from) * smoothstep(0.3, 0.8, x)
  }
}

const STEPS = 48

/** Seconds of source consumed after `u` seconds of a shot that lasts `duration` seconds. */
export function sourceOffset(ramp: SpeedRamp, u: number, duration: number): number {
  if (ramp.kind === 'constant') return ramp.speed * u
  if (duration <= 0) return 0
  // Before the shot (transition handles) and after it, extrapolate at the edge speed.
  if (u < 0) return speedAt(ramp, 0) * u
  if (u > duration) return sourceOffset(ramp, duration, duration) + speedAt(ramp, 1) * (u - duration)
  // Trapezoid rule over a fixed grid: smooth curves, so 48 steps is far below a frame of error.
  const h = u / STEPS
  let sum = 0
  for (let i = 0; i <= STEPS; i++) {
    const w = i === 0 || i === STEPS ? 0.5 : 1
    sum += w * speedAt(ramp, (i * h) / duration)
  }
  return sum * h
}

export function sourceDuration(ramp: SpeedRamp, duration: number): number {
  return sourceOffset(ramp, duration, duration)
}

export function describeSpeed(ramp: SpeedRamp): string {
  switch (ramp.kind) {
    case 'constant':
      return ramp.speed === 1 ? 'Normal speed' : `${Math.round(ramp.speed * 100)}% speed`
    case 'velocity':
      return `Velocity ramp (${ramp.fast}× → ${ramp.slow}× → ${ramp.fast}×)`
    case 'ease-in':
      return `Slow-mo into ${ramp.to}×`
  }
}
