import { Upload } from 'lucide-react'
import { useEffect, useState } from 'react'
import { addFiles } from '../state/actions'

/** Drop files anywhere on the window. */
export function DropOverlay() {
  const [over, setOver] = useState(false)
  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files')
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth++
      setOver(true)
    }
    const leave = () => {
      depth = Math.max(0, depth - 1)
      if (!depth) setOver(false)
    }
    const overFn = (e: DragEvent) => hasFiles(e) && e.preventDefault()
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setOver(false)
      const files = [...(e.dataTransfer?.files ?? [])]
      if (files.length) void addFiles(files)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', overFn)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', overFn)
      window.removeEventListener('drop', drop)
    }
  }, [])
  if (!over) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-[70] grid place-items-center bg-black/55 p-6 backdrop-blur-sm">
      <div className="grid h-full w-full place-items-center rounded-[var(--r-panel)] border-2 border-dashed border-accent text-ink">
        <div className="text-center">
          <Upload className="mx-auto size-10 text-accent" />
          <div className="display mt-3 text-2xl">Drop it in</div>
          <p className="mt-1 text-sm text-ink-2">
            A song becomes the soundtrack; videos and photos become footage; .srt/.lrc become captions.
          </p>
        </div>
      </div>
    </div>
  )
}
