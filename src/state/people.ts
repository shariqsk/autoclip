// The cast: find the people in the footage, pick who the edit is about (one star or several) and
// who to keep out. Stars pull footage choice and framing their way; people you cut are avoided.

import { faceFocus, framedOnStars, presence, type Presence } from '../lib/people/presence'
import { findPeople } from '../lib/people/cluster'
import { scanClipFaces } from '../lib/people/client'
import type { CastRole, Clip, ClipAnalysis, ClipFaces, Person } from '../lib/types'
import { grabFaces } from '../lib/video/posters'
import { makeEdit } from './actions'
import { ASPECTS } from './settings'
import { getState, setState, toast } from './store'

/** Clips that can be searched for faces and haven't been yet. */
export function unscannedClips(s = getState()): Clip[] {
  return s.clips.filter((c) => c.status === 'ready' && c.kind === 'video' && c.analysis && !s.faces[c.id])
}

let scanning = false

/**
 * Clips that have to be cropped hard for the output's shape (wide footage in a vertical edit, say),
 * where knowing where the faces are makes the crop. Their faces are found quietly in the background.
 */
export function autoFindFaces() {
  const s = getState()
  if (scanning || s.clips.some((c) => c.status === 'queued' || c.status === 'analyzing')) return
  const out = ASPECTS.find((a) => a.id === s.settings.aspect)!
  const outAspect = out.w / out.h
  const needs = unscannedClips(s).filter((c) => {
    const a = c.analysis!.width / Math.max(1, c.analysis!.height)
    return Math.max(a / outAspect, outAspect / a) > 1.3
  })
  if (needs.length) void findPeopleInFootage({ quiet: true })
}

/** Look for faces in every clip not searched yet, then group them into people. */
export async function findPeopleInFootage(opts: { quiet?: boolean } = {}) {
  if (scanning) return
  const todo = unscannedClips()
  if (!todo.length) return regroup(opts.quiet)
  scanning = true
  setState({ peopleScan: { done: 0, total: todo.length, fraction: 0 } })
  let failed = 0
  let lastError = ''
  try {
    for (const [i, clip] of todo.entries()) {
      try {
        const faces = await scanClipFaces(clip.file, clip.offset ?? 0, clip.analysis!.duration, (f) =>
          setState({ peopleScan: { done: i, total: todo.length, fraction: (i + f) / todo.length } }),
        )
        setState((s) => ({ faces: { ...s.faces, [clip.id]: faces } }))
      } catch (err) {
        failed++
        lastError = err instanceof Error ? err.message : String(err)
      }
    }
    if (failed === todo.length) {
      if (!opts.quiet) toast(`Couldn't look for faces: ${lastError}`, 'error')
      return
    }
    if (failed && !opts.quiet) toast(`Couldn't look for faces in ${failed} of ${todo.length} clips: ${lastError}`, 'error')
    await regroup(opts.quiet)
  } finally {
    scanning = false
    setState({ peopleScan: null })
  }
}

/** Group every face found so far into people, keeping names and roles, and grab new portraits. */
async function regroup(quiet = false) {
  const s = getState()
  const { people, personOf } = findPeople(s.faces, s.people)
  const faces: Record<string, ClipFaces> = {}
  for (const [clipId, cf] of Object.entries(s.faces))
    faces[clipId] = { ...cf, sightings: cf.sightings.map((x, i) => ({ ...x, personId: personOf.get(`${clipId}#${i}`) })) }
  const oldThumbs = new Map(s.people.map((p) => [p.id, p.thumb]))
  setState({ faces, people: people.map((p) => ({ ...p, thumb: oldThumbs.get(p.id) })) })
  if (!people.length && !quiet) toast('No faces big enough to recognize in this footage.', 'info')
  await portraits()
}

/** Portraits for anyone who doesn't have one yet, grabbed from their clearest face. */
async function portraits() {
  const s = getState()
  const missing = s.people.filter((p) => !p.thumb)
  const byClip = new Map<string, typeof missing>()
  for (const p of missing) byClip.set(p.best.clipId, [...(byClip.get(p.best.clipId) ?? []), p])
  for (const [clipId, list] of byClip) {
    const clip = s.clips.find((c) => c.id === clipId)
    if (!clip) continue
    const urls = await grabFaces(
      clip.url,
      list.map((p) => ({ t: (clip.offset ?? 0) + p.best.t, box: p.best.box })),
    ).catch(() => [])
    const thumbs = new Map(list.map((p, i) => [p.id, urls[i]]))
    setState((st) => ({ people: st.people.map((p) => (thumbs.get(p.id) ? { ...p, thumb: thumbs.get(p.id) } : p)) }))
  }
}

