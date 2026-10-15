import { dismissToast, useApp } from '../state/store'
import { cx } from './format'

export function Toasts() {
  const toasts = useApp((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-80 flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast rise pointer-events-auto flex overflow-hidden text-sm">
          <span
            className={cx('toast-edge w-1.5 shrink-0', t.tone === 'error' ? 'bg-signal' : t.tone === 'success' ? 'bg-good' : 'bg-ink')}
          />
          <span className="flex-1 px-3 py-2.5 leading-snug">{t.text}</span>
          {t.action && (
            <button
              className="toast-action mono px-3 text-[0.65rem] font-bold tracking-widest uppercase"
              onClick={() => {
                t.action!.run()
                dismissToast(t.id)
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
