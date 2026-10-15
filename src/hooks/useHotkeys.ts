// Keyboard shortcuts. Ignored while typing in a field.

import { useEffect } from 'react'
import { removeShot, splitShot, updateShot } from '../lib/edit/ops'
import { compareTakes, deleteDraft, editPlan, makeEdit, redo, selectDraft, undo } from '../state/actions'
import { playhead } from '../state/playhead'
import { activeDraft, getState, setState } from '../state/store'

export function useHotkeys(cycleTheme: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]')) return
      const s = getState()
      if (s.exportOpen) return
      const mod = e.metaKey || e.ctrlKey
      const d = activeDraft(s)
      const shotIdx = d ? d.plan.shots.findIndex((x) => x.id === s.selectedShotId) : -1
      const shot = shotIdx >= 0 ? d!.plan.shots[shotIdx] : null

      if (mod && e.key === '.') {
        e.preventDefault()
        cycleTheme()
      } else if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (mod) {
        return
      } else if (e.key === ' ') {
        e.preventDefault()
        playhead.toggle()
      } else if (e.key === 'r' || e.key === 'R') {
        if (s.song?.analysis && s.clips.some((c) => c.status === 'ready')) makeEdit({ remix: s.drafts.length > 0 })
      } else if (e.key === 'e' || e.key === 'E') {
        if (d) setState({ exportOpen: true })
      } else if (e.key === 'd' || e.key === 'D') {
        if (d) setState({ director: !s.director })
      } else if (e.key === 'c' || e.key === 'C') {
        compareTakes()
      } else if (e.key === '?') {
        setState({ helpOpen: !s.helpOpen })
      } else if (e.key === '[' || e.key === ']') {
        const i = s.drafts.findIndex((x) => x.id === s.activeDraftId)
        const next = s.drafts[i + (e.key === ']' ? 1 : -1)]
        if (next) selectDraft(next.id)
      } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && d) {
        e.preventDefault()
        const cur = shotIdx >= 0 ? shotIdx : d.plan.shots.findIndex((x) => playhead.time >= x.start && playhead.time < x.end)
        const next = d.plan.shots[Math.max(0, Math.min(d.plan.shots.length - 1, cur + (e.key === 'ArrowRight' ? 1 : -1)))]
        if (next) {
          setState({ selectedShotId: next.id, selectedCaptionId: null })
          playhead.seek(next.start + 0.001)
        }
      } else if ((e.key === 's' || e.key === 'S') && shot) {
        editPlan((p) => splitShot(p, shot.id, playhead.time))
      } else if ((e.key === 'l' || e.key === 'L') && shot) {
        editPlan((p) => updateShot(p, shot.id, { locked: !shot.locked }))
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && e.shiftKey && d) {
        deleteDraft(d.id)
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && shot) {
        editPlan((p) => removeShot(p, shot.id))
        setState({ selectedShotId: null })
      } else if (e.key === 'Escape') {
        setState({ selectedShotId: null, selectedCaptionId: null })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cycleTheme])
}
