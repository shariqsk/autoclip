// The AutoClip wordmark: condensed, all caps, cut in two by the signal colour.
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={`head inline-flex items-baseline text-[1.65rem] leading-none tracking-[0.01em] ${className ?? ''}`}
      aria-label="AutoClip"
    >
      <span>AUTO</span>
      <span className="relative ml-[0.06em] bg-signal px-[0.08em] text-signal-ink">CLIP</span>
    </span>
  )
}
