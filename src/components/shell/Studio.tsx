// Studio: a pro editor. Media pool on the left, the viewer with take tabs in the middle, an inspector
// on the right and the timeline always docked along the bottom.

import { Clapperboard, FolderOpen } from 'lucide-react'
import { useChooseFiles } from '../../hooks/useChooseFiles'
import { FEATURES } from './features'
import { useApp } from '../../state/store'
import { ClipBin } from '../ClipBin'
import { CutButton, ExportButton, TakeActions, TakeList } from '../Drafts'
import { Downloads } from '../Downloads'
import { Stage, Transport } from '../Player'
import { Rail } from '../rail/Rail'
import { SongCard } from '../SongCard'
import { Tape } from '../tape/Tape'
import { Status, TopActions } from './common'
import { DemoButton, DemoProgress, StageHint, StartExtras } from './Start'

function Bar({ started }: { started: boolean }) {
  return (
    <header className="studio-bar">
      <span className="studio-logo">
        <span className="studio-logo-mark" />
        AutoClip
      </span>
      <span className="studio-sep" />
      <Status className="studio-status" />
      <div className="ml-auto flex items-center gap-1.5">
        {started && (
          <>
            <CutButton className="studio-cut" label={['Cut', 'Remix']} />
            <ExportButton className="btn-sm" />
            <span className="studio-sep" />
          </>
        )}
        <TopActions />
      </div>
    </header>
  )
}

function PaneHead({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="studio-pane-head">
      <span>{title}</span>
      {children}
    </div>
  )
}

// A static sketch of an edit for the empty project: shots snapping to a beat grid.
const SKETCH = [4, 4, 4, 2, 2, 2, 2, 1, 1, 1, 1, 6, 1, 1, 2, 1, 1, 2, 4].map((w, i, all) => ({
  w,
  left: all.slice(0, i).reduce((a, b) => a + b, 0),
}))

function Welcome() {
  const files = useChooseFiles()
  return (
    <main className="studio-welcome">
      <div className="studio-welcome-card">
        <div className="tag">New project</div>
        <h1 className="head mt-3 text-[clamp(2rem,3.6vw,3.2rem)] leading-[1.02]">
          Beat-synced edits,
          <br />
          <span className="text-ink-3">cut for you.</span>
        </h1>
        <p className="mt-4 max-w-md text-[0.95rem] leading-relaxed text-ink-2">
          Drop a song and your footage. AutoClip hears the beats, the build and the drop, finds the best moments and cuts a full edit. Then
          you fine-tune, or don't.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <button className="btn btn-signal h-10 px-5" onClick={files.open}>
            <FolderOpen className="size-4" /> Import media
          </button>
          <DemoButton className="h-10 px-4">
            <Clapperboard className="size-4" /> Open the demo
          </DemoButton>
          {files.input}
        </div>
        <DemoProgress className="mt-4" />
        <StartExtras className="mt-4" />
        <p className="mt-5 text-xs text-ink-3">Or drag everything onto the window. Nothing leaves your device.</p>
      </div>
      <div className="studio-welcome-side">
        <div className="studio-sketch" aria-hidden="true">
          <div className="studio-sketch-ruler">
            {Array.from({ length: 12 }, (_, i) => (
              <span key={i}>{String(i + 1).padStart(2, '0')}:00</span>
            ))}
          </div>
          <div className="studio-sketch-track">
            {SKETCH.map(({ w, left }, i) => (
              <span
                key={i}
                className={i === 11 ? 'studio-sketch-hero' : ''}
                style={{ left: `${(left / 42) * 100}%`, width: `${(w / 42) * 100}%` }}
              />
            ))}
          </div>
          <div className="studio-sketch-wave" />
          <div className="studio-sketch-head" />
        </div>
        <ul className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3">
          {FEATURES.map(([name, body]) => (
            <li key={name}>
              <div className="text-sm font-semibold">{name}</div>
              <div className="text-xs leading-snug text-ink-3">{body}</div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}

export function StudioShell({ started }: { started: boolean }) {
  const hasTake = useApp((s) => s.drafts.length > 0)
  return (
    <div className="studio-app">
      <Bar started={started} />
      {!started ? (
        <Welcome />
      ) : (
        <>
          <main className="studio-main">
            <aside className="studio-pane">
              <PaneHead title="Media" />
              <div className="min-h-0 flex-1 overflow-y-auto">
                <Downloads />
                <SongCard />
                <ClipBin />
              </div>
            </aside>
            <section className="studio-viewer">
              <div className="studio-tabs">
                <TakeList variant="studio" className="min-w-0 flex-1" />
                <TakeActions />
              </div>
              <div className="relative flex min-h-[56vh] flex-1 flex-col lg:min-h-0">
                <Stage />
                <StageHint />
              </div>
              <Transport className="studio-transport" />
            </section>
            <aside className="studio-pane">
              <Rail className="flex-1" />
            </aside>
          </main>
          {hasTake && <Tape className="studio-tape" />}
        </>
      )}
    </div>
  )
}
