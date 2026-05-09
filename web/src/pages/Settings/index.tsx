import { CheckCircle2, Eye, EyeOff, Loader2, Plus, Server, Star, Trash2, X, XCircle, Zap } from 'lucide-react'
import { useState } from 'react'

import { api } from '../../api/client'
import { useSettingsStore } from '../../store/settings'
import type { ModelConfig, ModelProfile } from '../../types'

function newProfile(): ModelProfile {
  return {
    id: `profile-${Date.now()}`,
    name: '新配置',
    config: { provider: 'anthropic', apiKey: '', baseUrl: '', modelId: 'claude-opus-4-7', temperature: 0.1 },
  }
}

function providerTypeIcon(provider: string) {
  switch (provider) {
    case 'anthropic':        return <div className="model-type-icon type-anthropic"><Zap size={16} /></div>
    case 'openai_compatible': return <div className="model-type-icon type-openai"><Zap size={16} /></div>
    default:                  return <div className="model-type-icon type-local"><Zap size={16} /></div>
  }
}

function providerLabel(p: string) {
  switch (p) {
    case 'anthropic':        return 'Anthropic'
    case 'local':            return 'Local / Ollama'
    case 'openai_compatible': return 'OpenAI Compatible'
    default: return p
  }
}

interface ModelEditorProps {
  profile: ModelProfile
  onUpdate: (patch: Partial<ModelConfig>) => void
  onClose: () => void
  serverUrl: string
}

type TestStatus = { kind: 'idle' } | { kind: 'testing' } | { kind: 'ok'; latency: number } | { kind: 'err'; msg: string }

