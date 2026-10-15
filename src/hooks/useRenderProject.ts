// The active draft as it will render: captions and intensity applied, look and caption options resolved.

import { useMemo } from 'react'
import { captionOptionsFor, lookFor, renderPlan } from '../state/derive'
import { activeDraft, useApp } from '../state/store'

export function useRenderProject() {
  const draft = useApp((s) => activeDraft(s))
  const settings = useApp((s) => s.settings)
  const words = useApp((s) => s.words)
  const fileCaptions = useApp((s) => s.fileCaptions)
  const song = useApp((s) => s.song)
  const plan = useMemo(
    () => (draft ? renderPlan(draft, { settings, words, fileCaptions, song }) : null),
    [draft, settings, words, fileCaptions, song],
  )
  const look = useMemo(() => (draft ? lookFor(draft.style, settings) : null), [draft, settings])
  const captions = useMemo(() => (draft ? captionOptionsFor(draft.style, settings) : null), [draft, settings])
  return { draft, plan, look, captions }
}
