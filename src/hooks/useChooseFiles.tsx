import { useRef } from 'react'
import { addFiles } from '../state/actions'

/** A hidden file input for songs, footage and lyrics, and a function that opens it. */
export function useChooseFiles() {
  const ref = useRef<HTMLInputElement>(null)
  const input = (
    <input
      ref={ref}
      type="file"
      multiple
      accept="audio/*,video/*,image/*,.srt,.lrc"
      hidden
      onChange={(e) => {
        if (e.target.files?.length) void addFiles([...e.target.files])
        e.target.value = ''
      }}
    />
  )
  return { open: () => ref.current?.click(), input }
}
