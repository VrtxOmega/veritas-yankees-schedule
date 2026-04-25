const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  fetchMLB: (url) => ipcRenderer.invoke('fetch-mlb', url),
  fetchText: (url) => ipcRenderer.invoke('fetch-text', url),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  downloadICS: (ics) => ipcRenderer.invoke('download-ics', ics),
});
