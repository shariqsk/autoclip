// Every creative choice, one tab at a time: a nav bar across the top, the chosen section below.

import { Aperture, AudioLines, Crop, Mic, Sparkles, Type, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { cx } from '../format'
import { FormatPanel } from './FormatPanel'
import { LookPanel } from './LookPanel'
import { SoundPanel } from './SoundPanel'
import { StyleList } from './StyleList'
import { TextPanel } from './TextPanel'
import { VoicePanel } from './VoicePanel'

export type RailTab = 'style' | 'format' | 'look' | 'text' | 'voice' | 'sound'

const TABS: { id: RailTab; label: string; icon: LucideIcon; body: () => React.ReactNode }[] = [
  { id: 'style', label: 'Style', icon: Sparkles, body: () => <StyleList /> },
  { id: 'format', label: 'Format', icon: Crop, body: () => <FormatPanel /> },
  { id: 'look', label: 'Look', icon: Aperture, body: () => <LookPanel /> },
  { id: 'text', label: 'Text', icon: Type, body: () => <TextPanel /> },
  { id: 'voice', label: 'Voice', icon: Mic, body: () => <VoicePanel /> },
  { id: 'sound', label: 'Sound', icon: AudioLines, body: () => <SoundPanel /> },
]

const KEY = 'autoclip:rail'

function saved(): RailTab {
  const v = localStorage.getItem(KEY)
  return TABS.some((t) => t.id === v) ? (v as RailTab) : 'style'
}

export function Rail({ className }: { className?: string }) {
  const [tab, setTab] = useState(saved)
  const pick = (id: RailTab) => {
    setTab(id)
    localStorage.setItem(KEY, id)
  }
  const current = TABS.find((t) => t.id === tab)!
  return (
    <div className={cx('rail flex min-h-0 flex-col', className)}>
      <nav className="rail-nav" role="tablist" aria-label="Edit settings">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            id={`rail-tab-${id}`}
            aria-selected={tab === id}
            aria-controls="rail-panel"
            data-on={tab === id}
            className="rail-tab"
            onClick={() => pick(id)}
          >
            <Icon className="rail-tab-icon" />
            <span className="rail-tab-label">{label}</span>
          </button>
        ))}
      </nav>
      <div
        id="rail-panel"
        role="tabpanel"
        aria-labelledby={`rail-tab-${tab}`}
        className={cx('rail-body space-y-3.5', `rail-body-${tab}`)}
        key={tab}
      >
        {current.body()}
      </div>
    </div>
  )
}
