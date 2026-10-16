import { useEffect, useState } from 'react'
import { desktop, type LibraryItem } from '../lib/desktop'

/** The library items, kept fresh as the shell changes them (posts going out, items deleted). */
export function useLibrary(): LibraryItem[] | null {
  const [items, setItems] = useState<LibraryItem[] | null>(null)
  useEffect(() => {
    if (!desktop) return
    let live = true
    const load = () => void desktop!.library.list().then((x) => live && setItems(x))
    load()
    const off = desktop.library.onChange(load)
    return () => {
      live = false
      off()
    }
  }, [])
  return items
}
