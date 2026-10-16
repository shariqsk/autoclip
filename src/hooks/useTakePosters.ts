import { useEffect } from 'react'
import { playhead } from '../state/playhead'
import { updateDraft, useApp } from '../state/store'

/** Give each take a poster: its drop, once that frame has actually rendered. */
export function useTakePosters() {
  const drafts = useApp((s) => s.drafts)
  const activeId = useApp((s) => s.activeDraftId)
  useEffect(() => {
    const d = drafts.find((x) => x.id === activeId)
    if (!d || d.thumb) return
    const hero = d.plan.hits.find((h) => h.kind === 'drop')?.time ?? (d.plan.shots[1]?.start ?? 0) + 0.2
    let cancelled = false
    const timer = setTimeout(() => {
      playhead.engine?.capture(hero + 0.3).then((thumb) => !cancelled && updateDraft(d.id, { thumb }))
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [activeId, drafts])
}