const recut = () => {
  const s = getState()
  if (s.song?.analysis && s.drafts.length && s.clips.some((c) => c.status === 'ready')) makeEdit({ recut: true })
}

export function setRole(id: string, role: CastRole) {
  setState((s) => ({ people: s.people.map((p) => (p.id === id ? { ...p, role: p.role === role ? null : role } : p)) }))
  recut()
}

/** Tell AutoClip several people are really one (the same face side-on, or behind a glove). */
export function mergePeople(ids: string[]) {
  const s = getState()
  const group = ids.map((id) => s.people.find((p) => p.id === id)).filter((p): p is Person => !!p)
  if (group.length < 2) return
  // Keep the one with the most screen time, and the first name and role given.
  const [keep, ...rest] = [...group].sort((a, b) => b.seconds - a.seconds)
  const gone = new Set(rest.map((p) => p.id))
  const biggest = group.reduce((a, b) => (b.best.box[3] > a.best.box[3] ? b : a))
  const merged: Person = {
    ...keep,
    name: group.find((p) => p.name)?.name ?? '',
    role: group.find((p) => p.role === 'star')?.role ?? group.find((p) => p.role)?.role ?? null,
    centroids: group.flatMap((p) => p.centroids).slice(0, 8),
    sightings: group.reduce((a, p) => a + p.sightings, 0),
    seconds: group.reduce((a, p) => a + p.seconds, 0),
    clipIds: [...new Set(group.flatMap((p) => p.clipIds))],
    best: biggest.best,
    thumb: biggest.thumb ?? keep.thumb,
  }
  const faces: Record<string, ClipFaces> = {}
  for (const [clipId, cf] of Object.entries(s.faces))
    faces[clipId] = { ...cf, sightings: cf.sightings.map((x) => (x.personId && gone.has(x.personId) ? { ...x, personId: keep.id } : x)) }
  setState({
    faces,
    people: s.people
      .filter((p) => !gone.has(p.id))
      .map((p) => (p.id === keep.id ? merged : p))
      .sort((a, b) => b.seconds - a.seconds),
  })
  if (group.some((p) => p.role)) recut()
}

export function renamePerson(id: string, name: string) {
  setState((s) => ({ people: s.people.map((p) => (p.id === id ? { ...p, name: name.slice(0, 32) } : p)) }))
}

// Presence is worked out per clip and kept until the faces or the roles change.
let cache: { key: unknown; roles: string; map: Map<string, Presence | null> } = { key: null, roles: '', map: new Map() }

export function castPresence(clip: Pick<Clip, 'id'> & { analysis: ClipAnalysis }): Presence | null {
  const s = getState()
  const roles = s.people.map((p) => `${p.id}:${p.role}`).join(',')
  if (cache.key !== s.faces || cache.roles !== roles) cache = { key: s.faces, roles, map: new Map() }
  const k = `${clip.id}@${clip.analysis.duration}`
  if (!cache.map.has(k)) {
    const stars = new Set(s.people.filter((p) => p.role === 'star').map((p) => p.id))
    const cuts = new Set(s.people.filter((p) => p.role === 'cut').map((p) => p.id))
    cache.map.set(k, presence(clip.analysis, s.faces[clip.id], stars, cuts))
  }
  return cache.map.get(k)!
}

/**
 * A clip's analysis with framing pulled onto faces (your stars first) wherever any were found, for
 * the preview and the export. Without faces, framing follows the action as before.
 */
export function castFramed(clip: Pick<Clip, 'id'> & { analysis: ClipAnalysis }): ClipAnalysis {
  const s = getState()
  const stars = new Set(s.people.filter((p) => p.role === 'star').map((p) => p.id))
  const focus = faceFocus(clip.analysis, s.faces[clip.id], stars)
  return framedOnStars(clip.analysis, focus ? { focus } : castPresence(clip))
}
