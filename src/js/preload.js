const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: (defaultPath) => ipcRenderer.invoke('select-folder', defaultPath),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getUserDataOutputPath: () => ipcRenderer.invoke('get-user-data-output-path'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  saveMosaicFile: (imageUrl, defaultFilename) => ipcRenderer.invoke('save-mosaic-file', imageUrl, defaultFilename),
  copyFiles: (sourceFile, destFile) => ipcRenderer.invoke('copy-files', sourceFile, destFile),
  cropImage: (sourceFile, destFile, targetX, targetY, postAspectRatio) => ipcRenderer.invoke('crop-image', sourceFile, destFile, targetX, targetY, postAspectRatio),
  resizeImage: (sourceFile, destFile, targetWidth, targetHeight) => ipcRenderer.invoke('resize-image', sourceFile, destFile, targetWidth, targetHeight),
  convertFileType: (sourceFile, destFile, fileType) => ipcRenderer.invoke('convert-file-type', sourceFile, destFile, fileType),
  deleteFiles: (filePaths) => ipcRenderer.invoke('delete-files', filePaths),
  getFileSizes: (filePaths) => ipcRenderer.invoke('get-file-sizes', filePaths),
  onUpdateProgress: (callback) => ipcRenderer.on('update-progress', callback),
});
