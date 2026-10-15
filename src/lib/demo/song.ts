// A tiny synth that writes a real club-style track: intro, build with a snare roll and riser, drop,
// breakdown, second build, bigger drop, outro. It powers the in-app demo (so anyone can try AutoClip
// without their own music) and gives the analysis tests a song with a known tempo and known drops.

export interface DemoSongPart {
  label: 'intro' | 'build' | 'drop' | 'break' | 'outro'
  bars: number
}

export interface DemoSong {
  samples: Float32Array
  sampleRate: number
  bpm: number
  parts: (DemoSongPart & { start: number; end: number })[]
}

export const DEMO_STRUCTURE: DemoSongPart[] = [
  { label: 'intro', bars: 4 },
  { label: 'build', bars: 4 },
  { label: 'drop', bars: 8 },
  { label: 'break', bars: 4 },
  { label: 'build', bars: 4 },
  { label: 'drop', bars: 8 },
  { label: 'outro', bars: 4 },
]

/** Deterministic noise so the demo (and the tests) are identical every run. */
function noise(seed = 1) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return (s / 0xffffffff) * 2 - 1
  }
}

// A minor-key loop: Am – F – C – G, as root frequencies for the bass and chord stabs.
const ROOTS = [55, 43.65, 65.41, 49]
const CHORDS = [
  [220, 261.63, 329.63],
  [174.61, 220, 261.63],
  [261.63, 329.63, 392],
  [196, 246.94, 293.66],
]

