// Shared controls. They look different per layout through the kit's tokens; on the Deck layout,
// sliders become rotary knobs.

import { useId, useRef, useState, type ReactNode } from 'react'
import { useLook } from '../hooks/useTheme'
import { cx } from './format'

export function BlockHead({ n, title, aside, className }: { n?: string; title: string; aside?: ReactNode; className?: string }) {
  return (
    <div className={cx('block-head', className)}>
      {n && <span className="block-num">{n}</span>}
      <h2 className="block-title">{title}</h2>
      <span className="block-rule" />
      {aside}
    </div>
  )
}

export function Seg<T extends string | number>({
  value,
  options,
  onChange,
  className,
}: {
  value: T
  options: { value: T; label: ReactNode; title?: string }[]
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div className={cx('segs', className)} role="radiogroup">
      {options.map((o) => (
        <button
          key={String(o.value)}
          className="opt"
          role="radio"
          aria-checked={o.value === value}
          data-on={o.value === value}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

interface SliderProps {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (v: number) => void
  format?: (v: number) => string
  hint?: string
}

/** A rotary knob: drag up or down (or use the arrow keys) to turn it. */
export function Knob({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  format = (v) => `${Math.round(v * 100)}`,
  hint,
}: SliderProps) {
  const drag = useRef<{ y: number; v: number } | null>(null)
  const frac = (value - min) / (max - min)
  const angle = -135 + frac * 270
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v / step) * step)))
  const arc = (from: number, to: number) => {
    const r = 17
    const p = (a: number) => [22 + r * Math.sin((a * Math.PI) / 180), 22 - r * Math.cos((a * Math.PI) / 180)]
    const [x0, y0] = p(from)
    const [x1, y1] = p(to)
    return `M${x0},${y0} A${r},${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x1},${y1}`
  }
  return (
    <div className="knob flex flex-col items-center gap-1" title={hint}>
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        className="knob-dial relative size-11 cursor-ns-resize touch-none select-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { y: e.clientY, v: value }
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          set(drag.current.v + ((drag.current.y - e.clientY) / 140) * (max - min))
        }}
        onPointerUp={() => (drag.current = null)}
        onDoubleClick={() => set(min + (max - min) / 2)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') set(value + (max - min) / 20)
          if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') set(value - (max - min) / 20)
        }}
      >
        <svg viewBox="0 0 44 44" className="absolute inset-0">
          <path d={arc(-135, 135)} className="knob-track" fill="none" strokeWidth="3" strokeLinecap="round" />
          {frac > 0.005 && <path d={arc(-135, angle)} className="knob-fill" fill="none" strokeWidth="3" strokeLinecap="round" />}
        </svg>
        <div className="knob-cap absolute inset-[9px] rounded-full" style={{ transform: `rotate(${angle}deg)` }}>
          <span className="knob-mark absolute top-[3px] left-1/2 h-[7px] w-[2px] -translate-x-1/2 rounded-full" />
        </div>
      </div>
      <span className="tag max-w-16 truncate text-center leading-tight">{label}</span>
      <span className="lcd text-sm leading-none">{format(value)}</span>
    </div>
  )
}

export function Slider(props: SliderProps) {
  const { layout } = useLook()
  const id = useId()
  if (layout === 'deck') return <Knob {...props} />
  const { label, value, min = 0, max = 1, step = 0.01, onChange, format = (v) => `${Math.round(v * 100)}`, hint } = props
  const fill = `${((value - min) / (max - min)) * 100}%`
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="tag" title={hint}>
          {label}
        </label>
        <span className="mono text-[0.68rem] text-ink-2">{format(value)}</span>
      </div>
      <input
        id={id}
        type="range"
        className="slider"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ['--fill' as string]: fill }}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  )
}

/** On Deck, a bank of knobs sits in a row; elsewhere sliders stack. */
export function SliderBank({ children }: { children: ReactNode }) {
  const { layout } = useLook()
  return <div className={layout === 'deck' ? 'grid grid-cols-4 gap-x-2 gap-y-3' : 'space-y-3'}>{children}</div>
}

export function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: ReactNode
  checked: boolean
  onChange: (v: boolean) => void
  hint?: ReactNode
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="toggle group flex w-full items-start justify-between gap-3 py-1 text-left"
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{label}</span>
        {hint && <span className="block text-xs leading-snug text-ink-3">{hint}</span>}
      </span>
      <span
        className={cx(
          'toggle-switch relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors',
          checked ? 'border-signal bg-signal' : 'border-line-2 bg-bg-3',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 left-0.5 size-3.5 rounded-full bg-ink transition-transform',
            checked && 'translate-x-4 bg-signal-ink',
          )}
        />
      </span>
    </button>
  )
}

/** A numbered, collapsible section. */
export function Section({
  n,
  title,
  children,
  defaultOpen = true,
  aside,
  className,
}: {
  n?: string
  title: string
  children: ReactNode
  defaultOpen?: boolean
  aside?: ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className={cx('section', className)} data-open={open}>
      <button className="section-head flex w-full items-center gap-2 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <BlockHead n={n} title={title} aside={aside} className="flex-1" />
        <span className="tag w-4 text-center text-ink-2">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="section-body space-y-3.5">{children}</div>}
    </section>
  )
}

/** A striped progress bar: indeterminate when value is null. */
export function Progress({ value, className }: { value: number | null; className?: string }) {
  return (
    <div className={cx('progress h-1 w-full overflow-hidden rounded-full bg-line', className)}>
      <div
        className="loading-bar h-full transition-[width] duration-300"
        style={{ width: value === null ? '100%' : `${Math.max(3, value * 100)}%` }}
      />
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>
}
