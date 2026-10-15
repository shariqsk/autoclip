import { describe, expect, it } from 'vitest'
import { synthesizeDemoSong } from '../demo/song'
import { analyzeSong } from './analyze'
import { FFT } from './fft'

describe('FFT', () => {
  it('finds a pure tone in the right bin', () => {
    const n = 1024
    const fft = new FFT(n)
    const frame = new Float32Array(n).map((_, i) => Math.sin((2 * Math.PI * 32 * i) / n))
    const mags = fft.magnitudes(frame, new Float32Array(n / 2 + 1))
    const peak = mags.indexOf(Math.max(...mags))
    expect(peak).toBe(32)
  })
})

describe('analyzeSong', () => {
  const song = synthesizeDemoSong(22050)
  const result = analyzeSong(song.samples, { sampleRate: 22050 })
  const dropParts = song.parts.filter((p) => p.label === 'drop')

  it('finds the tempo', () => {
    expect(result.bpm).toBeGreaterThan(126)
    expect(result.bpm).toBeLessThan(130)
  })

  it('tracks beats on the grid', () => {
    const beat = 60 / song.bpm
    const inDrop = result.beats.filter((b) => b.time > dropParts[0].start + 1 && b.time < dropParts[0].end - 1)
    expect(inDrop.length).toBeGreaterThan(20)
    for (const b of inDrop) {
      const offGrid = Math.abs(((b.time + beat / 2) % beat) - beat / 2)
      expect(offGrid).toBeLessThan(0.05)
    }
  })

  it('finds both drops within a beat', () => {
    expect(result.drops.length).toBeGreaterThanOrEqual(2)
    for (const part of dropParts) {
      const nearest = Math.min(...result.drops.map((d) => Math.abs(d.time - part.start)))
      expect(nearest).toBeLessThan(0.5)
    }
  })

  it('labels the drop sections as loud and the break as quiet', () => {
    const labelAt = (t: number) => result.sections.find((s) => t >= s.start && t < s.end)?.label
    expect(labelAt(dropParts[0].start + 4)).toBe('drop')
    const brk = song.parts.find((p) => p.label === 'break')!
    expect(['break', 'build', 'verse', 'intro']).toContain(labelAt(brk.start + 2))
  })

  it('places downbeats on bar starts', () => {
    const bar = (60 / song.bpm) * 4
    const downs = result.beats.filter((b) => b.kind === 'downbeat' && b.time > dropParts[0].start - 0.1 && b.time < dropParts[0].end - 0.1)
    for (const d of downs) {
      const off = Math.abs(((d.time - dropParts[0].start + bar / 2) % bar) - bar / 2)
      expect(off).toBeLessThan(0.06)
    }
  })
})
