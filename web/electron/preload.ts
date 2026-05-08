import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (payload: unknown) => ipcRenderer.invoke('settings:set', payload),
  getAppVersion: () => ipcRenderer.invoke('app:getVersion')
})
