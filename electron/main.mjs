// AutoClip desktop shell. Serves the built web app from a privileged app:// scheme so module workers,
// WebAssembly, WebCodecs, fetch and WebGPU behave exactly as they do on the web. Everything still runs
// locally; models are cached in the app's own storage.

import { app, BrowserWindow, clipboard, ipcMain, net, Notification, protocol, shell } from 'electron'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createLibrary } from './library.mjs'
import { createLinkImporter } from './links.mjs'
import { PLATFORM_NAME, startScheduler, textFor, UPLOAD_PAGE } from './scheduler.mjs'
import { copyVideoToClipboard, saveVideo, UPLOAD_PAGES } from './share.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..', 'dist')
const ORIGIN = 'app://autoclip'
// Downloads from links wait here until the app has read them (see links.mjs).
const importsDir = path.join(app.getPath('temp'), 'autoclip-imports')
let libraryRef = null
const IMPORT_NAME = /^[a-z0-9]+-[a-z0-9]+\.[a-z0-9]{2,5}$/

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } },
])

function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 400,
    minHeight: 640,
    title: 'AutoClip',
    backgroundColor: '#0b0b0d',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false, preload: path.join(here, 'preload.cjs') },
  })

  // Links to GitHub, model hosts etc. open in the user's browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(ORIGIN)) {
      event.preventDefault()
      if (/^https?:/.test(url)) void shell.openExternal(url)
    }
  })

  void win.loadURL(`${ORIGIN}/index.html`)
}

app.whenReady().then(() => {
  // Anything left over from a crash or a quit mid-import.
  void rm(importsDir, { recursive: true, force: true })
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url)
    // A library item's video or poster frame.
    const lib = pathname.match(/^\/__library\/([a-z0-9]{6,32})\/(video\.mp4|thumb\.jpg)$/)
    if (lib && libraryRef) return net.fetch(pathToFileURL(libraryRef.file(lib[1], lib[2])).toString())
    // A finished download, read straight from disk.
    const imported = pathname.match(/^\/__import\/(.+)$/)?.[1]
    if (imported) {
      if (!IMPORT_NAME.test(imported)) return new Response('Not found', { status: 404 })
      return net.fetch(pathToFileURL(path.join(importsDir, imported)).toString())
    }
    const file = path.normalize(path.join(root, decodeURIComponent(pathname)))
    // Never serve anything outside the bundled app.
    if (!file.startsWith(root)) return new Response('Not found', { status: 404 })
    // Cross-origin isolation, so the on-device models (Whisper, the shot model) can run on every CPU
    // core. "credentialless" still lets the models download from their hosts.
    return net.fetch(pathToFileURL(file).toString()).then((res) => {
      const headers = new Headers(res.headers)
      headers.set('Cross-Origin-Opener-Policy', 'same-origin')
      headers.set('Cross-Origin-Embedder-Policy', 'credentialless')
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
    })
  })

  // Import from a link: yt-dlp lives in the app's data folder; YouTube's player challenges run on the
  // Node built into Electron (ELECTRON_RUN_AS_NODE), so nothing else needs installing.
  const importer = createLinkImporter({
    toolsDir: path.join(app.getPath('userData'), 'tools'),
    importsDir,
    nodePath: process.execPath,
    log: (m) => console.log(`[links] ${m}`),
  })
  // Get the downloader installed and warm in the background, so the first link imports straight away.
  setTimeout(() => importer.warm().catch((e) => console.log(`[links] warm-up failed: ${e.message}`)), 3000)
  const running = new Map()
  const fromApp = (event) => event.senderFrame?.url.startsWith(ORIGIN)
  ipcMain.handle('links:import', async (event, { id, url, mode }) => {
    if (!fromApp(event) || typeof url !== 'string' || (mode !== 'audio' && mode !== 'video')) throw new Error('Bad request')
    const abort = new AbortController()
    running.set(id, abort)
    try {
      return await importer.importLink(url, mode, (p) => event.sender.send('links:progress', { id, ...p }), abort.signal)
    } finally {
      running.delete(id)
    }
  })
  ipcMain.handle('links:cancel', (event, id) => {
    if (fromApp(event)) running.get(id)?.abort()
  })
  // The app has its copy of a download: the file on disk can go.
  ipcMain.handle('links:release', async (event, name) => {
    if (!fromApp(event) || typeof name !== 'string' || !IMPORT_NAME.test(name)) throw new Error('Bad request')
    await rm(path.join(importsDir, name), { force: true })
  })
  // Posting: keep the video in Movies/AutoClip, show it in the file browser, and open the platform's
  // upload page, ready to drag it in.
  ipcMain.handle('share:post', async (event, { data, name, url }) => {
    if (!fromApp(event) || !(data instanceof Uint8Array) || typeof name !== 'string' || !UPLOAD_PAGES.includes(url))
      throw new Error('Bad request')
    const file = await saveVideo(data, name, path.join(app.getPath('videos'), 'AutoClip'))
    shell.showItemInFolder(file)
    await shell.openExternal(url)
    return file
  })
  ipcMain.handle('share:copy-video', async (event, { data, name }) => {
    if (!fromApp(event) || !(data instanceof Uint8Array) || typeof name !== 'string') throw new Error('Bad request')
    await copyVideoToClipboard(data, name)
  })

  // The library and its schedule (see library.mjs, scheduler.mjs).
  const library = createLibrary({
    dir: path.join(app.getPath('videos'), 'AutoClip', 'Library'),
    onChange: () => BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('library:changed')),
  })
  libraryRef = library
  // Posting by hand: the video shown in Finder, its words on the clipboard, the upload page open.
  const handoff = async (item, platform) => {
    clipboard.writeText(textFor(item.posts[platform], platform))
    shell.showItemInFolder(library.file(item.id, 'video.mp4'))
    await shell.openExternal(UPLOAD_PAGE[platform])
  }
  const nudges = new Set()
  const scheduler = startScheduler({
    library,
    // Accounts aren't connected yet: everything due is a nudge.
    upload: async () => null,
    nudge: (item, platform) => {
      if (!Notification.isSupported()) return
      const n = new Notification({
        title: `Time to post to ${PLATFORM_NAME[platform]}`,
        body: `${item.name}: click to open ${PLATFORM_NAME[platform]} with the video ready and the caption copied.`,
      })
      nudges.add(n)
      n.on('click', () => void handoff(item, platform))
      n.on('close', () => nudges.delete(n))
      n.show()
    },
    log: (m) => console.log(`[library] ${m}`),
  })
  ipcMain.handle('library:list', (event) => (fromApp(event) ? library.list() : []))
  ipcMain.handle('library:add', (event, item) => {
    if (!fromApp(event)) throw new Error('Bad request')
    return library.add(item)
  })
  ipcMain.handle('library:update', async (event, { id, patch }) => {
    if (!fromApp(event)) throw new Error('Bad request')
    const item = await library.update(id, patch)
    // Anything just scheduled for now goes out straight away.
    void scheduler.tick()
    return item
  })
  ipcMain.handle('library:remove', (event, ids) => {
    if (!fromApp(event) || !Array.isArray(ids)) throw new Error('Bad request')
    return library.remove(ids)
  })
  ipcMain.handle('library:handoff', async (event, { id, platform }) => {
    if (!fromApp(event) || !UPLOAD_PAGE[platform]) throw new Error('Bad request')
    await handoff(await library.read(id), platform)
  })
  ipcMain.handle('library:reveal', (event, id) => {
    if (fromApp(event)) shell.showItemInFolder(library.file(id, 'video.mp4'))
  })

  createWindow()
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
})

app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit())
