// Small shared controls, styled by the semantic classes in components.css.

import { ChevronDown } from 'lucide-react'
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
    <div className={cx('seg', className)} role="radiogroup">
      {options.map((o) => (
        <button
          key={String(o.value)}
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
  format = (v) => `${Math.round(v * 100)}%`,
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
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium text-ink-2" title={hint}>
          {label}
        </label>
        <span className="font-mono text-[0.7rem] text-ink-3">{format(value)}</span>
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
    <label className="flex items-start justify-between gap-3 py-1">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {hint && <span className="block text-xs leading-snug text-ink-3">{hint}</span>}
      </span>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 h-5 w-9 shrink-0 rounded-full border border-line-strong transition-colors',
          checked ? 'border-accent bg-accent' : 'bg-well',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 left-0.5 size-3.5 rounded-full bg-ink transition-transform',
            checked && 'translate-x-4 bg-on-accent',
          )}
        />
      </button>
    </label>
  )
}

export function Section({
  title,
  children,
  defaultOpen = true,
  aside,
}: {
  title: string
  children: ReactNode
  defaultOpen?: boolean
  aside?: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="border-t border-line first:border-t-0">
      <div className="flex items-center gap-2 px-4 py-3">
        <button className="label flex flex-1 items-center gap-1.5 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
          <ChevronDown className={cx('size-3.5 transition-transform', !open && '-rotate-90')} />
          {title}
        </button>
        {aside}
      </div>
      {open && <div className="space-y-3 px-4 pb-4">{children}</div>}
    </section>
  )
}

export function Ring({
  value,
  size = 18,
  stroke = 2.5,
  className,
}: {
  value: number | null
  size?: number
  stroke?: number
  className?: string
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} className={cx(value === null && 'animate-spin', className)} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.2} strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - (value ?? 0.25))}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.3s ease' }}
      />
    </svg>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>
}
