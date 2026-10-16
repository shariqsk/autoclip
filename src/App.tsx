import { ClipBin } from './components/ClipBin'
import { Drafts } from './components/Drafts'
import { Downloads } from './components/Downloads'
import { DropOverlay } from './components/DropOverlay'
import { ExportDialog } from './components/ExportDialog'
import { Header } from './components/Header'
import { HelpDialog } from './components/HelpDialog'
import { LinkDialog } from './components/LinkDialog'
import { Player } from './components/Player'
import { Rail } from './components/rail/Rail'
import { SongCard } from './components/SongCard'
import { Tape } from './components/tape/Tape'
import { Toasts } from './components/Toasts'
import { Welcome } from './components/Welcome'
import { useHotkeys } from './hooks/useHotkeys'
import { usePasteLinks } from './hooks/usePasteLinks'
import { useTheme } from './hooks/useTheme'
import { useApp } from './state/store'

/** What the stage says before there's a take to show. */
function StageHint() {
  const song = useApp((s) => s.song)
  const clips = useApp((s) => s.clips)
  const drafts = useApp((s) => s.drafts.length)
  if (drafts) return null
  const watching = clips.some((c) => c.status === 'queued' || c.status === 'analyzing')
  const [big, small] = !song
    ? ['Needs a song', 'Drop an MP3, M4A or WAV']
    : !clips.length
      ? ['Needs footage', 'Drop videos or photos']
      : song.status !== 'ready' || watching
        ? ['Rolling…', 'Listening and watching. The cut makes itself.']
        : ['Ready', 'Hit Cut it']
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 bottom-[4.6rem] grid place-items-center">
      <div className="text-center">
        <div className="head slam text-6xl">{big}</div>
        <div className="tag mt-3">{small}</div>
      </div>
    </div>
  )
}

export default function App() {
  const { theme, setTheme, cycle } = useTheme()
  const started = useApp((s) => !!s.song || s.clips.length > 0 || s.demoLoading !== null)
  const hasTake = useApp((s) => s.drafts.length > 0)
  useHotkeys(cycle)
  usePasteLinks()

  return (
    <div className="grain flex h-full flex-col">
      <Header theme={theme} setTheme={setTheme} />
      {!started ? (
        <main className="flex-1 overflow-y-auto">
          <Welcome />
        </main>
      ) : (
        <>
          <main className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[300px_minmax(0,1fr)_340px] lg:overflow-hidden">
            <aside className="flex flex-col border-line lg:min-h-0 lg:border-r">
              <Downloads />
              <SongCard />
              <ClipBin />
            </aside>
            <section className="relative order-first flex min-h-[78vh] min-w-0 flex-col border-b border-line lg:order-none lg:min-h-0 lg:border-b-0">
              <Player />
              <StageHint />
              <Drafts />
            </section>
            <aside className="flex flex-col border-t border-line lg:min-h-0 lg:border-t-0 lg:border-l">
              <Rail />
            </aside>
          </main>
          {hasTake && <Tape />}
        </>
      )}
      <ExportDialog />
      <HelpDialog />
      <LinkDialog />
      <DropOverlay />
      <Toasts />
    </div>
  )
}