function ModelEditor({ profile, onUpdate, onClose, serverUrl }: ModelEditorProps) {
  const [showKey, setShowKey] = useState(false)
  const [testStatus, setTestStatus] = useState<TestStatus>({ kind: 'idle' })
  const cfg = profile.config

  const handleTest = async () => {
    setTestStatus({ kind: 'testing' })
    try {
      const res = await api.testModel(serverUrl, cfg)
      if (res.ok) {
        setTestStatus({ kind: 'ok', latency: res.latency_ms })
      } else {
        setTestStatus({ kind: 'err', msg: res.error ?? '连接失败' })
      }
    } catch (e) {
      setTestStatus({ kind: 'err', msg: String(e) })
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 520 }}>
        <div className="modal-header">
          <div className="modal-header-text">
            <h4>{profile.name}</h4>
            <p>编辑 AI 模型连接配置</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="model-editor-fields">
          {/* Provider type selector */}
          <div className="field">
            <label>Provider 类型</label>
            <div className="type-selector-grid">
              {(['anthropic', 'openai_compatible', 'local'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`type-option${cfg.provider === p ? ' active' : ''}`}
                  onClick={() => onUpdate({ provider: p })}
                >
                  <div className="type-option-top">
                    <span className={`type-dot ${p === 'anthropic' ? 'dot-orange' : p === 'openai_compatible' ? 'dot-emerald' : 'dot-indigo'}`} />
                    <span className="type-option-label">
                      {p === 'anthropic' ? 'Anthropic' : p === 'openai_compatible' ? 'OpenAI' : 'Local'}
                    </span>
                  </div>
                  <div className="type-option-hint">
                    {p === 'anthropic' ? 'Claude 系列模型' : p === 'openai_compatible' ? 'DeepSeek / GPT' : 'Ollama 本地模型'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Model ID */}
          <div className="field">
            <label>Model ID</label>
            <input
              value={cfg.modelId}
              onChange={(e) => onUpdate({ modelId: e.target.value })}
              placeholder={cfg.provider === 'anthropic' ? 'claude-opus-4-7' : cfg.provider === 'local' ? 'llama3:latest' : 'deepseek-chat'}
            />
          </div>

          {/* API Key */}
          <div className="field">
            <label>API Key</label>
            <div className="api-key-row">
              <input
                type={showKey ? 'text' : 'password'}
                className="api-key-input"
                value={cfg.apiKey}
                onChange={(e) => onUpdate({ apiKey: e.target.value })}
                placeholder={cfg.provider === 'anthropic' ? 'sk-ant-...' : cfg.provider === 'local' ? '（可选）' : 'sk-...'}
              />
              <button type="button" className="api-key-toggle" onClick={() => setShowKey(!showKey)}>
                {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          </div>

          {/* Base URL */}
          <div className="field">
            <label>Base URL</label>
            <input
              value={cfg.baseUrl}
              onChange={(e) => onUpdate({ baseUrl: e.target.value })}
              placeholder={
                cfg.provider === 'local' ? 'http://localhost:11434/v1'
                  : cfg.provider === 'openai_compatible' ? 'https://api.deepseek.com/v1'
                  : '（可选，留空使用官方地址）'
              }
            />
          </div>

          {/* Temperature */}
          <div className="field" style={{ maxWidth: 200 }}>
            <label>Temperature</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={cfg.temperature}
              onChange={(e) => onUpdate({ temperature: parseFloat(e.target.value) })}
            />
            <span className="field-hint">0 = 确定性输出 · 1+ = 更有创意</span>
          </div>
        </div>

        <div className="modal-footer" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
          {testStatus.kind !== 'idle' && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
              borderRadius: 'var(--r-md)', fontSize: 12.5,
              background: testStatus.kind === 'ok' ? 'var(--green-50)' : testStatus.kind === 'err' ? 'var(--red-50)' : 'var(--indigo-50)',
              border: `1px solid ${testStatus.kind === 'ok' ? 'var(--green-100)' : testStatus.kind === 'err' ? 'var(--red-200)' : 'var(--indigo-100)'}`,
              color: testStatus.kind === 'ok' ? 'var(--green-700)' : testStatus.kind === 'err' ? 'var(--red-600)' : 'var(--indigo-700)',
            }}>
              {testStatus.kind === 'testing' && <Loader2 size={13} className="spin-anim" />}
              {testStatus.kind === 'ok'      && <CheckCircle2 size={13} />}
              {testStatus.kind === 'err'     && <XCircle size={13} />}
              <span>
                {testStatus.kind === 'testing' && '正在测试连接…'}
                {testStatus.kind === 'ok'      && `连接成功 · 响应 ${testStatus.latency} ms`}
                {testStatus.kind === 'err'     && testStatus.msg}
              </span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => void handleTest()}
              disabled={testStatus.kind === 'testing'}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {testStatus.kind === 'testing'
                ? <><span className="btn-spinner dark" />测试中</>
                : '检查连接'}
            </button>
            <button type="button" onClick={onClose}>关闭</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function SettingsPage() {
  const serverUrl            = useSettingsStore((s) => s.serverUrl)
  const modelConfig          = useSettingsStore((s) => s.modelConfig)
  const modelProfiles        = useSettingsStore((s) => s.modelProfiles)
  const activeModelProfileId = useSettingsStore((s) => s.activeModelProfileId)
  const setServerUrl         = useSettingsStore((s) => s.setServerUrl)
  const setModelConfig       = useSettingsStore((s) => s.setModelConfig)
  const addModelProfile      = useSettingsStore((s) => s.addModelProfile)
  const updateModelProfile   = useSettingsStore((s) => s.updateModelProfile)
  const deleteModelProfile   = useSettingsStore((s) => s.deleteModelProfile)
  const setActiveModelProfileId = useSettingsStore((s) => s.setActiveModelProfileId)
  const persist              = useSettingsStore((s) => s.persist)

  const [testStatus, setTestStatus] = useState<{ kind: 'idle' | 'checking' | 'ok' | 'err'; msg: string }>({ kind: 'idle', msg: '' })
  const [saving, setSaving] = useState(false)
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null)

  const settings = { serverUrl, modelConfig }

  const handleTest = async () => {
    if (!serverUrl.trim()) { setTestStatus({ kind: 'err', msg: '请先填写服务器地址。' }); return }
    setTestStatus({ kind: 'checking', msg: '正在连接...' })
    try {
      const h = await api.health(settings)
      setTestStatus({ kind: 'ok', msg: `数据库: ${h.database} · 存储: ${h.storage} · ${h.app}` })
    } catch (e) { setTestStatus({ kind: 'err', msg: String(e) }) }
  }

  const handleSave = async () => {
    setSaving(true)
    try { await persist(); await handleTest() }
    finally { setSaving(false) }
  }

  const handleProfileConfigChange = (profileId: string, patch: Partial<ModelConfig>) => {
    const profile = modelProfiles.find((p) => p.id === profileId)
    if (!profile) return
    const updated = { ...profile.config, ...patch }
    updateModelProfile(profileId, { config: updated })
    if (profileId === activeModelProfileId) setModelConfig(updated)
  }

  const editingProfile = editingProfileId ? modelProfiles.find((p) => p.id === editingProfileId) ?? null : null

  return (
    <div className="page-body">
      <div className="settings-content">

        {/* ── Server config ── */}
        <div className="section-card">
          <div className="section-card-header">
            <div>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Server size={15} style={{ color: 'var(--gray-500)' }} /> 服务器配置
              </h3>
              <p>API 请求目标地址，仅存储在本地</p>
            </div>
          </div>
          <div className="section-card-body">
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <div className="field" style={{ flex: 1 }}>
                <label>服务器地址</label>
                <input
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  placeholder="http://127.0.0.1:8000"
                />
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button type="button" onClick={() => void handleTest()} disabled={testStatus.kind === 'checking'}>
                  {testStatus.kind === 'checking' ? <><span className="btn-spinner dark" />测试中</> : '测试连接'}
                </button>
                <button type="button" className="btn-primary" onClick={() => void handleSave()} disabled={saving}>
                  {saving ? <><span className="btn-spinner" />保存中</> : '保存'}
                </button>
              </div>
            </div>

            {testStatus.kind !== 'idle' && (
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 'var(--r-md)', fontSize: 12.5,
                background: testStatus.kind === 'ok' ? 'var(--green-50)' : testStatus.kind === 'err' ? 'var(--red-50)' : 'var(--indigo-50)',
                border: `1px solid ${testStatus.kind === 'ok' ? 'var(--green-100)' : testStatus.kind === 'err' ? 'var(--red-200)' : 'var(--indigo-100)'}`,
                color: testStatus.kind === 'ok' ? 'var(--green-700)' : testStatus.kind === 'err' ? 'var(--red-600)' : 'var(--indigo-700)',
              }}>
                {testStatus.kind === 'ok' && <CheckCircle2 size={14} />}
                {testStatus.kind === 'err' && <XCircle size={14} />}
                {testStatus.kind === 'checking' && <span className="btn-spinner dark" />}
                <span>{testStatus.msg}</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Model profiles ── */}
        <div className="section-card">
          <div className="section-card-header">
            <div>
              <h3>模型配置</h3>
              <p>API Key 仅存本地，不上传服务器</p>
            </div>
            <button type="button" className="btn-primary btn-sm" onClick={() => addModelProfile(newProfile())}>
              <Plus size={13} /> 新建配置
            </button>
          </div>
          <div className="section-card-body">
            <div className="model-grid">
              {modelProfiles.map((profile) => {
                const isDefault = profile.id === activeModelProfileId
                return (
                  <div key={profile.id} className={`model-card${isDefault ? ' default' : ''}`}>
                    <div className="model-card-top">
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        {providerTypeIcon(profile.config.provider)}
                        <div>
                          <div className="model-card-name">
                            {profile.name}
                            {isDefault && <Star size={12} style={{ color: 'var(--indigo-600)' }} fill="var(--indigo-600)" />}
                          </div>
                          <div className={`model-type-badge ${profile.config.provider === 'anthropic' ? 'type-anthropic' : profile.config.provider === 'openai_compatible' ? 'type-openai' : 'type-local'}`}>
                            {providerLabel(profile.config.provider)}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn-danger btn-sm btn-icon"
                        disabled={modelProfiles.length === 1}
                        onClick={() => deleteModelProfile(profile.id)}
                        title="删除"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>

                    <dl className="model-card-dl">
                      <dt className="model-card-dt">Model</dt>
                      <dd className="model-card-dd">{profile.config.modelId || '未设置'}</dd>
                      <dt className="model-card-dt">Key</dt>
                      <dd className="model-card-dd">{profile.config.apiKey ? '••••••••' : '未设置'}</dd>
                      {profile.config.baseUrl && (
                        <>
                          <dt className="model-card-dt">URL</dt>
                          <dd className="model-card-dd">{profile.config.baseUrl}</dd>
                        </>
                      )}
                    </dl>

                    <div className="model-card-footer">
                      <button type="button" className="btn-sm btn-ghost" onClick={() => setEditingProfileId(profile.id)}>
                        编辑
                      </button>
                      {isDefault ? (
                        <span className="badge badge-indigo">当前使用</span>
                      ) : (
                        <button
                          type="button"
                          className="btn-primary btn-sm"
                          onClick={() => {
                            setActiveModelProfileId(profile.id)
                            setModelConfig(profile.config)
                          }}
                        >
                          设为当前
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* Add card */}
              <button type="button" className="add-model-card" onClick={() => addModelProfile(newProfile())}>
                <div className="add-model-icon"><Plus size={18} /></div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>添加新配置</div>
                <div style={{ fontSize: 11.5 }}>支持多个模型并行</div>
              </button>
            </div>
          </div>
        </div>

        {/* ── Save all ── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn-primary" onClick={() => void handleSave()} disabled={saving}>
            {saving ? <><span className="btn-spinner" />保存中</> : '保存所有配置'}
          </button>
        </div>
      </div>

      {/* Model editor modal */}
      {editingProfile && (
        <ModelEditor
          profile={editingProfile}
          onUpdate={(patch) => handleProfileConfigChange(editingProfile.id, patch)}
          onClose={() => setEditingProfileId(null)}
          serverUrl={serverUrl}
        />
      )}
    </div>
  )
}
