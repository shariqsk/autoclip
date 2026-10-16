// The library: finished edits kept on disk (Movies/AutoClip/Library), each with its video, a poster
// frame and what to post it with on each platform, plus when and whether it went up. It lives in the
// desktop shell, not the page, so scheduled posts go out whether or not the window is open.
//
// One folder per edit: video.mp4, thumb.jpg and item.json.

import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const PLATFORM_IDS = ['tiktok', 'reels', 'shorts']
const ID = /^[a-z0-9]{6,32}$/
const STATUSES = ['none', 'scheduled', 'due', 'posting', 'posted', 'failed']

/** Keep only what an item may hold, so nothing odd from the page ends up on disk. */
export function cleanPost(p = {}) {
  const status = STATUSES.includes(p.status) ? p.status : 'none'
  return {
    caption: String(p.caption ?? '').slice(0, 2200),
    hashtags: (Array.isArray(p.hashtags) ? p.hashtags : []).map(String).slice(0, 30),
    title: String(p.title ?? '').slice(0, 100),
    status,
    at: Number.isFinite(p.at) ? p.at : null,
    postedAt: Number.isFinite(p.postedAt) ? p.postedAt : null,
    error: p.error ? String(p.error).slice(0, 300) : null,
    url: typeof p.url === 'string' && /^https:\/\//.test(p.url) ? p.url : null,
  }
}

export function createLibrary({ dir, onChange = () => {} }) {
  const folder = (id) => {
    if (!ID.test(id)) throw new Error('Bad id')
    return path.join(dir, id)
  }
  const read = async (id) => JSON.parse(await readFile(path.join(folder(id), 'item.json'), 'utf8'))
  const write = async (item) => {
    const file = path.join(folder(item.id), 'item.json')
    // Write then rename, so a crash mid-write never leaves a broken item.
    await writeFile(`${file}.tmp`, JSON.stringify(item, null, 1))
    await rename(`${file}.tmp`, file)
  }

  async function list() {
    await mkdir(dir, { recursive: true })
    const ids = (await readdir(dir)).filter((n) => ID.test(n))
    const items = await Promise.all(ids.map((id) => read(id).catch(() => null)))
    return items.filter(Boolean).sort((a, b) => b.createdAt - a.createdAt)
  }

  async function add({ video, thumb, name, duration, width, height, posts }) {
    if (!(video instanceof Uint8Array)) throw new Error('No video')
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
    await mkdir(folder(id), { recursive: true })
    await writeFile(path.join(folder(id), 'video.mp4'), video)
    if (thumb instanceof Uint8Array) await writeFile(path.join(folder(id), 'thumb.jpg'), thumb)
    const item = {
      id,
      name: String(name ?? 'Edit').slice(0, 120),
      createdAt: Date.now(),
      duration: Number(duration) || 0,
      width: Number(width) || 0,
      height: Number(height) || 0,
      size: video.byteLength,
      deleteAfterPost: false,
      posts: Object.fromEntries(PLATFORM_IDS.map((p) => [p, cleanPost(posts?.[p])])),
    }
    await write(item)
    onChange()
    return item
  }

  async function update(id, patch) {
    const item = await read(id)
    if (typeof patch.name === 'string') item.name = patch.name.slice(0, 120)
    if (typeof patch.deleteAfterPost === 'boolean') item.deleteAfterPost = patch.deleteAfterPost
    for (const p of PLATFORM_IDS) if (patch.posts?.[p]) item.posts[p] = cleanPost({ ...item.posts[p], ...patch.posts[p] })
    await write(item)
    // Everything it was meant for is up, and you asked for it to go: clear it out.
    const meant = PLATFORM_IDS.filter((p) => item.posts[p].status !== 'none')
    if (item.deleteAfterPost && meant.length && meant.every((p) => item.posts[p].status === 'posted')) {
      await remove([id])
      return null
    }
    onChange()
    return item
  }

  async function remove(ids) {
    for (const id of ids) await rm(folder(id), { recursive: true, force: true })
    onChange()
  }

  const file = (id, name) => path.join(folder(id), name)

  return { list, add, update, remove, file, read }
}
