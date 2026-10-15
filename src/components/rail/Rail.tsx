// Every creative choice, in sections. Shells decide where these go; `only` picks a subset.

import { FormatPanel } from './FormatPanel'
import { LookPanel } from './LookPanel'
import { SoundPanel } from './SoundPanel'
import { StyleList } from './StyleList'
import { TextPanel } from './TextPanel'
import { VoicePanel } from './VoicePanel'
import { Section } from '../ui'

export type RailPart = 'style' | 'format' | 'look' | 'text' | 'voice' | 'sound'

const PARTS: Record<RailPart, { n: string; title: string; body: () => React.ReactNode; open: boolean }> = {
  style: { n: '03', title: 'Style', body: () => <StyleList />, open: true },
  format: { n: '04', title: 'Format', body: () => <FormatPanel />, open: true },
  look: { n: '05', title: 'Look', body: () => <LookPanel />, open: false },
  text: { n: '06', title: 'Text', body: () => <TextPanel />, open: false },
  voice: { n: '07', title: 'Voice', body: () => <VoicePanel />, open: false },
  sound: { n: '08', title: 'Sound', body: () => <SoundPanel />, open: false },
}

export function Rail({ only, open, className }: { only?: RailPart[]; open?: boolean; className?: string }) {
  const parts = only ?? (Object.keys(PARTS) as RailPart[])
  return (
    <div className={className}>
      {parts.map((p) => (
        <Section key={p} n={PARTS[p].n} title={PARTS[p].title} defaultOpen={open ?? PARTS[p].open} className={`section-${p}`}>
          {PARTS[p].body()}
        </Section>
      ))}
    </div>
  )
}
