import { useEffect, useState } from 'react'
import { addFiles } from '../state/actions'
import { useApp } from '../state/store'
import { routeLearnDrop } from '../state/learnDrop'

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
      if (files.length && !routeLearnDrop(files)) void addFiles(files)
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
  const learning = useApp((s) => !!s.learn)
  if (!over) return null
  if (learning)
    return (
      <div className="pointer-events-none fixed inset-0 z-[70] grid place-items-center bg-black/80 p-8">
        <div className="head text-center text-[8vw] leading-none text-signal">Learn from these</div>
      </div>
    )
  return (
    <div className="pointer-events-none fixed inset-0 z-[70] grid place-items-center bg-black/80 p-8">
      <div className="crop grid h-full w-full place-items-center">
        <div className="text-center">
          <div className="head text-[12vw] leading-none text-signal">Drop it</div>
          <p className="tag mt-4 text-ink-2">Songs become the soundtrack · videos and photos become footage · .srt and .lrc become text</p>
        </div>
      </div>
    </div>
  )
}
