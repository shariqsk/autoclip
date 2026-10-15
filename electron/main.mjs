// AutoClip desktop shell. Serves the built web app from a privileged app:// scheme so module workers,
// WebAssembly, WebCodecs, fetch and WebGPU behave exactly as they do on the web. Everything still runs
// locally; models are cached in the app's own storage.

import { app, BrowserWindow, net, protocol, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

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
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false },
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

  createWindow()
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
})

app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit())
