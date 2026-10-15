import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cx } from './format'

export function Modal({
  children,
  onClose,
  title,
  kicker,
  wide,
  closable = true,
}: {
  children: ReactNode
  onClose: () => void
  title: string
  kicker?: string
  wide?: boolean
  closable?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closable && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
  }, [onClose, closable])
  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && closable && onClose()}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx('slam max-h-[92vh] w-full overflow-y-auto border border-line-2 bg-bg outline-none', wide ? 'max-w-4xl' : 'max-w-lg')}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 pt-4 pb-3">
          <div>
            {kicker && <div className="tag text-signal">{kicker}</div>}
            <h2 className="head mt-1 text-4xl">{title}</h2>
          </div>
          {closable && (
            <button className="btn btn-bare btn-sq" onClick={onClose} aria-label="Close">
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
