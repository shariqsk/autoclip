import { describe, expect, it } from 'vitest'
import { fitToSize, shrinkFor } from './budget'

describe('fitting an export under a size limit', () => {
  it('spends what the limit allows on a 30 s vertical edit, at full size', () => {
    const b = fitToSize({ limitMb: 19.5, seconds: 30, width: 1080, height: 1920, fps: 30, wantMbps: 14 })
    // 19.5 MB over 30 s is about 4.8 Mbps after the sound and some headroom.
    expect(b.videoMbps).toBeGreaterThan(4)
    expect(b.videoMbps).toBeLessThan(5)
    expect(b.shortSide).toBe(1080)
    const bytes = ((b.videoMbps * 1e6 + b.audioKbps * 1e3) * 30) / 8
    expect(bytes).toBeLessThan(19.5e6)
  })

  it('drops to 720p when a long edit would starve 1080p', () => {
    const b = fitToSize({ limitMb: 19.5, seconds: 120, width: 1080, height: 1920, fps: 60, wantMbps: 20 })
    expect(b.shortSide).toBe(720)
  })

  it('never asks for more than the chosen quality would use', () => {
    expect(fitToSize({ limitMb: 19.5, seconds: 10, width: 720, height: 1280, fps: 30, wantMbps: 3 }).videoMbps).toBe(3)
  })

  it('aims lower after an overshoot', () => {
    expect(shrinkFor(4.8, 21e6, 19.5e6)).toBeLessThan(4.8 * (19.5 / 21))
  })
})
