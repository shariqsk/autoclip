// A small in-place radix-2 FFT. Fast enough to run a full song's STFT in a worker in well under a
// second, with no dependencies.

export class FFT {
  readonly size: number
  private readonly cos: Float32Array
  private readonly sin: Float32Array
  private readonly rev: Uint32Array
  private readonly re: Float32Array
  private readonly im: Float32Array

  constructor(size: number) {
    if (size & (size - 1)) throw new Error(`FFT size must be a power of two, got ${size}`)
    this.size = size
    this.cos = new Float32Array(size / 2)
    this.sin = new Float32Array(size / 2)
    for (let i = 0; i < size / 2; i++) {
      this.cos[i] = Math.cos((-2 * Math.PI * i) / size)
      this.sin[i] = Math.sin((-2 * Math.PI * i) / size)
    }
    this.rev = new Uint32Array(size)
    const bits = Math.log2(size)
    for (let i = 0; i < size; i++) {
      let r = 0
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b)
      this.rev[i] = r
    }
    this.re = new Float32Array(size)
    this.im = new Float32Array(size)
  }

  /** Magnitude spectrum (bins 0..size/2) of a real frame. `out` must hold size/2 + 1 values. */
  magnitudes(frame: Float32Array, out: Float32Array): Float32Array {
    const { size, re, im, rev, cos, sin } = this
    for (let i = 0; i < size; i++) {
      re[rev[i]] = frame[i]
      im[rev[i]] = 0
    }
    for (let len = 2; len <= size; len <<= 1) {
      const half = len >> 1
      const step = size / len
      for (let i = 0; i < size; i += len) {
        for (let j = 0; j < half; j++) {
          const k = j * step
          const a = i + j
          const b = a + half
          const tr = re[b] * cos[k] - im[b] * sin[k]
          const ti = re[b] * sin[k] + im[b] * cos[k]
          re[b] = re[a] - tr
          im[b] = im[a] - ti
          re[a] += tr
          im[a] += ti
        }
      }
    }
    for (let i = 0; i <= size / 2; i++) out[i] = Math.hypot(re[i], im[i])
    return out
  }
}

export function hann(size: number): Float32Array {
  const w = new Float32Array(size)
  for (let i = 0; i < size; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size)
  return w
}
