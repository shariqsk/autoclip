import { useApp } from '../state/store'
import { cx } from './format'

export function Toasts() {
  const toasts = useApp((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-80 flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="slam pointer-events-auto flex border border-line-2 bg-bg text-sm">
          <span className={cx('w-1.5 shrink-0', t.tone === 'error' ? 'bg-signal' : t.tone === 'success' ? 'bg-good' : 'bg-ink')} />
          <span className="px-3 py-2.5 leading-snug">{t.text}</span>
        </div>
      ))}
    </div>
  )
}