export function synthesizeDemoSong(sampleRate = 44100, bpm = 128, structure = DEMO_STRUCTURE): DemoSong {
  const beat = 60 / bpm
  const bar = beat * 4
  const totalBars = structure.reduce((a, p) => a + p.bars, 0)
  const length = Math.ceil((totalBars * bar + 1.5) * sampleRate)
  const out = new Float32Array(length)
  const rnd = noise(7)

  const add = (start: number, dur: number, fn: (t: number, i: number) => number) => {
    const s0 = Math.floor(start * sampleRate)
    const n = Math.floor(dur * sampleRate)
    for (let i = 0; i < n && s0 + i < length; i++) out[s0 + i] += fn(i / sampleRate, i)
  }
  const kick = (t0: number, gain = 1) =>
    add(t0, 0.45, (t) => {
      const f = 45 + 110 * Math.exp(-t * 30)
      return gain * 0.9 * Math.sin(2 * Math.PI * f * t - 0.6 * Math.exp(-t * 30)) * Math.exp(-t * 7)
    })
  const snare = (t0: number, gain = 1) =>
    add(t0, 0.25, (t) => gain * (0.45 * rnd() * Math.exp(-t * 18) + 0.25 * Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 25)))
  const hat = (t0: number, gain = 1, open = false) => {
    let prev = 0
    add(t0, open ? 0.2 : 0.05, (t) => {
      const n = rnd()
      const hp = n - prev
      prev = n
      return gain * 0.16 * hp * Math.exp(-t * (open ? 14 : 70))
    })
  }
  const bass = (t0: number, dur: number, f: number, gain = 1) =>
    add(t0, dur, (t) => {
      const env = Math.min(1, t * 200) * Math.min(1, (dur - t) * 60)
      const saw = 2 * ((f * t) % 1) - 1
      return gain * 0.32 * env * (0.6 * Math.sin(2 * Math.PI * f * t) + 0.4 * Math.tanh(saw * 2))
    })
  const pad = (t0: number, dur: number, freqs: number[], gain = 1) =>
    add(t0, dur, (t) => {
      const env = Math.min(1, t * 2) * Math.min(1, (dur - t) * 4)
      let s = 0
      for (const f of freqs) s += Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 1.003 * t)
      return gain * 0.05 * env * s
    })
  const stab = (t0: number, freqs: number[], gain = 1) =>
    add(t0, 0.22, (t) => {
      let s = 0
      for (const f of freqs) s += Math.tanh(3 * Math.sin(2 * Math.PI * f * 2 * t))
      return gain * 0.07 * s * Math.exp(-t * 12)
    })
  const riser = (t0: number, dur: number) => {
    let lp = 0
    add(t0, dur, (t) => {
      const p = t / dur
      const a = 0.02 + 0.5 * p * p
      lp += a * (rnd() - lp)
      return 0.22 * p * p * lp + 0.05 * p * Math.sin(2 * Math.PI * (200 + 1800 * p * p) * t)
    })
  }
  const impact = (t0: number) =>
    add(
      t0,
      1.6,
      (t) => 0.6 * Math.sin(2 * Math.PI * (38 + 40 * Math.exp(-t * 6)) * t) * Math.exp(-t * 2.2) + 0.2 * rnd() * Math.exp(-t * 9),
    )

  const parts: DemoSong['parts'] = []
  let t = 0
  let dropCount = 0
  for (const part of structure) {
    const start = t
    for (let b = 0; b < part.bars; b++) {
      const bt = t + b * bar
      const chord = (Math.floor(b / 2) + (part.label === 'drop' ? 0 : 0)) % 4
      const lastBar = b === part.bars - 1
      switch (part.label) {
        case 'intro':
        case 'outro': {
          pad(bt, bar, CHORDS[chord], part.label === 'outro' ? 1 - b / part.bars : 1)
          for (let i = 0; i < 4; i++) hat(bt + i * beat + beat / 2, 0.6)
          if (part.label === 'intro') kick(bt, 0.35)
          break
        }
        case 'break': {
          pad(bt, bar, CHORDS[chord], 1.2)
          bass(bt, bar * 0.9, ROOTS[chord] * 2, 0.35)
          break
        }
        case 'build': {
          pad(bt, bar, CHORDS[chord], 0.8)
          // Snare roll that doubles in speed every bar: quarters, eighths, sixteenths, thirty-seconds.
          const hitsPerBar = 4 * 2 ** Math.min(3, b)
          for (let i = 0; i < hitsPerBar; i++)
            snare(bt + (i * bar) / hitsPerBar, 0.15 + (0.45 * (b * hitsPerBar + i)) / (part.bars * hitsPerBar))
          if (b < 2) for (let i = 0; i < 4; i++) kick(bt + i * beat, 0.3)
          if (b === 0) riser(bt, bar * part.bars)
          if (lastBar) {
            // The classic half-bar of silence before the drop: cut the kicks on the last two beats.
            out.fill(0, Math.floor((bt + bar - beat * 0.5) * sampleRate), Math.floor((bt + bar) * sampleRate))
          }
          break
        }
        case 'drop': {
          if (b === 0) {
            impact(bt)
            dropCount++
          }
          const gain = dropCount > 1 ? 1.1 : 1
          for (let i = 0; i < 4; i++) {
            kick(bt + i * beat, gain)
            bass(bt + i * beat + beat / 2, beat / 2, ROOTS[chord], gain)
            hat(bt + i * beat + beat / 2, 0.9, i % 2 === 1)
            hat(bt + i * beat + beat / 4, 0.45)
            hat(bt + i * beat + (3 * beat) / 4, 0.45)
          }
          snare(bt + beat, gain)
          snare(bt + 3 * beat, gain)
          stab(bt, CHORDS[chord], gain)
          stab(bt + beat * 1.5, CHORDS[chord], gain * 0.8)
          stab(bt + beat * 3, CHORDS[chord], gain * 0.9)
          break
        }
      }
    }
    t += part.bars * bar
    parts.push({ ...part, start, end: t })
  }

  // Gentle limiter so the stacked layers never clip.
  for (let i = 0; i < length; i++) out[i] = Math.tanh(out[i] * 1.1) * 0.9
  return { samples: out, sampleRate, bpm, parts }
}
