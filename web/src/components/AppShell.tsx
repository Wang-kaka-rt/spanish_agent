import { Bot, FileStack, Gavel, Sparkles, Settings as SettingsIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export type AppTab = 'contracts' | 'templates' | 'laws' | 'chat' | 'settings'

const MAIN_NAV: Array<{ key: AppTab; label: string; icon: ReactNode }> = [
  { key: 'chat',      label: '法律问答', icon: <Bot size={15} /> },
  { key: 'contracts', label: '合同生成', icon: <Sparkles size={15} /> },
  { key: 'templates', label: '模板管理', icon: <FileStack size={15} /> },
  { key: 'laws',      label: '法律库',   icon: <Gavel size={15} /> },
]

const SYS_NAV: Array<{ key: AppTab; label: string; icon: ReactNode }> = [
  { key: 'settings', label: '设置', icon: <SettingsIcon size={15} /> },
]

interface ConnectionStatus {
  kind: 'checking' | 'connected' | 'error'
  message: string
}

interface Props {
  activeTab: AppTab
  onChange: (tab: AppTab) => void
  children: ReactNode
  version: string
  connectionStatus?: ConnectionStatus
}

export function AppShell({ activeTab, onChange, children, version, connectionStatus }: Props) {
  const dotClass = connectionStatus?.kind === 'connected' ? 'ok'
    : connectionStatus?.kind === 'error' ? 'err'
    : 'checking'

  return (
    <div className="app-root">
      {/* ── macOS Title Bar ── */}
      <div className="title-bar">
        <div className="title-bar-dots">
          <div className="title-bar-dot red" />
          <div className="title-bar-dot yellow" />
          <div className="title-bar-dot green" />
        </div>
        <div className="title-bar-title">Spanish Agent · Legal Workflow</div>
      </div>

      {/* ── Body (sidebar + main) ── */}
      <div className="app-body">
        {/* ── Sidebar ── */}
        <aside className="sidebar">
          {/* Brand */}
          <div className="sidebar-brand">
            <div className="sidebar-brand-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
            </div>
            <div className="sidebar-brand-name">Spanish Agent</div>
          </div>

          <div className="sidebar-divider" />

          {/* Main nav group */}
          <div className="sidebar-nav-group">
            <span className="sidebar-nav-group-label">主功能</span>
            <div className="sidebar-nav-items">
              {MAIN_NAV.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`nav-btn${item.key === activeTab ? ' active' : ''}`}
                  onClick={() => onChange(item.key)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="sidebar-spacer" />

          {/* System nav group */}
          <div className="sidebar-nav-group">
            <span className="sidebar-nav-group-label">系统</span>
            <div className="sidebar-nav-items">
              {SYS_NAV.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`nav-btn${item.key === activeTab ? ' active' : ''}`}
                  onClick={() => onChange(item.key)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="sidebar-footer">
            <span className={`conn-dot ${dotClass}`} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
              {connectionStatus?.kind === 'checking' ? '连接中...'
                : connectionStatus?.kind === 'connected' ? '服务器已连接'
                : connectionStatus?.kind === 'error' ? '连接失败'
                : `v${version}`}
            </span>
          </div>
        </aside>

        {/* ── Main area ── */}
        <main className="app-main">
          {children}
        </main>
      </div>
    </div>
  )
}
