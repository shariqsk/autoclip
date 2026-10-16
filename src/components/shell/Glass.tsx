// Glass: the edit itself, blurred, fills the window; everything else floats over it on frosted glass.

import { ArrowRight } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { playhead } from '../../state/playhead'
import { useChooseFiles } from '../../hooks/useChooseFiles'
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

/** Copies the preview into a tiny canvas a few times a second; CSS blurs it into ambient light. */
function Backdrop() {
  const ref = useRef<HTMLCanvasElement>(null)
  const hasTake = useApp((s) => s.drafts.length > 0)
  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    let last = 0
    let raf = 0
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (now - last < 90) return
      last = now
      const src = playhead.engine?.canvas
      if (!src || !src.width || !hasTake) return
      ctx.globalAlpha = 0.35
      ctx.drawImage(src, 0, 0, canvas.width, canvas.height)
    }
    if (!hasTake) ctx.clearRect(0, 0, canvas.width, canvas.height)
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [hasTake])
  return (
    <div className="glass-backdrop" aria-hidden="true">
      <div className="glass-orb glass-orb-a" />
      <div className="glass-orb glass-orb-b" />
      <div className="glass-orb glass-orb-c" />
      <canvas ref={ref} width={48} height={27} className="glass-mirror" data-on={hasTake} />
    </div>
  )
}

function Bar() {
  return (
    <header className="glass-bar">
      <span className="glass-logo">AutoClip</span>
      <Status className="glass-status hidden md:flex" />
      <TopActions className="ml-auto" />
    </header>
  )
}

function Welcome() {
  const files = useChooseFiles()
  return (
    <main className="glass-welcome">
      <div className="glass-welcome-card">
        <h1 className="glass-welcome-title">
          Music in.
          <br />
          Edit out.
        </h1>
        <p className="mx-auto mt-5 max-w-md text-[1.05rem] leading-relaxed text-ink-2">
          Drop a song and your clips. AutoClip finds the beats and the drop and cuts the edit for you, right here on your device.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button className="slab" onClick={files.open}>
            Choose files <ArrowRight className="size-5" />
          </button>
          <DemoButton className="h-12 px-6" />
          {files.input}
        </div>
        <DemoProgress className="mx-auto mt-5 max-w-sm" />
        <StartExtras className="mx-auto mt-5 max-w-md text-left" />
      </div>
    </main>
  )
}

export function GlassShell({ started }: { started: boolean }) {
  const hasTake = useApp((s) => s.drafts.length > 0)
  return (
    <div className="glass-page">
      <Backdrop />
      <Bar />
      {!started ? (
        <Welcome />
      ) : (
        <>
          <main className="glass-main">
            <aside className="glass-panel">
              <Downloads />
              <SongCard />
              <ClipBin />
            </aside>
            <section className="glass-centre">
              <div className="relative flex min-h-[56vh] flex-1 flex-col lg:min-h-0">
                <Stage className="glass-stage" />
                <StageHint />
              </div>
              <div className="glass-dock">
                <Transport className="glass-transport" showTime={false} />
                <span className="glass-dock-sep" />
                <TakeList variant="glass" className="min-w-0 flex-1" />
                <TakeActions />
                <ExportButton className="btn-sm" />
                <CutButton className="glass-cut" />
              </div>
            </section>
            <aside className="glass-panel">
              <Rail />
            </aside>
          </main>
          {hasTake && <Tape className="glass-tape" />}
        </>
      )}
    </div>
  )
}
