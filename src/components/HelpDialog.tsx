import { X } from 'lucide-react'
import { setState, useApp } from '../state/store'
import { Modal } from './Modal'
import { Kbd } from './ui'

const KEYS: [string[], string][] = [
  [['Space'], 'Play / pause'],
  [['R'], 'Remix (new draft, keeps locked shots)'],
  [['E'], 'Export'],
  [['D'], 'Director mode'],
  [['[', ']'], 'Previous / next draft'],
  [['←', '→'], 'Previous / next shot'],
  [['S'], 'Split the shot at the playhead'],
  [['L'], 'Lock / unlock the shot'],
  [['⌫'], 'Remove the shot'],
  [['⌘', 'Z'], 'Undo (⇧ to redo)'],
  [['⌘', '.'], 'Change the look'],
  [['?'], 'This help'],
]

export function HelpDialog() {
  const open = useApp((s) => s.helpOpen)
  if (!open) return null
  const close = () => setState({ helpOpen: false })
  return (
    <Modal onClose={close} labelledBy="help-title">
      <div className="flex items-start justify-between">
        <h2 id="help-title" className="display text-xl">
          How AutoClip cuts
        </h2>
        <button className="btn btn-ghost btn-icon" onClick={close} aria-label="Close">
          <X className="size-4" />
        </button>
      </div>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-snug text-ink-2">
        <li>It finds the tempo, beats, bars, sections and drops in your song, and picks the best part for the length you want.</li>
        <li>
          It scores every second of your footage for motion, bursts of action, crowd noise and sharpness, and spots cuts already inside
          clips.
        </li>
        <li>
          Cuts land on the beat: slower in quiet parts, every beat in drops, speeding up through builds. The best moment in all your footage
          goes on the drop.
        </li>
        <li>Effects follow the music: punches on beats, shakes and flashes on hits. Remix for a new take; lock shots you love first.</li>
      </ol>
      <h3 className="label mt-6 mb-2">Shortcuts</h3>
      <div className="grid gap-1.5 text-sm">
        {KEYS.map(([keys, what]) => (
          <div key={what} className="flex items-center justify-between gap-4">
            <span className="text-ink-2">{what}</span>
            <span className="flex gap-1">
              {keys.map((k) => (
                <Kbd key={k}>{k}</Kbd>
              ))}
            </span>
          </div>
        ))}
      </div>
    </Modal>
  )
}
