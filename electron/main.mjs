// AutoClip desktop shell. Serves the built web app from a privileged app:// scheme so module workers,
// WebAssembly, WebCodecs, fetch and WebGPU behave exactly as they do on the web. Everything still runs
// locally; models are cached in the app's own storage.

import { app, BrowserWindow, ipcMain, net, protocol, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createLinkImporter } from './links.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..', 'dist')
const ORIGIN = 'app://autoclip'

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
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url)
    const file = path.normalize(path.join(root, decodeURIComponent(pathname)))
    // Never serve anything outside the bundled app.
    if (!file.startsWith(root)) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(file).toString())
  })

  // Import from a link: yt-dlp lives in the app's data folder; YouTube's player challenges run on the
  // Node built into Electron (ELECTRON_RUN_AS_NODE), so nothing else needs installing.
  const importer = createLinkImporter({
    toolsDir: path.join(app.getPath('userData'), 'tools'),
    nodePath: process.execPath,
    log: (m) => console.log(`[links] ${m}`),
  })
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

  createWindow()
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
})

app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit())
