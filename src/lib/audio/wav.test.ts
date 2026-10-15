import { expect, it } from 'vitest'
import { encodeWav } from './wav'

it('writes a valid 16-bit WAV header and samples', async () => {
  const blob = encodeWav([new Float32Array([0, 1, -1, 0.5])], 8000)
  const v = new DataView(await blob.arrayBuffer())
  expect(blob.size).toBe(44 + 8)
  expect(String.fromCharCode(v.getUint8(8), v.getUint8(9), v.getUint8(10), v.getUint8(11))).toBe('WAVE')
  expect(v.getUint32(24, true)).toBe(8000)
  expect(v.getInt16(46, true)).toBe(32767)
  expect(v.getInt16(48, true)).toBe(-32768)
})
