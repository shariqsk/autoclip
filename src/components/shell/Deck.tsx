// Deck: AutoClip as a piece of hardware. A chassis with an LCD, a screen in a bezel, keys for the
// styles, knobs for the look and the mix, and a row of pads, one per take.

import { ArrowRight } from 'lucide-react'
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

function Plate() {
  return (
    <header className="deck-plate">
      <div className="flex shrink-0 items-baseline gap-3">
        <span className="deck-brand whitespace-nowrap">autoclip</span>
        <span className="deck-model tag hidden sm:inline">AC-1 · beat sampler</span>
      </div>
      <div className="deck-lcd hidden min-w-0 flex-1 md:flex">
        <span className="deck-beat-led" />
        <Status className="lcd text-lg" />
      </div>
      <TopActions className="ml-auto" />
    </header>
  )
}

function Welcome() {
  const files = useChooseFiles()
  return (
    <main className="deck-welcome">
      <section className="deck-module deck-welcome-main">
        <div className="deck-screen deck-welcome-screen">
          <div className="lcd deck-welcome-lcd">
            <div className="text-[clamp(2.4rem,5vw,4.4rem)] leading-[0.9]">
              INSERT SONG
              <br />+ FOOTAGE<span className="deck-cursor">_</span>
            </div>
            <div className="mt-4 text-xl opacity-70">Beat-synced edits, cut on your device</div>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button className="slab" onClick={files.open}>
            Load files <ArrowRight className="size-5" />
          </button>
          <DemoButton className="deck-btn h-auto self-stretch px-5" />
          {files.input}
        </div>
        <DemoProgress className="mt-4" />
        <StartExtras className="mt-4" />
        <p className="tag mt-4">Or drag a song and your clips onto the window, all at once.</p>
      </section>
      <section className="deck-module">
        <div className="tag mb-3">What's inside</div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-2">
          {FEATURES.map(([name, body], i) => (
            <div key={name} className="deck-pad deck-pad-demo" style={{ animationDelay: `${i * 0.25}s` }} title={body}>
              <span className="deck-pad-led" />
              <span className="lcd text-lg leading-none">{String(i + 1).padStart(2, '0')}</span>
              <span className="tag truncate">{name}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}

export function DeckShell({ started }: { started: boolean }) {
  const hasTake = useApp((s) => s.drafts.length > 0)
  return (
    <div className="deck-room">
      <div className="deck-chassis">
        <Plate />
        {!started ? (
          <Welcome />
        ) : (
          <main className="deck-main">
            <aside className="deck-col">
              <Downloads className="deck-module" />
              <SongCard />
              <ClipBin />
            </aside>
            <section className="deck-centre">
              <div className="deck-screen relative flex min-h-[56vh] flex-1 flex-col lg:min-h-0">
                <Stage />
                <StageHint />
              </div>
              <div className="deck-controls">
                <Transport className="flex-1" />
                <TakeActions />
                <ExportButton className="deck-btn" />
              </div>
              <div className="deck-padrow">
                <TakeList variant="deck" className="flex-1" />
                <CutButton className="deck-cut" />
              </div>
            </section>
            <aside className="deck-col deck-col-right">
              <Rail className="space-y-3" />
            </aside>
          </main>
        )}
        {started && hasTake && <Tape className="deck-tape" />}
      </div>
    </div>
  )
}
