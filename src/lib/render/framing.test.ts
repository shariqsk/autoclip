import { describe, expect, it } from 'vitest'
import { pictureArea } from './framing'

describe('pictureArea', () => {
  const tall = { width: 1080, height: 1920 }
  it('is the whole frame when the shot is cropped to fill it', () => {
    expect(pictureArea('fill', { width: 1920, height: 1080 }, tall)).toEqual({ top: 0, height: 1 })
  })

  it('is the band between the bars when a wide shot is shown whole', () => {
    const a = pictureArea('bars', { width: 1920, height: 1080 }, tall)
    expect(a.height).toBeCloseTo(0.316, 2)
    expect(a.top).toBeCloseTo(0.342, 2)
  })

  it('is the whole frame when the shot is taller than the frame', () => {
    expect(pictureArea('bars', { width: 720, height: 1280 }, { width: 1920, height: 1080 })).toEqual({ top: 0, height: 1 })
  })
})
