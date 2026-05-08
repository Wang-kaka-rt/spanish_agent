import { useEffect, useState } from 'react'

import { api } from './api/client'
import { AppShell, type AppTab } from './components/AppShell'
import { ContractGeneratePage } from './pages/ContractGenerate'
import { ChatPage } from './pages/Chat'
import { LawLibraryPage } from './pages/LawLibrary'
import { SettingsPage } from './pages/Settings'
import { TemplateManagerPage } from './pages/TemplateManager'
import { useSettingsStore } from './store/settings'
import type { HealthResponse } from './types'

function renderTab(tab: AppTab) {
  switch (tab) {
    case 'contracts':
      return <ContractGeneratePage />
    case 'templates':
      return <TemplateManagerPage />
    case 'laws':
      return <LawLibraryPage />
    case 'chat':
      return <ChatPage />
    case 'settings':
      return <SettingsPage />
    default:
      return null
  }
}

export default function App() {
  const loadFromElectron = useSettingsStore((state) => state.loadFromElectron)
  const loaded = useSettingsStore((state) => state.loaded)
  const serverUrl = useSettingsStore((state) => state.serverUrl)
  const modelConfig = useSettingsStore((state) => state.modelConfig)
  const [tab, setTab] = useState<AppTab>('contracts')
  const [version, setVersion] = useState('0.0.0')
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [healthMessage, setHealthMessage] = useState('正在检查服务器连接...')
  const [healthState, setHealthState] = useState<'checking' | 'connected' | 'error'>('checking')
  const [guidedToSettings, setGuidedToSettings] = useState(false)
  const hasElectronAPI = typeof window !== 'undefined' && typeof window.electronAPI !== 'undefined'

  useEffect(() => {
    if (!hasElectronAPI) {
      setVersion('web-preview')
      return
    }
    void loadFromElectron()
    void window.electronAPI.getAppVersion().then(setVersion)
  }, [hasElectronAPI, loadFromElectron])

  useEffect(() => {
    if (!loaded) return

    let cancelled = false
    setHealthState('checking')
    setHealthMessage('正在检查服务器连接...')

    void api.health({ serverUrl, modelConfig })
      .then((response) => {
        if (cancelled) return
        setHealth(response)
        setHealthState('connected')
        setHealthMessage(`服务器已连接：数据库 ${response.database}，存储 ${response.storage}`)
      })
      .catch((error) => {
        if (cancelled) return
        setHealth(null)
        setHealthState('error')
        setHealthMessage(`服务器连接失败，请检查设置页中的地址。${String(error)}`)
        if (!guidedToSettings) {
          setTab('settings')
          setGuidedToSettings(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [guidedToSettings, loaded, modelConfig, serverUrl])

  if (!hasElectronAPI) {
    return <div className="loading-screen">请从 Electron 桌面窗口打开应用，普通浏览器预览不包含 electronAPI。</div>
  }

  if (!loaded) {
    return <div className="loading-screen">加载本地配置中...</div>
  }

  return (
    <AppShell
      activeTab={tab}
      onChange={setTab}
      version={version}
      connectionStatus={{
        kind: healthState,
        message: health ? `${healthMessage}，服务：${health.app}` : healthMessage
      }}
    >
      {renderTab(tab)}
    </AppShell>
  )
}
