// Grouping faces into people: the same person's fingerprints sit close together (face-api's own
// "same person" line is a distance of 0.6; footage from fights and games is rough, so this is a
// little stricter). Faces are taken biggest first, so each group starts from a clear face, and groups
// that turn out to be the same person are merged. People found before keep their name and role.

import type { ClipFaces, Person } from '../types'

const SAME = 0.5
const MERGE = 0.45

export const distance = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  let s = 0
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2
  return Math.sqrt(s)
}

interface Group {
  sum: Float64Array
  n: number
  members: { clipId: string; index: number }[]
}

const mean = (g: Group) => Array.from(g.sum, (v) => v / g.n)

export function findPeople(faces: Record<string, ClipFaces>, previous: Person[] = []): { people: Person[]; personOf: Map<string, string> } {
  const all = Object.entries(faces).flatMap(([clipId, cf]) => cf.sightings.map((s, index) => ({ clipId, index, s, step: cf.step })))
  all.sort((a, b) => b.s.box[3] * b.s.score - a.s.box[3] * a.s.score)

  // Leader grouping against running means.
  const groups: (Group & { centroid: number[] })[] = []
  for (const f of all) {
    let best = -1
    let bestD = Infinity
    for (let g = 0; g < groups.length; g++) {
      const d = distance(f.s.descriptor, groups[g].centroid)
      if (d < bestD) {
        bestD = d
        best = g
      }
    }
    if (best >= 0 && bestD < SAME) {
      const g = groups[best]
      for (let k = 0; k < g.sum.length; k++) g.sum[k] += f.s.descriptor[k]
      g.n++
      g.members.push({ clipId: f.clipId, index: f.index })
      if (g.n % 4 === 0) g.centroid = mean(g)
    } else {
      groups.push({
        sum: Float64Array.from(f.s.descriptor),
        n: 1,
        members: [{ clipId: f.clipId, index: f.index }],
        centroid: Array.from(f.s.descriptor),
      })
    }
  }
  for (const g of groups) g.centroid = mean(g)

  // Merge groups that are the same person after all, biggest into biggest.
  groups.sort((a, b) => b.n - a.n)
  for (let i = 0; i < groups.length; i++) {
    for (let j = groups.length - 1; j > i; j--) {
      if (distance(groups[i].centroid, groups[j].centroid) < MERGE) {
        const a = groups[i]
        const b = groups.splice(j, 1)[0]
        for (let k = 0; k < a.sum.length; k++) a.sum[k] += b.sum[k]
        a.n += b.n
        a.members.push(...b.members)
        a.centroid = mean(a)
      }
    }
  }

  // Someone seen once or twice is a passer-by, not cast.
  const total = all.length
  const kept = groups.filter((g) => g.n >= Math.max(3, Math.round(total * 0.01)))

  // Keep the names and roles of people found before. A person can own several groups (they were
  // merged by hand, or look different side-on), and then those groups become one person again.
  const nearest = (centroid: number[]) => {
    let match: Person | undefined
    let matchD = SAME
    for (const p of previous) {
      for (const c of p.centroids ?? []) {
        const d = distance(centroid, c)
        if (d < matchD) {
          matchD = d
          match = p
        }
      }
    }
    return match
  }
  const byPerson = new Map<string, { prev?: Person; groups: typeof kept }>()
  kept.forEach((g, i) => {
    const prev = nearest(g.centroid)
    const id = prev?.id ?? `person-${Date.now().toString(36)}-${i}`
    const entry = byPerson.get(id) ?? { prev, groups: [] }
    entry.groups.push(g)
    byPerson.set(id, entry)
  })

  const personOf = new Map<string, string>()
  const people: Person[] = [...byPerson].map(([id, { prev, groups: gs }]) => {
    const members = gs.flatMap((g) => g.members)
    const sightings = members.map((m) => ({ ...m, s: faces[m.clipId].sightings[m.index], step: faces[m.clipId].step }))
    const best = sightings.reduce((a, b) => (b.s.box[3] * b.s.score > a.s.box[3] * a.s.score ? b : a))
    for (const m of members) personOf.set(`${m.clipId}#${m.index}`, id)
    // Keep looks merged by hand even if this footage doesn't show them.
    const centroids = [...gs.map((g) => g.centroid), ...(prev?.centroids ?? [])]
      .filter((c, i, all) => all.findIndex((o) => distance(o, c) < 0.15) === i)
      .slice(0, 8)
      .map((c) => c.map((v) => Math.round(v * 10000) / 10000))
    return {
      id,
      name: prev?.name ?? '',
      role: prev?.role ?? null,
      centroids,
      sightings: members.length,
      seconds: Math.round(sightings.reduce((a, m) => a + m.step, 0)),
      clipIds: [...new Set(members.map((m) => m.clipId))],
      best: { clipId: best.clipId, t: best.s.t, box: best.s.box },
    }
  })
  people.sort((a, b) => b.seconds - a.seconds)
  return { people, personOf }
}
