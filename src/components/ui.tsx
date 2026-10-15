// Shared controls, drawn with the kit in components.css: square, outlined, filled when on.

import { useId, useState, type ReactNode } from 'react'
import { cx } from './format'

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

export function Slider({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  format = (v) => `${Math.round(v * 100)}`,
  hint,
}: {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (v: number) => void
  format?: (v: number) => string
  hint?: string
}) {
  const id = useId()
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
      className="group flex w-full items-start justify-between gap-3 py-1 text-left"
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{label}</span>
        {hint && <span className="block text-xs leading-snug text-ink-3">{hint}</span>}
      </span>
      <span
        className={cx(
          'mono mt-0.5 shrink-0 border px-1.5 py-0.5 text-[0.6rem] font-bold tracking-widest',
          checked ? 'border-signal bg-signal text-signal-ink' : 'border-line-2 text-ink-3',
        )}
      >
        {checked ? 'ON' : 'OFF'}
      </span>
    </button>
  )
}

/** A numbered, collapsible section of a rail: "04  FORMAT ————— +". */
export function Section({
  n,
  title,
  children,
  defaultOpen = true,
  aside,
}: {
  n: string
  title: string
  children: ReactNode
  defaultOpen?: boolean
  aside?: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="border-b border-line">
      <div className="flex items-center gap-2 px-4 pt-3 pb-2.5">
        <button className="rule-head flex-1 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="tag text-signal">{n}</span>
          <span className="head text-lg">{title}</span>
        </button>
        {aside}
        <button
          className="tag w-4 text-center text-ink-2 hover:text-ink"
          onClick={() => setOpen(!open)}
          aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
        >
          {open ? '−' : '+'}
        </button>
      </div>
      {open && <div className="space-y-3.5 px-4 pb-4">{children}</div>}
    </section>
  )
}

/** A tiny striped progress bar: indeterminate when value is null. */
export function Progress({ value, className }: { value: number | null; className?: string }) {
  return (
    <div className={cx('h-1 w-full bg-line', className)}>
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
