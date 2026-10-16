// Flyer: a Y2K club flyer. Chrome type, a holo wash, stickers for styles, polaroids for takes, and a
// stage that bumps on every beat of the edit.

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

function Backdrop() {
  return (
    <div className="flyer-backdrop" aria-hidden="true">
      <div className="flyer-holo" />
      {[0, 1, 2].map((row) => (
        <div key={row} className="flyer-outline-row" data-row={row}>
          <div className="marquee flex w-max">
            {Array.from({ length: 8 }, (_, i) => (
              <span key={i}>AUTOCLIP</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function Top() {
  return (
    <header className="flyer-top">
      <span className="flyer-logo">
        Auto<span>clip</span>
      </span>
      <div className="flyer-ticket hidden min-w-0 md:flex">
        <Status />
      </div>
      <TopActions className="flyer-actions ml-auto" />
    </header>
  )
}

function Welcome() {
  const files = useChooseFiles()
  return (
    <main className="flyer-welcome">
      <div className="flyer-poster">
        <div className="flyer-kicker">Free entry · all night · on your device</div>
        <h1 className="flyer-headline">
          <span>Drop a song</span>
          <span>Drop the tape</span>
          <span className="flyer-chrome">Get the cut</span>
        </h1>
        <span className="flyer-burst" aria-hidden="true">
          No
          <br />
          uploads
        </span>
        <p className="mt-6 max-w-xl text-lg leading-snug font-medium">
          AutoClip hears the build and the drop, finds the best moments in your footage and cuts a beat-synced edit on its own.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <button className="slab" onClick={files.open}>
            Choose files <ArrowRight className="size-6" />
          </button>
          <DemoButton className="h-12 px-6" />
          {files.input}
        </div>
        <DemoProgress className="mt-5 max-w-md" />
        <StartExtras className="mt-5 max-w-xl" />
      </div>
      <ul className="flyer-lineup">
        <li className="flyer-lineup-head">Line-up</li>
        {FEATURES.map(([name, body], i) => (
          <li key={name} style={{ ['--tilt' as string]: `${[-2, 1.5, -1, 2, -1.5, 1, -2, 1.5][i]}deg` }}>
            <span className="flyer-lineup-name">{name}</span>
            <span className="text-sm leading-snug opacity-75">{body}</span>
          </li>
        ))}
      </ul>
    </main>
  )
}

export function FlyerShell({ started }: { started: boolean }) {
  const hasTake = useApp((s) => s.drafts.length > 0)
  return (
    <div className="flyer-page">
      <Backdrop />
      <Top />
      {!started ? (
        <Welcome />
      ) : (
        <>
          <main className="flyer-main">
            <aside className="flyer-col">
              <Downloads className="flyer-card" />
              <SongCard />
              <ClipBin />
            </aside>
            <section className="flyer-centre">
              <div className="flyer-stage relative flex min-h-[56vh] flex-1 flex-col lg:min-h-0">
                <Stage />
                <StageHint />
              </div>
              <div className="flyer-controls">
                <Transport className="flyer-transport flex-1" />
                <TakeActions />
                <ExportButton />
                <CutButton className="flyer-cut" />
              </div>
              <TakeList variant="flyer" />
            </section>
            <aside className="flyer-col">
              <Rail />
            </aside>
          </main>
          {hasTake && <Tape className="flyer-tape" />}
        </>
      )}
    </div>
  )
}
