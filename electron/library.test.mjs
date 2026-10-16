import { mkdtemp, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanPost, createLibrary } from './library.mjs'

let dir
beforeEach(async () => (dir = await mkdtemp(path.join(os.tmpdir(), 'autoclip-lib-'))))
afterEach(() => rm(dir, { recursive: true, force: true }))

const video = new Uint8Array([1, 2, 3])

describe('library', () => {
  it('keeps edits with what to post them with, newest first', async () => {
    const lib = createLibrary({ dir })
    const a = await lib.add({ video, name: 'One', posts: { tiktok: { caption: 'hi', hashtags: ['edit'] } } })
    await new Promise((r) => setTimeout(r, 5))
    const b = await lib.add({ video, name: 'Two' })
    const items = await lib.list()
    expect(items.map((i) => i.id)).toEqual([b.id, a.id])
    expect(items[1].posts.tiktok).toMatchObject({ caption: 'hi', hashtags: ['edit'], status: 'none' })
    expect(items[1].posts.reels.status).toBe('none')
  })

  it('schedules, marks posted, and deletes once everything it was meant for is up', async () => {
    const lib = createLibrary({ dir })
    const a = await lib.add({ video, name: 'One' })
    await lib.update(a.id, { deleteAfterPost: true, posts: { tiktok: { status: 'scheduled', at: 1 }, reels: { status: 'scheduled', at: 2 } } })
    expect((await lib.update(a.id, { posts: { tiktok: { status: 'posted' } } }))?.posts.tiktok.status).toBe('posted')
    expect(await lib.update(a.id, { posts: { reels: { status: 'posted' } } })).toBeNull()
    expect(await readdir(dir)).toEqual([])
  })

  it('refuses ids that could reach outside the library', async () => {
    const lib = createLibrary({ dir })
    await expect(lib.update('../../etc', {})).rejects.toThrow('Bad id')
  })

  it('cleans what the page sends', () => {
    expect(cleanPost({ status: 'hacked', url: 'javascript:x', hashtags: [1] })).toMatchObject({ status: 'none', url: null, hashtags: ['1'] })
  })
})
