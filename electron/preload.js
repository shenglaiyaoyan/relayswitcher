'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rs', {
  windowMinimize: () => ipcRenderer.send('rs:win', 'minimize'),
  windowMaximize: () => ipcRenderer.send('rs:win', 'maximize'),
  windowClose: () => ipcRenderer.send('rs:win', 'close'),
  getState: () => ipcRenderer.invoke('rs:getState'),
  importAccount: (json, label) => ipcRenderer.invoke('rs:importAccount', json, label),
  deleteAccount: (id) => ipcRenderer.invoke('rs:deleteAccount', id),
  saveRelay: (relay) => ipcRenderer.invoke('rs:saveRelay', relay),
  deleteRelay: (id) => ipcRenderer.invoke('rs:deleteRelay', id),
  testRelay: (id) => ipcRenderer.invoke('rs:testRelay', id),
  doSwitch: (opts) => ipcRenderer.invoke('rs:switch', opts),
  detectCodex: () => ipcRenderer.invoke('rs:detectCodex'),
  checkUpdate: () => ipcRenderer.invoke('rs:checkUpdate'),
  quitAndInstall: () => ipcRenderer.invoke('rs:quitAndInstall'),
  getVersion: () => ipcRenderer.invoke('rs:getVersion'),
  onUpdateEvent: (cb) => {
    const h = (_e, data) => cb(data);
    ipcRenderer.on('rs:update-event', h);
    return () => ipcRenderer.removeListener('rs:update-event', h);
  },
  listBackups: () => ipcRenderer.invoke('rs:listBackups'),
  restoreBackup: (id) => ipcRenderer.invoke('rs:restoreBackup', id),
  saveSettings: (s) => ipcRenderer.invoke('rs:saveSettings', s),
  onSwitchStep: (cb) => {
    const h = (_e, step) => cb(step);
    ipcRenderer.on('rs:switch-step', h);
    return () => ipcRenderer.removeListener('rs:switch-step', h);
  }
});
