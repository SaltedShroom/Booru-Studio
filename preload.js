const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: (defaultPath) => ipcRenderer.invoke('select-folder', defaultPath),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getUserDataOutputPath: () => ipcRenderer.invoke('get-user-data-output-path'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  onUpdateProgress: (callback) => ipcRenderer.on('update-progress', callback),
});
