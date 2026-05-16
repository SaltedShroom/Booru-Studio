const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcher', {
  chooseElectron: () => ipcRenderer.send('launcher-choice', 'electron'),
  chooseBrowser:  () => ipcRenderer.send('launcher-choice', 'browser'),
  quit:           () => ipcRenderer.send('launcher-choice', 'close'),
});
