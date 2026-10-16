import { describe, expect, it } from 'vitest'
import type { ClipAnalysis, ClipFaces, FaceSighting } from '../types'
import { distance, findPeople } from './cluster'
import { faceFocus, framedOnStars, presence } from './presence'

// Deterministic pseudo-random numbers.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

/** A fingerprint for each of three people, and noisy sightings of them (like real footage). */
function footage(): Record<string, ClipFaces> {
  const r = rng(7)
  const ids = [0, 1, 2].map(() => Array.from({ length: 128 }, () => (r() - 0.5) * 0.18))
  const sight = (who: number, t: number, h: number): FaceSighting => ({
    t,
    box: [0.4, 0.2, h * 0.8, h],
    score: 0.9,
    descriptor: Float32Array.from(ids[who], (v) => v + (r() - 0.5) * 0.02),
  })
  return {
    a: {
      step: 0.5,
      sightings: [
        ...Array.from({ length: 30 }, (_, i) => sight(0, i * 0.5, 0.2)),
        ...Array.from({ length: 8 }, (_, i) => sight(1, i * 0.5, 0.1)),
      ],
    },
    b: {
      step: 0.5,
      sightings: [
        ...Array.from({ length: 12 }, (_, i) => sight(0, i * 0.5, 0.3)),
        ...Array.from({ length: 10 }, (_, i) => sight(2, 6 + i * 0.5, 0.12)),
        sight(1, 20, 0.1),
      ],
    },
  }
}

describe('finding people', () => {
  it('groups the same face across clips and ranks people by screen time', () => {
    const faces = footage()
    const { people, personOf } = findPeople(faces)
    expect(people).toHaveLength(3)
    const [main] = people
    expect(main.sightings).toBe(42)
    expect(main.clipIds.sort()).toEqual(['a', 'b'])
    // The portrait is their biggest face.
    expect(main.best.clipId).toBe('b')
    expect(personOf.get('a#0')).toBe(main.id)
    expect(personOf.get('b#0')).toBe(main.id)
  })

  it('drops passers-by seen only once or twice', () => {
    const faces = footage()
    faces.a.sightings.push({ ...faces.a.sightings[0], descriptor: Float32Array.from({ length: 128 }, () => 0.5) })
    expect(findPeople(faces).people).toHaveLength(3)
  })

  it('keeps names and roles when people are found again', () => {
    const faces = footage()
    const first = findPeople(faces).people
    first[0] = { ...first[0], name: 'Islam', role: 'star' }
    const again = findPeople(faces, first).people
    expect(again[0]).toMatchObject({ id: first[0].id, name: 'Islam', role: 'star' })
    expect(distance(again[0].centroids[0], first[0].centroids[0])).toBeLessThan(0.01)
  })

  it('remembers people merged by hand as one person', () => {
    const faces = footage()
    const [a, b, c] = findPeople(faces).people
    // Say the second and third are really the same person: merge them.
    const merged = { ...b, name: 'Same guy', centroids: [...b.centroids, ...c.centroids] }
    const again = findPeople(faces, [a, merged]).people
    expect(again).toHaveLength(2)
    expect(again.find((p) => p.id === b.id)).toMatchObject({ name: 'Same guy', sightings: b.sightings + c.sightings })
  })
})

describe('where the cast is on screen', () => {
  const analysis = (n: number): ClipAnalysis => {
    const times = Array.from({ length: n }, (_, i) => i * 0.2)
    const half = times.map(() => 0.5)
    return {
      duration: n * 0.2,
      width: 1920,
      height: 1080,
      fps: 30,
      times,
      motion: half,
      brightness: half,
      sharpness: half,
      loudness: half,
      focusX: half,
      focusY: half,
      interest: half,
      cuts: [],
    }
  }

  it('marks the moments a star is on screen and pulls the framing onto them', () => {
    const faces = footage()
    const { personOf } = findPeople(faces)
    faces.b.sightings.forEach((s, i) => (s.personId = personOf.get(`b#${i}`)))
    const starId = faces.b.sightings[0].personId!
    const a = analysis(80)
    const p = presence(a, faces.b, new Set([starId]), new Set())!
    // The star is in the first six seconds of clip b, not after.
    expect(p.star[5]).toBeGreaterThan(0.9)
    expect(p.star[60]).toBe(0)
    const framed = framedOnStars(a, p)
    expect(framed.focusX[10]).toBeGreaterThan(0.5)
    expect(framed.focusX[70]).toBeCloseTo(0.5)
  })

  it('does nothing until someone is starred or cut', () => {
    expect(presence(analysis(10), footage().a, new Set(), new Set())).toBeNull()
  })
})

describe('framing on faces', () => {
  const times = Array.from({ length: 10 }, (_, i) => i * 0.5)
  const a = { times, duration: 5 } as ClipAnalysis
  const face = (t: number, x: number, h: number, personId?: string): FaceSighting => ({
    t,
    box: [x - h * 0.4, 0.3, h * 0.8, h],
    score: 0.9,
    descriptor: new Float32Array(128),
    personId,
  })

  it('frames on the biggest face, or between two of about the same size', () => {
    const faces: ClipFaces = { step: 0.5, sightings: [face(0, 0.2, 0.3), face(0, 0.8, 0.1), face(2, 0.3, 0.2), face(2, 0.7, 0.19)] }
    const f = faceFocus(a, faces, new Set())!
    expect(f[0]!.x).toBeCloseTo(0.2, 2)
    // Two faces of a size, facing off: frame between them.
    expect(f[4]!.x).toBeCloseTo(0.5, 2)
    // No face, no opinion: framing follows the action there.
    expect(f[9]).toBeNull()
  })

  it('frames on your star even when someone else is bigger', () => {
    const faces: ClipFaces = { step: 0.5, sightings: [face(0, 0.2, 0.4), face(0, 0.85, 0.15, 'star')] }
    expect(faceFocus(a, faces, new Set(['star']))![0]!.x).toBeCloseTo(0.85, 2)
  })
})
