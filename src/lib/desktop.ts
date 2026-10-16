// What the desktop shell adds (see electron/preload.cjs). Absent on the web.

/** A finished download, waiting on disk: read it from `app://autoclip/__import/<name>`. */
export interface ImportedFile {
  name: string
  ext: string
}

export interface ImportResult {
  title: string
  site: string
  file: ImportedFile
}

export interface ImportProgress {
  id: string
  stage: string
  fraction: number | null
}

export interface DesktopBridge {
  importLink(id: string, url: string, mode: 'audio' | 'video'): Promise<ImportResult>
  cancelImport(id: string): Promise<void>
  /** Delete a download from disk once the app has read it. */
  releaseImport(name: string): Promise<void>
  onImportProgress(fn: (p: ImportProgress) => void): () => void
  /** Put a video on the clipboard as a file, ready to paste into a chat or a folder. */
  copyVideo(data: Uint8Array, name: string): Promise<void>
}

export const desktop: DesktopBridge | null = (globalThis as { autoclipDesktop?: DesktopBridge }).autoclipDesktop ?? null
