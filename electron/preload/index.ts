import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  backendUrl: ipcRenderer.sendSync('get-backend-url-sync'),
  getBackendUrl: () => ipcRenderer.invoke('get-backend-url'),
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
  openDirectory: () => ipcRenderer.invoke('open-directory'),
});
