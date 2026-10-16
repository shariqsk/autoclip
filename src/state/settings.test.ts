import { describe, expect, it, vi } from 'vitest'
import { ASPECTS, loadSettings, outputSize } from './settings'

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

describe('loadSettings', () => {
  it('keeps a framing you picked before framing could follow the style', () => {
    const store = new Map<string, string>()
    const local = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) }
    vi.stubGlobal('localStorage', local)
    store.set('autoclip:settings', JSON.stringify({ fit: 'blur' }))
    expect(loadSettings().framing).toBe('blur')
    store.set('autoclip:settings', JSON.stringify({ fit: 'fill' }))
    expect(loadSettings().framing).toBe('style')
    vi.unstubAllGlobals()
  })
})
