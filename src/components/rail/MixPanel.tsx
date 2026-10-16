// Mix: what goes into the edit. AutoClip reads every shot in the footage (on this device) as a big
// moment, action, b-roll, a celebration, talking or text, and uses as much of each as you ask for.

import { ScanSearch } from 'lucide-react'
import { CONTENT_KINDS, CONTENT_NAMES, contentShares } from '../../lib/content/classify'
import type { ContentAmount, ContentKind } from '../../lib/types'
import { readFootage, setMix, setMixAmount, unreadClips } from '../../state/content'
import { MIX_PRESETS } from '../../state/settings'
import { useApp } from '../../state/store'
import { cx } from '../format'
import { Progress, Seg } from '../ui'

const AMOUNTS: { value: ContentAmount; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'some', label: 'Some' },
  { value: 'more', label: 'More' },
]

export function MixPanel() {
  const mix = useApp((s) => s.settings.mix)
  const content = useApp((s) => s.content)
  const scan = useApp((s) => s.contentScan)
  const hasVideo = useApp((s) => s.clips.some((c) => c.kind === 'video' && c.status === 'ready'))
  const unread = useApp((s) => unreadClips(s).length)

  // How much of the footage that's been read is each kind.
  const read = Object.values(content)
  const total = read.reduce((a, c) => a + c.probs.length, 0)
  const share = Object.fromEntries(
    CONTENT_KINDS.map((k) => [k, total ? read.reduce((a, c) => a + contentShares(c)[k] * c.probs.length, 0) / total : 0]),
  ) as Record<ContentKind, number>
  const preset = MIX_PRESETS.find((p) => CONTENT_KINDS.every((k) => p.mix[k] === mix[k]))

  if (!hasVideo) return <p className="text-sm text-ink-3">Add some footage, then pick what goes into the edit here.</p>

  return (
    <div className="space-y-4">
      <p className="text-xs leading-snug text-ink-2">
        AutoClip reads every shot in your footage on this device, then uses as much of each kind as you ask for.
      </p>

      {scan ? (
        <div className="space-y-1.5">
          <Progress value={scan.fraction} />
          <div className="tag">
            {scan.stage === 'download'
              ? `Getting the shot model · 89 MB, first time only · ${Math.round(scan.fraction * 100)}%`
              : `Reading clip ${Math.min(scan.done + 1, scan.total)} of ${scan.total}`}
          </div>
        </div>
      ) : (
        unread > 0 && (
          <button className="btn w-full" onClick={() => void readFootage()}>
            <ScanSearch className="size-3.5" /> Read {read.length ? `${unread} new clip${unread === 1 ? '' : 's'}` : 'my footage'}
          </button>
        )
      )}

      <div className="grid grid-cols-2 gap-1.5">
        {MIX_PRESETS.map((p) => (
          <button
            key={p.id}
            className={cx('mix-preset px-2.5 py-2 text-left', preset?.id === p.id && 'mix-preset-on')}
            onClick={() => setMix(p.mix)}
            title={p.note}
          >
            <span className="block text-[0.78rem] font-semibold">{p.name}</span>
            <span className="block text-[0.66rem] leading-tight opacity-70">{p.note}</span>
          </button>
        ))}
      </div>

      <ul className="space-y-3">
        {CONTENT_KINDS.map((k) => (
          <li key={k} className="space-y-1.5">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold">{CONTENT_NAMES[k].name}</span>
              {total > 0 && <span className="tag">{Math.round(share[k] * 100)}% of footage</span>}
            </div>
            <div className="text-[0.7rem] leading-tight text-ink-3">{CONTENT_NAMES[k].note}</div>
            <Seg value={mix[k]} onChange={(v) => setMixAmount(k, v)} options={AMOUNTS} />
          </li>
        ))}
      </ul>
    </div>
  )
}
