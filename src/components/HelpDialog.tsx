import { CAPTION_MODELS, TTS_MODEL } from '../lib/ml/models'
import { setState, useApp } from '../state/store'
import { Modal } from './Modal'
import { Kbd } from './ui'

const KEYS: [string[], string][] = [
  [['Space'], 'Play / pause'],
  [['R'], 'Remix: shoot a new take, locked shots stay'],
  [['C'], 'Compare: flip to the previous take'],
  [['E'], 'Export'],
  [['D'], 'Director'],
  [['[', ']'], 'Previous / next take'],
  [['⇧', '⌫'], 'Delete the take on screen'],
  [['←', '→'], 'Previous / next shot'],
  [['S'], 'Split the shot at the playhead'],
  [['L'], 'Lock / unlock the shot'],
  [['⌫'], 'Remove the shot'],
  [['⌘', 'Z'], 'Undo (with ⇧ to redo)'],
  [['⌘', '.'], 'Change the look'],
]

const ARC: [string, string][] = [
  ['Cold open', 'A split second of the action, so nobody scrolls past.'],
  ['Intro', 'Long holds on bar lines, slowed and often in black and white: meet the fighter.'],
  ['Build', 'Cuts tighten into the drop, half-beats at the end, the picture flickering with the track.'],
  ['Drop', 'The single best moment in your footage lands on it: colour slams back, often a freeze-frame.'],
  ['Flurry', 'The action after the drop, cut on the strongest beats rather than a fixed count.'],
  ['Outro', 'One last held shot, slowed, fading out.'],
]

export function HelpDialog() {
  const open = useApp((s) => s.helpOpen)
  if (!open) return null
  return (
    <Modal onClose={() => setState({ helpOpen: false })} title="How it cuts" kicker="The playbook">
      <ol className="space-y-2.5">
        {ARC.map(([name, body], i) => (
          <li key={name} className="grid grid-cols-[2rem_6rem_1fr] items-baseline gap-2 border-b border-line pb-2.5">
            <span className="tag text-signal">{String(i + 1).padStart(2, '0')}</span>
            <span className="head text-xl">{name}</span>
            <span className="text-sm leading-snug text-ink-2">{body}</span>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-sm leading-snug text-ink-2">
        Wrong drop? Put the playhead on it and press <b>Drop is here</b> on the tape. Want a specific clip on the drop? Mark it <b>Hero</b>{' '}
        in the footage list.
      </p>
      <h3 className="tag mt-6 mb-2">Keys</h3>
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
      <h3 className="tag mt-6 mb-2">Built on</h3>
      <p className="text-xs leading-relaxed text-ink-3">
        <a className="underline hover:text-ink" href={CAPTION_MODELS[0].url} target="_blank" rel="noreferrer">
          Whisper
        </a>{' '}
        by OpenAI (MIT) for lyrics,{' '}
        <a className="underline hover:text-ink" href={TTS_MODEL.url} target="_blank" rel="noreferrer">
          {TTS_MODEL.name}
        </a>{' '}
        by {TTS_MODEL.maker} (Apache 2.0) for the announcer, both run on your device through Transformers.js and ONNX Runtime Web. Video is
        decoded and encoded with Mediabunny and WebCodecs. Type: Anton, Inter Tight, JetBrains Mono.
      </p>
    </Modal>
  )
}
