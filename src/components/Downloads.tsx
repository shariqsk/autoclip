// Links being imported, with progress and a way to stop them.

import { X } from 'lucide-react'
import { cancelDownload } from '../state/actions'
import { useApp } from '../state/store'
import { cx } from './format'
import { Progress } from './ui'

export function Downloads({ className }: { className?: string }) {
  const downloads = useApp((s) => s.downloads)
  if (!downloads.length) return null
  return (
    <div className={cx('space-y-2.5 border-b border-line px-4 py-3', className)}>
      {downloads.map((d) => (
        <div key={d.id} className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="tag shrink-0 text-signal">{d.mode === 'audio' ? 'Song' : 'Footage'}</span>
            <span className={cx('min-w-0 flex-1 truncate text-xs', d.error ? 'text-signal' : 'text-ink-2')} title={d.stage}>
              {d.site} · {d.stage}
            </span>
            {!d.error && (
              <button
                className="text-ink-3 hover:text-ink"
                title="Stop"
                aria-label="Stop the download"
                onClick={() => cancelDownload(d.id)}
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          {!d.error && <Progress value={d.fraction} />}
        </div>
      ))}
    </div>
  )
}
