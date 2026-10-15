// Desktop app: paste a link anywhere (outside a text field) to import it.

import { useEffect } from 'react'
import { desktop } from '../lib/desktop'
import { parseLink } from '../lib/links'
import { openLinkDialog } from '../state/actions'

export function usePasteLinks() {
  useEffect(() => {
    if (!desktop) return
    const onPaste = (e: ClipboardEvent) => {
      if (e.target instanceof Element && e.target.closest('input, textarea, [contenteditable]')) return
      const text = e.clipboardData?.getData('text') ?? ''
      if (!text.split(/\s+/).some((t) => parseLink(t))) return
      e.preventDefault()
      openLinkDialog(text.trim())
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])
}
