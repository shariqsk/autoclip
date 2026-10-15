import { DropOverlay } from './components/DropOverlay'
import { ExportDialog } from './components/ExportDialog'
import { HelpDialog } from './components/HelpDialog'
import { LinkDialog } from './components/LinkDialog'
import { BeatPulse } from './components/shell/common'
import { DeckShell } from './components/shell/Deck'
import { FlyerShell } from './components/shell/Flyer'
import { GlassShell } from './components/shell/Glass'
import { StudioShell } from './components/shell/Studio'
import { Toasts } from './components/Toasts'
import { useHotkeys } from './hooks/useHotkeys'
import { usePasteLinks } from './hooks/usePasteLinks'
import { useTakePosters } from './hooks/useTakePosters'
import { useLook } from './hooks/useTheme'
import { useApp } from './state/store'

const SHELLS = { deck: DeckShell, studio: StudioShell, flyer: FlyerShell, glass: GlassShell }

export default function App() {
  const { layout, cycle } = useLook()
  const started = useApp((s) => !!s.song || s.clips.length > 0 || s.demoLoading !== null)
  useHotkeys(cycle)
  usePasteLinks()
  useTakePosters()
  const Shell = SHELLS[layout]

  return (
    <div className="grain h-full">
      <Shell started={started} />
      <BeatPulse />
      <ExportDialog />
      <HelpDialog />
      <LinkDialog />
      <DropOverlay />
      <Toasts />
    </div>
  )
}
