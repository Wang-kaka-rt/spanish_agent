import type { AppSettings } from './index'

declare global {
  interface Window {
    electronAPI: {
      getSettings: () => Promise<AppSettings>
      setSettings: (payload: AppSettings) => Promise<AppSettings>
      getAppVersion: () => Promise<string>
    }
  }
}

export {}
