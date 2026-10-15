import { CircleAlert, CircleCheck, Info } from 'lucide-react'
import { useApp } from '../state/store'
import { cx } from './format'

export function Toasts() {
  const toasts = useApp((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-80 flex-col gap-2" aria-live="polite">
      {toasts.map((t) => {
        const Icon = t.tone === 'error' ? CircleAlert : t.tone === 'success' ? CircleCheck : Info
        return (
          <div key={t.id} className="panel rise pointer-events-auto flex items-start gap-2.5 px-3.5 py-3 text-sm">
            <Icon
              className={cx('mt-0.5 size-4 shrink-0', t.tone === 'error' ? 'text-hot' : t.tone === 'success' ? 'text-good' : 'text-accent')}
            />
            <span className="leading-snug">{t.text}</span>
          </div>
        )
      })}
    </div>
  )
}
