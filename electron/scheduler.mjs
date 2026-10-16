// Scheduled posts. Every half minute, anything whose time has come goes out: through a connected
// account when there is one, otherwise as a nudge (a notification that, when clicked, shows the
// video, copies its caption and opens the platform's upload page).

export const UPLOAD_PAGE = {
  tiktok: 'https://www.tiktok.com/upload',
  reels: 'https://www.instagram.com/',
  shorts: 'https://www.youtube.com/upload',
}
export const PLATFORM_NAME = { tiktok: 'TikTok', reels: 'Instagram', shorts: 'YouTube Shorts' }

/** Posts whose time has come, oldest first. */
export function duePosts(items, now) {
  const out = []
  for (const item of items)
    for (const [platform, post] of Object.entries(item.posts))
      if (post.status === 'scheduled' && post.at !== null && post.at <= now) out.push({ id: item.id, platform, at: post.at })
  return out.sort((a, b) => a.at - b.at)
}

/** What to paste: the title (Shorts), the caption, then the hashtags. */
export function textFor(post, platform) {
  const tags = post.hashtags.map((t) => `#${t}`).join(' ')
  return [platform === 'shorts' ? post.title : '', post.caption, tags].filter(Boolean).join('\n\n')
}

/**
 * Start the clock. `upload(item, platform)` posts through a connected account and returns the post's
 * URL, or null when no account is connected (then it's a nudge). `nudge(item, platform)` tells you.
 */
export function startScheduler({ library, upload, nudge, every = 30_000, log = () => {} }) {
  // One pass at a time: a tick while one is running waits for that one.
  let running = null
  const tick = () => (running ??= pass().finally(() => (running = null)))
  async function pass() {
    try {
      for (const { id, platform } of duePosts(await library.list(), Date.now())) {
        const item = await library.read(id)
        await library.update(id, { posts: { [platform]: { status: 'posting', error: null } } })
        try {
          const url = await upload(item, platform)
          if (url !== null) await library.update(id, { posts: { [platform]: { status: 'posted', postedAt: Date.now(), url } } })
          else {
            await library.update(id, { posts: { [platform]: { status: 'due' } } })
            nudge(item, platform)
          }
        } catch (err) {
          log(`post ${id} to ${platform} failed: ${err.message}`)
          await library.update(id, { posts: { [platform]: { status: 'failed', error: err.message } } })
        }
      }
    } catch (err) {
      log(`scheduler: ${err.message}`)
    }
  }
  const timer = setInterval(tick, every)
  void tick()
  return { tick, stop: () => clearInterval(timer) }
}
