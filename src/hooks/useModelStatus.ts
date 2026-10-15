import { useSyncExternalStore } from 'react'
import type { ModelStatus } from '../lib/ml/client'

type StatusBox = { current: ModelStatus | null; listeners: Set<() => void> }

export function useModelStatus(box: StatusBox): ModelStatus | null {
  return useSyncExternalStore(
    (l) => {
      box.listeners.add(l)
      return () => box.listeners.delete(l)
    },
    () => box.current,
  )
}

export function describeStatus(s: ModelStatus | null, working: string): string | null {
  if (!s) return null
  if (s.phase === 'working') return working
  return s.fraction === null ? 'Getting the model ready…' : `Downloading the model… ${Math.round(s.fraction * 100)}%`
}
