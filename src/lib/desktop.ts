// What the desktop shell adds (see electron/preload.cjs). Absent on the web.

export interface ImportedFile {
  role: 'audio' | 'video' | 'av'
  ext: string
  data: Uint8Array
}

export interface ImportResult {
  title: string
  site: string
  files: ImportedFile[]
}

export interface ImportProgress {
  id: string
  stage: string
  fraction: number | null
}

export interface DesktopBridge {
  importLink(id: string, url: string, mode: 'audio' | 'video'): Promise<ImportResult>
  cancelImport(id: string): Promise<void>
  onImportProgress(fn: (p: ImportProgress) => void): () => void
  /** Put a video on the clipboard as a file, ready to paste into a chat or a folder. */
  copyVideo(data: Uint8Array, name: string): Promise<void>
}

export const desktop: DesktopBridge | null = (globalThis as { autoclipDesktop?: DesktopBridge }).autoclipDesktop ?? null
