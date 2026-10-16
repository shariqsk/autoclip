// Auto-scheduling: spread a batch of edits over the coming days at times people are scrolling, one
// per slot, so they don't all land at once and compete with each other.

/** Local hours that do well on short-form platforms: lunchtime and the evening. */
export const POST_HOURS = [12, 19]

/**
 * The next `count` posting slots after `now` (ms), at least `leadMinutes` away, at POST_HOURS each
 * day, skipping any already taken. Returns times in ms.
 */
export function autoSlots(count: number, now: number, opts: { hours?: number[]; leadMinutes?: number; taken?: number[] } = {}): number[] {
  const hours = [...(opts.hours ?? POST_HOURS)].sort((a, b) => a - b)
  const earliest = now + (opts.leadMinutes ?? 15) * 60_000
  const taken = new Set((opts.taken ?? []).map((t) => Math.round(t / 60_000)))
  const out: number[] = []
  const day = new Date(now)
  day.setHours(0, 0, 0, 0)
  for (let d = 0; out.length < count && d < 366; d++) {
    for (const h of hours) {
      const slot = new Date(day)
      slot.setDate(day.getDate() + d)
      slot.setHours(h, 0, 0, 0)
      const t = slot.getTime()
      if (t >= earliest && !taken.has(Math.round(t / 60_000))) out.push(t)
      if (out.length === count) break
    }
  }
  return out
}

/** "Today 7:00 PM", "Tomorrow 12:00 PM", "Fri 7:00 PM", or a date further out. */
export function whenLabel(t: number, now = Date.now()): string {
  const d = new Date(t)
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const days = Math.floor((d.getTime() - today.getTime()) / 86_400_000)
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (days === 0) return `Today ${time}`
  if (days === 1) return `Tomorrow ${time}`
  if (days > 1 && days < 7) return `${d.toLocaleDateString([], { weekday: 'short' })} ${time}`
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`
}
