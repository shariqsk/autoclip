// While the learn dialog is open, files dropped anywhere on the window go to it, not the project.

let handler: ((files: File[]) => void) | null = null

export function setLearnDropHandler(fn: ((files: File[]) => void) | null) {
  handler = fn
}

/** Hand dropped files to the learn dialog if it's open. True when it took them. */
export function routeLearnDrop(files: File[]): boolean {
  if (!handler) return false
  handler(files)
  return true
}
