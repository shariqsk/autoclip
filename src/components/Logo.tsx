// The AutoClip mark: a play button sliced in two by a cut.
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <path d="M11 8.5v15l6.2-3.6V12.1z" fill="var(--on-accent)" />
      <path d="M18.8 13l6 3.5-6 3.5z" fill="var(--on-accent)" opacity="0.9" />
    </svg>
  )
}
