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

function TabPages({ activeTab }: { activeTab: AppTab }) {
  const tabs: AppTab[] = ['chat', 'contracts', 'templates', 'laws', 'settings']
  return (
    <>
      {tabs.map((tab) => (
        <div
          key={tab}
          style={{ display: activeTab === tab ? 'flex' : 'none', flex: 1, minHeight: 0, overflow: 'hidden' }}
        >
          {tab === 'contracts' && <ContractGeneratePage />}
          {tab === 'templates' && <TemplateManagerPage />}
          {tab === 'laws'      && <LawLibraryPage />}
          {tab === 'chat'      && <ChatPage />}
          {tab === 'settings'  && <SettingsPage />}
        </div>
      ))}
    </>
  )
}

export default function App() {
  const loadFromElectron = useSettingsStore((s) => s.loadFromElectron)
  const loaded           = useSettingsStore((s) => s.loaded)
  const serverUrl        = useSettingsStore((s) => s.serverUrl)
  const modelConfig      = useSettingsStore((s) => s.modelConfig)

  const [tab, setTab]         = useState<AppTab>('chat')
  const [version, setVersion] = useState('0.0.0')
  const [health, setHealth]   = useState<HealthResponse | null>(null)
  const [healthKind, setHealthKind] = useState<'checking' | 'connected' | 'error'>('checking')
  const [healthMsg, setHealthMsg]   = useState('正在检查服务器连接...')
  const [guidedToSettings, setGuidedToSettings] = useState(false)

  const hasElectronAPI = typeof window !== 'undefined' && typeof window.electronAPI !== 'undefined'

  useEffect(() => {
    if (!hasElectronAPI) { setVersion('web-preview'); return }
    void loadFromElectron()
    void window.electronAPI.getAppVersion().then(setVersion)
  }, [hasElectronAPI, loadFromElectron])

  useEffect(() => {
    if (!loaded) return
    let cancelled = false
    setHealthKind('checking')
    setHealthMsg('正在检查服务器连接...')

    void api.health({ serverUrl, modelConfig })
      .then((res) => {
        if (cancelled) return
        setHealth(res)
        setHealthKind('connected')
        setHealthMsg(`已连接 · DB: ${res.database} · Storage: ${res.storage}`)
      })
      .catch(() => {
        if (cancelled) return
        setHealth(null)
        setHealthKind('error')
        setHealthMsg('服务器连接失败，请检查设置页中的地址。')
        if (!guidedToSettings) { setTab('settings'); setGuidedToSettings(true) }
      })

    return () => { cancelled = true }
  }, [loaded, serverUrl, modelConfig, guidedToSettings])

  if (!hasElectronAPI) {
    return (
      <div className="loading-screen">
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--indigo-50)', border: '1px solid var(--indigo-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--indigo-600)', marginBottom: 8 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
        </div>
        <span style={{ color: 'var(--gray-600)', fontSize: 14, fontWeight: 500 }}>Spanish Agent</span>
        <span style={{ color: 'var(--gray-400)', fontSize: 12 }}>请从 Electron 桌面窗口打开应用</span>
      </div>
    )
  }

  if (!loaded) {
    return (
      <div className="loading-screen">
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid var(--indigo-200)', borderTopColor: 'var(--indigo-600)', animation: 'spin 0.8s linear infinite' }} />
        <span style={{ color: 'var(--gray-500)', fontSize: 13 }}>加载本地配置中...</span>
      </div>
    )
  }

  return (
    <AppShell
      activeTab={tab}
      onChange={setTab}
      version={version}
      connectionStatus={{ kind: healthKind, message: healthMsg }}
    >
      <TabPages activeTab={tab} />
    </AppShell>
  )
}
