import { useState } from 'react'

import { api } from '../../api/client'
import { Panel } from '../../components/Panel'
import { useSettingsStore } from '../../store/settings'
import type { ModelConfig, ModelProfile } from '../../types'

function createEmptyProfile(): ModelProfile {
  return {
    id: `profile-${Date.now()}`,
    name: '新配置',
    config: {
      provider: 'anthropic',
      apiKey: '',
      baseUrl: '',
      modelId: 'claude-opus-4-1',
      temperature: 0.1
    }
  }
}

export function SettingsPage() {
  const serverUrl = useSettingsStore((state) => state.serverUrl)
  const modelConfig = useSettingsStore((state) => state.modelConfig)
  const modelProfiles = useSettingsStore((state) => state.modelProfiles)
  const activeModelProfileId = useSettingsStore((state) => state.activeModelProfileId)
  const setServerUrl = useSettingsStore((state) => state.setServerUrl)
  const setModelConfig = useSettingsStore((state) => state.setModelConfig)
  const addModelProfile = useSettingsStore((state) => state.addModelProfile)
  const updateModelProfile = useSettingsStore((state) => state.updateModelProfile)
  const deleteModelProfile = useSettingsStore((state) => state.deleteModelProfile)
  const setActiveModelProfileId = useSettingsStore((state) => state.setActiveModelProfileId)
  const persist = useSettingsStore((state) => state.persist)
  const [testStatus, setTestStatus] = useState('')
  const [saving, setSaving] = useState(false)

  const settings = { serverUrl, modelConfig }
  const activeProfile = modelProfiles.find((profile) => profile.id === activeModelProfileId) ?? modelProfiles[0]

  const validateSettings = (): string | null => {
    if (!serverUrl.trim()) return '请先填写服务器地址。'
    if (!modelConfig.modelId.trim()) return '请先填写模型 ID。'
    if (modelConfig.provider === 'anthropic' && !modelConfig.apiKey.trim()) return 'Anthropic 模式需要 API Key。'
    if ((modelConfig.provider === 'local' || modelConfig.provider === 'openai_compatible') && !modelConfig.baseUrl.trim()) {
      return '本地或 OpenAI 兼容模式需要 Base URL。'
    }
    return null
  }

  const handleActiveConfigChange = (nextConfig: Partial<ModelConfig>) => {
    if (!activeProfile) return
    const updatedConfig = { ...activeProfile.config, ...nextConfig }
    updateModelProfile(activeProfile.id, { config: updatedConfig })
    setModelConfig(updatedConfig)
  }

  const handleTest = async () => {
    const validationError = validateSettings()
    if (validationError) {
      setTestStatus(validationError)
      return
    }
    try {
      const health = await api.health(settings)
      setTestStatus(`连接成功: ${health.database} / ${health.storage}`)
    } catch (error) {
      setTestStatus(`连接失败: ${String(error)}`)
    }
  }

  const handleSave = async () => {
    const validationError = validateSettings()
    if (validationError) {
      setTestStatus(validationError)
      return
    }
    setSaving(true)
    try {
      await persist()
      setTestStatus('配置已保存，正在重新测试连接...')
      await handleTest()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid two-columns">
      <Panel title="服务器配置" description="服务器地址只存本地 Electron。">
        <input value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} placeholder="http://127.0.0.1:8000" />
        <div className="toolbar">
          <button type="button" onClick={handleTest}>测试连接</button>
          <button type="button" onClick={() => void handleSave()} disabled={saving}>
            {saving ? '保存中...' : '保存配置'}
          </button>
        </div>
        <div className="status-text">{testStatus}</div>
      </Panel>
      <Panel title="模型配置" description="支持在线 API、本地模型和 OpenAI 兼容服务。">
        <div className="toolbar wrap">
          <button
            type="button"
            onClick={() => {
              const profile = createEmptyProfile()
              addModelProfile(profile)
              setTestStatus('已创建新模型配置，请填写参数后保存。')
            }}
          >
            新建配置
          </button>
        </div>
        <div className="list">
          {modelProfiles.map((profile) => (
            <div className="list-item static" key={profile.id}>
              <div className="settings-profile">
                <input
                  value={profile.name}
                  onChange={(event) => updateModelProfile(profile.id, { name: event.target.value })}
                  placeholder="配置名称"
                />
                <p>{profile.config.provider} / {profile.config.modelId || '未填写模型 ID'}</p>
              </div>
              <div className="toolbar wrap">
                <button type="button" onClick={() => setActiveModelProfileId(profile.id)}>
                  {profile.id === activeModelProfileId ? '当前使用中' : '设为当前'}
                </button>
                <button type="button" onClick={() => deleteModelProfile(profile.id)} disabled={modelProfiles.length === 1}>
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
        {activeProfile ? (
          <>
            <select
              value={activeProfile.config.provider}
              onChange={(event) => handleActiveConfigChange({ provider: event.target.value as ModelConfig['provider'] })}
            >
              <option value="anthropic">Anthropic</option>
              <option value="local">Local / Ollama</option>
              <option value="openai_compatible">OpenAI Compatible</option>
            </select>
            <input
              value={activeProfile.config.modelId}
              onChange={(event) => handleActiveConfigChange({ modelId: event.target.value })}
              placeholder="模型 ID"
            />
            <input
              value={activeProfile.config.baseUrl}
              onChange={(event) => handleActiveConfigChange({ baseUrl: event.target.value })}
              placeholder="Base URL"
            />
            <input
              value={activeProfile.config.apiKey}
              onChange={(event) => handleActiveConfigChange({ apiKey: event.target.value })}
              placeholder="API Key"
            />
            <input
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={activeProfile.config.temperature}
              onChange={(event) => handleActiveConfigChange({ temperature: Number(event.target.value) })}
            />
          </>
        ) : null}
      </Panel>
    </div>
  )
}
