import { describe, expect, it } from 'vitest'
import { ASPECTS, outputSize } from './settings'

describe('outputSize', () => {
  it('sizes every aspect from its short side, in even pixels', () => {
    expect(outputSize('9:16', 1080)).toEqual({ width: 1080, height: 1920 })
    expect(outputSize('16:9', 1080)).toEqual({ width: 1920, height: 1080 })
    expect(outputSize('1:1', 720)).toEqual({ width: 720, height: 720 })
    expect(outputSize('4:5', 1080)).toEqual({ width: 1080, height: 1350 })
    for (const a of ASPECTS) {
      const s = outputSize(a.id, 2160)
      expect(s.width % 2).toBe(0)
      expect(s.height % 2).toBe(0)
    }
  })
})
