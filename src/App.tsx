import { ClipBin } from './components/ClipBin'
import { Director } from './components/director/Director'
import { Drafts } from './components/Drafts'
import { DropOverlay } from './components/DropOverlay'
import { ExportDialog } from './components/ExportDialog'
import { Header } from './components/Header'
import { HelpDialog } from './components/HelpDialog'
import { Player } from './components/Player'
import { SongCard } from './components/SongCard'
import { Toasts } from './components/Toasts'
import { cx } from './components/format'
import { VibePanel } from './components/vibe/VibePanel'
import { Welcome } from './components/Welcome'
import { useHotkeys } from './hooks/useHotkeys'
import { useTheme } from './hooks/useTheme'
import { useApp } from './state/store'

function StageHint() {
  const song = useApp((s) => s.song)
  const clips = useApp((s) => s.clips)
  const drafts = useApp((s) => s.drafts.length)
  if (drafts) return null
  const watching = clips.some((c) => c.status === 'queued' || c.status === 'analyzing')
  const text = !song
    ? 'Now add a song: drop an MP3, M4A or WAV.'
    : !clips.length
      ? 'Now add your footage: videos or photos.'
      : song.status !== 'ready' || watching
        ? 'Listening and watching… the edit will cut itself in a moment.'
        : null
  if (!text) return null
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center p-6">
      <div className="panel rise max-w-xs px-5 py-4 text-center text-sm">{text}</div>
    </div>
  )
}

export default function App() {
  const { theme, setTheme, cycle } = useTheme()
  const started = useApp((s) => !!s.song || s.clips.length > 0 || s.demoLoading !== null)
  const director = useApp((s) => s.director && s.drafts.length > 0)
  useHotkeys(cycle)

  return (
    <div className="flex h-full flex-col">
      <Header theme={theme} setTheme={setTheme} />
      {!started ? (
        <main className="flex-1 overflow-y-auto">
          <Welcome />
        </main>
      ) : (
        <main
          className={cx(
            'grid min-h-0 flex-1 auto-rows-max gap-3 overflow-y-auto px-3 pb-3 sm:px-4 sm:pb-4 lg:auto-rows-auto lg:overflow-hidden',
            'lg:grid-cols-[290px_minmax(0,1fr)_330px]',
            director ? 'lg:grid-rows-[minmax(0,1fr)_minmax(250px,40vh)]' : 'lg:grid-rows-[minmax(0,1fr)]',
          )}
        >
          <aside className="flex flex-col gap-3 lg:min-h-0">
            <SongCard />
            <ClipBin />
          </aside>
          <section className="relative flex min-h-[60vh] min-w-0 flex-col gap-3 lg:min-h-0">
            <Player />
            <StageHint />
            <Drafts />
          </section>
          <aside className="flex min-h-[420px] flex-col lg:min-h-0">
            <VibePanel />
          </aside>
          {director && (
            <div className="min-h-[360px] lg:col-span-3 lg:min-h-0">
              <Director />
            </div>
          )}
        </main>
      )}
      <ExportDialog />
      <HelpDialog />
      <DropOverlay />
      <Toasts />
    </div>
  )
}
