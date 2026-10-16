import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createLibrary } from './library.mjs'
import { duePosts, startScheduler, textFor } from './scheduler.mjs'

let dir
beforeEach(async () => (dir = await mkdtemp(path.join(os.tmpdir(), 'autoclip-sched-'))))
afterEach(() => rm(dir, { recursive: true, force: true }))

const video = new Uint8Array([1])

describe('scheduler', () => {
  it('finds posts whose time has come, oldest first', () => {
    const items = [
      { id: 'a', posts: { tiktok: { status: 'scheduled', at: 20 }, reels: { status: 'scheduled', at: 99 } } },
      { id: 'b', posts: { tiktok: { status: 'scheduled', at: 10 }, reels: { status: 'posted', at: 1 } } },
    ]
    expect(duePosts(items, 50)).toEqual([
      { id: 'b', platform: 'tiktok', at: 10 },
      { id: 'a', platform: 'tiktok', at: 20 },
    ])
  })

  it('posts through an account, nudges without one, and records failures', async () => {
    const library = createLibrary({ dir })
    const a = await library.add({ video, name: 'A' })
    await library.update(a.id, { posts: { tiktok: { status: 'scheduled', at: 1 }, reels: { status: 'scheduled', at: 2 }, shorts: { status: 'scheduled', at: 3 } } })
    const nudged = []
    const s = startScheduler({
      library,
      every: 1e9,
      upload: async (_item, p) => {
        if (p === 'shorts') throw new Error('quota')
        return p === 'tiktok' ? 'https://tiktok.com/@me/video/1' : null
      },
      nudge: (_item, p) => nudged.push(p),
    })
    await s.tick()
    s.stop()
    const item = await library.read(a.id)
    expect(item.posts.tiktok).toMatchObject({ status: 'posted', url: 'https://tiktok.com/@me/video/1' })
    expect(item.posts.reels.status).toBe('due')
    expect(item.posts.shorts).toMatchObject({ status: 'failed', error: 'quota' })
    expect(nudged).toEqual(['reels'])
  })

  it('writes the text to paste', () => {
    expect(textFor({ caption: 'hi', hashtags: ['a', 'b'], title: 'T #shorts' }, 'shorts')).toBe('T #shorts\n\nhi\n\n#a #b')
    expect(textFor({ caption: 'hi', hashtags: [], title: 'T' }, 'tiktok')).toBe('hi')
  })
})
