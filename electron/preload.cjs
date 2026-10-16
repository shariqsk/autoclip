// The only bridge between the app and the desktop shell: importing songs and footage from links,
// and copying a finished video to the clipboard as a file.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('autoclipDesktop', {
  importLink: (id, url, mode) => ipcRenderer.invoke('links:import', { id, url, mode }),
  cancelImport: (id) => ipcRenderer.invoke('links:cancel', id),
  copyVideo: (data, name) => ipcRenderer.invoke('share:copy-video', { data, name }),
  onImportProgress: (fn) => {
    const handler = (_event, progress) => fn(progress)
    ipcRenderer.on('links:progress', handler)
    return () => ipcRenderer.removeListener('links:progress', handler)
  },
})
