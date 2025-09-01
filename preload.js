/*  preload.js — exposes IPC channels to the renderer  */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveData    : (data)            => ipcRenderer.invoke('save-data',      data),
  loadData    : ()                => ipcRenderer.invoke('load-data'),
  saveQRImage : (img, name)       => ipcRenderer.invoke('save-qr-image',  img, name),

  /* menu events from main process */
  onExportData: (cb)              => ipcRenderer.on('export-data',  cb),
  onImportData: (cb)              => ipcRenderer.on('import-data',  cb)
});
