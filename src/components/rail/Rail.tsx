// The right rail: every creative choice, in numbered sections. Style, length and order re-cut the
// edit; everything else updates the stage live.

import { getStyle } from '../../lib/edit/presets'
import { useApp } from '../../state/store'
import { Section } from '../ui'
import { FormatPanel } from './FormatPanel'
import { LookPanel } from './LookPanel'
import { SoundPanel } from './SoundPanel'
import { StyleList } from './StyleList'
import { TextPanel } from './TextPanel'
import { VoicePanel } from './VoicePanel'

export function Rail() {
  const style = useApp((s) => getStyle(s.settings.style))
  return (
    <div className="min-h-0 overflow-y-auto">
      <Section n="03" title="Style" aside={<span className="tag truncate">{style.bestFor.split(',')[0]}</span>}>
        <StyleList />
      </Section>
      <Section n="04" title="Format">
        <FormatPanel />
      </Section>
      <Section n="05" title="Look" defaultOpen={false}>
        <LookPanel />
      </Section>
      <Section n="06" title="Text" defaultOpen={false}>
        <TextPanel />
      </Section>
      <Section n="07" title="Voice" defaultOpen={false}>
        <VoicePanel />
      </Section>
      <Section n="08" title="Sound" defaultOpen={false}>
        <SoundPanel />
      </Section>
    </div>
  )
}
