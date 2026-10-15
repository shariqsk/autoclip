// Director mode: the manual editor, hidden until you want it. The auto-edit is always the starting
// point; here you can move cuts, swap shots, change speed, transitions and effects, fix captions,
// and lock what you like before remixing the rest.

import { Minus, Plus, Redo2, Undo2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { redo, resetCaptions, undo } from '../../state/actions'
import { useRenderProject } from '../../hooks/useRenderProject'
import { setState } from '../../state/store'
import { Inspector } from './Inspector'
import { Timeline } from './Timeline'

export function Director() {
  const { draft, plan: rendered } = useRenderProject()
  const [zoom, setZoom] = useState(2)
  // Edit the draft's own shots (not the intensity-scaled ones), with the rendered captions.
  const plan = useMemo(() => draft && rendered && { ...draft.plan, captions: rendered.captions }, [draft, rendered])
  if (!draft || !plan) return null
  return (
    <div className="panel rise grid min-h-0 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-h-0 min-w-0 flex-col">
        <div className="flex items-center gap-1.5 border-b border-line px-3 py-2">
          <span className="label mr-2">Director</span>
          <button className="btn btn-ghost btn-sm btn-icon" disabled={!draft.past.length} onClick={undo} title="Undo (⌘Z)">
            <Undo2 className="size-4" />
          </button>
          <button className="btn btn-ghost btn-sm btn-icon" disabled={!draft.future.length} onClick={redo} title="Redo (⇧⌘Z)">
            <Redo2 className="size-4" />
          </button>
          {draft.captionsOverride && (
            <button className="btn btn-ghost btn-sm" onClick={resetCaptions} title="Throw away caption edits and regenerate them">
              Reset captions
            </button>
          )}
          <div className="ml-auto flex items-center gap-1">
            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setZoom((z) => Math.max(0.5, z / 1.3))} title="Zoom out">
              <Minus className="size-3.5" />
            </button>
            <span className="w-10 text-center font-mono text-[0.7rem] text-ink-3">{Math.round(zoom * 50)}%</span>
            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setZoom((z) => Math.min(12, z * 1.3))} title="Zoom in">
              <Plus className="size-3.5" />
            </button>
            <button
              className="btn btn-ghost btn-sm btn-icon ml-2"
              onClick={() => setState({ director: false })}
              title="Close director mode (D)"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 p-3">
          <Timeline plan={plan} zoom={zoom} onZoom={setZoom} />
        </div>
      </div>
      <div className="max-h-[44vh] min-h-0 overflow-y-auto border-t border-line p-4 lg:max-h-none lg:border-t-0 lg:border-l">
        <Inspector plan={plan} />
      </div>
    </div>
  )
}
