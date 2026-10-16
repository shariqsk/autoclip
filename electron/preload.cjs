// The only bridge between the app and the desktop shell: importing songs and footage from links.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('autoclipDesktop', {
  importLink: (id, url, mode) => ipcRenderer.invoke('links:import', { id, url, mode }),
  cancelImport: (id) => ipcRenderer.invoke('links:cancel', id),
  onImportProgress: (fn) => {
    const handler = (_event, progress) => fn(progress)
    ipcRenderer.on('links:progress', handler)
    return () => ipcRenderer.removeListener('links:progress', handler)
  },
})
