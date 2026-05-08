import { Bot, FileStack, Gavel, Rocket, Settings as SettingsIcon, Sparkles, UserCircle2 } from 'lucide-react'
import type { ReactNode } from 'react'

export type AppTab = 'contracts' | 'templates' | 'laws' | 'chat' | 'settings'

const items: Array<{ key: AppTab; label: string; icon: ReactNode }> = [
  { key: 'contracts', label: '合同生成', icon: <Sparkles size={18} /> },
  { key: 'templates', label: '模板管理', icon: <FileStack size={18} /> },
  { key: 'laws', label: '法律库', icon: <Gavel size={18} /> },
  { key: 'chat', label: '法律问答', icon: <Bot size={18} /> },
  { key: 'settings', label: '设置', icon: <SettingsIcon size={18} /> }
]

interface Props {
  activeTab: AppTab
  onChange: (tab: AppTab) => void
  children: ReactNode
  version: string
  connectionStatus?: {
    kind: 'checking' | 'connected' | 'error'
    message: string
  }
}

export function AppShell({ activeTab, onChange, children, version, connectionStatus }: Props) {
  const activeItem = items.find((item) => item.key === activeTab)

  return (
    <div className="workspace-stage">
      <div className="workspace-board">
        <aside className="sidebar">
          <div className="brand-block">
            <div className="brand-mark">SA</div>
            <div className="brand-copy">
              <h1>Spanish Agent</h1>
              <p>Legal workflow studio</p>
            </div>
          </div>
          <nav className="nav-list">
            {items.map((item) => (
              <button
                type="button"
                key={item.key}
                className={item.key === activeTab ? 'nav-item active' : 'nav-item'}
                onClick={() => onChange(item.key)}
              >
                <div className="nav-icon">{item.icon}</div>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
          <div className="sidebar-footer">v{version}</div>
        </aside>
        <main className="content">
          <header className="content-header">
            <div>
              <div className="content-eyebrow">Workspace</div>
              <h2>{activeItem?.label ?? '工作台'}</h2>
            </div>
            <div className="header-actions">
              <button type="button" className="ghost-action">
                <Rocket size={16} />
                <span>测试功能</span>
              </button>
              <div className="avatar-chip">
                <UserCircle2 size={18} />
                <span>Admin</span>
              </div>
            </div>
          </header>
          {connectionStatus ? (
            <div className={`status-pill ${connectionStatus.kind}`}>{connectionStatus.message}</div>
          ) : null}
          <div className="content-shell">{children}</div>
        </main>
      </div>
    </div>
  )
}
