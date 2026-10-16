// The only bridge between the app and the desktop shell: importing songs and footage from links,
// and copying a finished video to the clipboard as a file.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('autoclipDesktop', {
  importLink: (id, url, mode) => ipcRenderer.invoke('links:import', { id, url, mode }),
  cancelImport: (id) => ipcRenderer.invoke('links:cancel', id),
  releaseImport: (name) => ipcRenderer.invoke('links:release', name),
  copyVideo: (data, name) => ipcRenderer.invoke('share:copy-video', { data, name }),
  postVideo: (data, name, url) => ipcRenderer.invoke('share:post', { data, name, url }),
  library: {
    list: () => ipcRenderer.invoke('library:list'),
    add: (item) => ipcRenderer.invoke('library:add', item),
    update: (id, patch) => ipcRenderer.invoke('library:update', { id, patch }),
    remove: (ids) => ipcRenderer.invoke('library:remove', ids),
    handoff: (id, platform) => ipcRenderer.invoke('library:handoff', { id, platform }),
    reveal: (id) => ipcRenderer.invoke('library:reveal', id),
    onChange: (fn) => {
      const handler = () => fn()
      ipcRenderer.on('library:changed', handler)
      return () => ipcRenderer.removeListener('library:changed', handler)
    },
  },
  onImportProgress: (fn) => {
    const handler = (_event, progress) => fn(progress)
    ipcRenderer.on('links:progress', handler)
    return () => ipcRenderer.removeListener('links:progress', handler)
  },
})
