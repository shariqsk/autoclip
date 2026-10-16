import type { Platform } from './share/post'

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

export type PostStatus = 'none' | 'scheduled' | 'due' | 'posting' | 'posted' | 'failed'

/** One platform's post of a library item. */
export interface LibraryPost {
  caption: string
  hashtags: string[]
  /** For YouTube. */
  title: string
  status: PostStatus
  /** When it's scheduled for (ms since 1970), or null. */
  at: number | null
  postedAt: number | null
  error: string | null
  /** The live post, once it's up through a connected account. */
  url: string | null
}

/** A finished edit kept in the library (see electron/library.mjs). */
export interface LibraryItem {
  id: string
  name: string
  createdAt: number
  duration: number
  width: number
  height: number
  size: number
  /** Delete the video once every post it was meant for is up. */
  deleteAfterPost: boolean
  posts: Record<Platform, LibraryPost>
}

export interface LibraryBridge {
  list(): Promise<LibraryItem[]>
  add(item: {
    video: Uint8Array
    thumb: Uint8Array | null
    name: string
    duration: number
    width: number
    height: number
    posts: Partial<Record<Platform, Partial<LibraryPost>>>
  }): Promise<LibraryItem>
  update(
    id: string,
    patch: { name?: string; deleteAfterPost?: boolean; posts?: Partial<Record<Platform, Partial<LibraryPost>>> },
  ): Promise<LibraryItem | null>
  remove(ids: string[]): Promise<void>
  /** Post by hand: show the video, copy the words, open the upload page. */
  handoff(id: string, platform: Platform): Promise<void>
  reveal(id: string): Promise<void>
  onChange(fn: () => void): () => void
}

export interface DesktopBridge {
  library: LibraryBridge
  importLink(id: string, url: string, mode: 'audio' | 'video'): Promise<ImportResult>
  cancelImport(id: string): Promise<void>
  /** Delete a download from disk once the app has read it. */
  releaseImport(name: string): Promise<void>
  onImportProgress(fn: (p: ImportProgress) => void): () => void
  /** Put a video on the clipboard as a file, ready to paste into a chat or a folder. */
  copyVideo(data: Uint8Array, name: string): Promise<void>
  /** Save a video to Movies/AutoClip, show it, and open a platform's upload page. Returns the path. */
  postVideo(data: Uint8Array, name: string, url: string): Promise<string>
}

export const desktop: DesktopBridge | null = (globalThis as { autoclipDesktop?: DesktopBridge }).autoclipDesktop ?? null
