// The right-hand panel: every creative choice, grouped. Changing the style, length or order re-cuts
// the edit; everything else updates the preview live.

import { AudioLines, Captions, LayoutTemplate, Mic, Palette, Wand2 } from 'lucide-react'
import { useState } from 'react'
import { cx } from '../format'
import { CaptionsPanel } from './CaptionsPanel'
import { FormatPanel } from './FormatPanel'
import { LookPanel } from './LookPanel'
import { SoundPanel } from './SoundPanel'
import { StylePicker } from './StylePicker'
import { VoicePanel } from './VoicePanel'

const TABS = [
  { id: 'style', label: 'Style', icon: Wand2, body: StylePicker },
  { id: 'format', label: 'Format', icon: LayoutTemplate, body: FormatPanel },
  { id: 'look', label: 'Look', icon: Palette, body: LookPanel },
  { id: 'text', label: 'Text', icon: Captions, body: CaptionsPanel },
  { id: 'voice', label: 'Voice', icon: Mic, body: VoicePanel },
  { id: 'sound', label: 'Sound', icon: AudioLines, body: SoundPanel },
] as const

export function VibePanel() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('style')
  const Body = TABS.find((t) => t.id === tab)!.body
  return (
    <div className="panel flex min-h-0 flex-col overflow-hidden">
      <div className="grid grid-cols-6 border-b border-line p-1.5" role="tablist">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cx(
              'flex flex-col items-center gap-0.5 rounded-[var(--r-ctl)] py-1.5 text-[0.62rem] font-semibold transition-colors',
              tab === id ? 'bg-panel-2 text-ink' : 'text-ink-3 hover:text-ink',
            )}
          >
            <Icon className={cx('size-4', tab === id && 'text-accent')} />
            {label}
          </button>
        ))}
      </div>
      <div key={tab} className="rise min-h-0 flex-1 space-y-3.5 overflow-y-auto p-4">
        <Body />
      </div>
    </div>
  )
}
