import { app, BrowserWindow, ipcMain } from 'electron'
import Store from 'electron-store'
import path from 'node:path'

const defaultModelConfig = {
  provider: 'anthropic',
  apiKey: '',
  baseUrl: '',
  modelId: 'claude-opus-4-1',
  temperature: 0.1
}

const defaultProfile = {
  id: 'default-anthropic',
  name: 'Anthropic 默认',
  config: defaultModelConfig
}

const store = new Store({
  name: 'spanish-agent',
  defaults: {
    serverUrl: 'http://127.0.0.1:8000',
    modelProfiles: [defaultProfile],
    activeModelProfileId: defaultProfile.id,
    modelConfig: defaultModelConfig
  }
})

function normalizeSettings() {
  const serverUrl = String(store.get('serverUrl', 'http://127.0.0.1:8000'))
  const legacyModelConfig = store.get('modelConfig', defaultModelConfig) as typeof defaultModelConfig
  const storedProfiles = store.get('modelProfiles', []) as Array<{ id: string; name: string; config: typeof defaultModelConfig }>
  const modelProfiles = storedProfiles.length > 0 ? storedProfiles : [{ ...defaultProfile, config: legacyModelConfig }]
  const activeModelProfileId = String(store.get('activeModelProfileId', modelProfiles[0].id))
  const activeProfile = modelProfiles.find((profile) => profile.id === activeModelProfileId) ?? modelProfiles[0]

  return {
    serverUrl,
    modelProfiles,
    activeModelProfileId: activeProfile.id,
    modelConfig: activeProfile.config
  }
}

function createWindow(): void {
  const useCustomTitleBarOverlay = process.platform !== 'darwin'

  const win = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1200,
    minHeight: 800,
    autoHideMenuBar: true,
    ...(useCustomTitleBarOverlay
      ? {
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: {
            color: '#111827',
            symbolColor: '#9CA3AF',
            height: 32
          }
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (rendererUrl) {
    win.loadURL(rendererUrl)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  win.webContents.on('did-finish-load', async () => {
    try {
      const electronApiType = await win.webContents.executeJavaScript('typeof window.electronAPI')
      console.log('[electron-debug] window.electronAPI =', electronApiType)
    } catch (error) {
      console.error('[electron-debug] failed to inspect renderer bridge', error)
    }
  })
}

app.whenReady().then(() => {
  ipcMain.handle('settings:get', () => normalizeSettings())

  ipcMain.handle('settings:set', (_event, payload) => {
    store.set('serverUrl', payload.serverUrl)
    store.set('modelProfiles', payload.modelProfiles)
    store.set('activeModelProfileId', payload.activeModelProfileId)
    store.set('modelConfig', payload.modelConfig)
    return normalizeSettings()
  })

  ipcMain.handle('app:getVersion', () => app.getVersion())
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
