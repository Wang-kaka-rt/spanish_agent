import Editor from '@monaco-editor/react'
import { useEffect, useMemo, useState } from 'react'

import { api } from '../../api/client'
import { Panel } from '../../components/Panel'
import { useSettingsStore } from '../../store/settings'
import type { ContractItem } from '../../types'

export function ContractGeneratePage() {
  const serverUrl = useSettingsStore((state) => state.serverUrl)
  const modelConfig = useSettingsStore((state) => state.modelConfig)
  const settings = useMemo(() => ({ serverUrl, modelConfig }), [serverUrl, modelConfig])
  const [orderInput, setOrderInput] = useState('客户王芳，NIE: Y9876543B，服务：家庭团聚居留，费用：1900欧。')
  const [contracts, setContracts] = useState<ContractItem[]>([])
  const [active, setActive] = useState<ContractItem | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [statusText, setStatusText] = useState('')

  const loadContracts = async () => {
    setLoadingHistory(true)
    try {
      const data = await api.listContracts(settings)
      setContracts(data)
      if (!active && data[0]) {
        setActive(data[0])
      }
    } catch (requestError) {
      setError(String(requestError))
    } finally {
      setLoadingHistory(false)
    }
  }

  useEffect(() => {
    void loadContracts()
  }, [settings])

  const handleGenerate = async () => {
    if (!orderInput.trim()) {
      setError('请先输入订单信息。')
      return
    }
    setLoading(true)
    setError('')
    try {
      const contract = await api.generateContract(settings, {
        order_input: orderInput,
        model_config: settings.modelConfig
      })
      setActive(contract)
      setContracts((prev) => [contract, ...prev])
    } catch (requestError) {
      setError(String(requestError))
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!active) return
    setSaving(true)
    try {
      const updated = await api.updateContract(settings, active.id, {
        title: active.title,
        generated_text: active.generated_text ?? '',
        status: active.status
      })
      setActive(updated)
      setContracts((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      setStatusText('合同已保存。')
    } catch (requestError) {
      setError(String(requestError))
    } finally {
      setSaving(false)
    }
  }

  const handleReloadDetail = async (contractId: string) => {
    try {
      const detail = await api.getContract(settings, contractId)
      setActive(detail)
      setError('')
    } catch (requestError) {
      setError(String(requestError))
    }
  }

  const handleDelete = async () => {
    if (!active) return
    if (!window.confirm(`确认删除合同「${active.title}」吗？`)) return
    setDeleting(true)
    try {
      await api.deleteContract(settings, active.id)
      const deletedId = active.id
      setActive(null)
      setContracts((prev) => {
        const next = prev.filter((item) => item.id !== deletedId)
        if (next[0]) {
          void handleReloadDetail(next[0].id)
        }
        return next
      })
      setError('')
      setStatusText('合同已删除。')
    } catch (requestError) {
      setError(String(requestError))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="studio-layout">
      <div className="studio-column studio-column-left">
        <Panel title="生成参数" description="当前连接和模型配置。" className="panel-soft">
          <div className="meta-grid">
            <div className="meta-card">
              <strong>模型</strong>
              <span>{settings.modelConfig.provider}</span>
            </div>
            <div className="meta-card">
              <strong>Model ID</strong>
              <span>{settings.modelConfig.modelId}</span>
            </div>
          </div>
          {statusText ? <div className="status-text">{statusText}</div> : null}
          {error ? <div className="status-error">{error}</div> : null}
          <div className="toolbar wrap">
            <button type="button" onClick={() => void loadContracts()} disabled={loadingHistory}>
              {loadingHistory ? '刷新中...' : '刷新历史'}
            </button>
            <button type="button" onClick={handleGenerate} disabled={loading}>
              {loading ? '生成中...' : '生成合同'}
            </button>
          </div>
        </Panel>
        <Panel title="历史合同" description="最近生成的合同记录。" className="panel-soft">
          {contracts.length === 0 ? (
            <div className="empty">还没有合同记录，先生成一份试试。</div>
          ) : (
            <div className="list">
              {contracts.map((item) => (
                <button type="button" className="list-item" key={item.id} onClick={() => void handleReloadDetail(item.id)}>
                  <strong>{item.title}</strong>
                  <span>{item.status}</span>
                </button>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="studio-column studio-column-main">
        <Panel title="订单信息" description="输入自由文本，由系统自动解析并生成合同。" className="panel-hero">
          <textarea rows={10} value={orderInput} onChange={(event) => setOrderInput(event.target.value)} />
          <div className="toolbar">
            <div className="pill">{settings.modelConfig.provider} / {settings.modelConfig.modelId}</div>
          </div>
        </Panel>

        <Panel title="合同正文" description="生成后可继续编辑并保存。" className="panel-hero">
          {active ? (
            <>
              <input
                value={active.title}
                onChange={(event) => setActive({ ...active, title: event.target.value })}
                placeholder="合同标题"
              />
              <div className="editor-shell">
                <Editor
                  height="540px"
                  defaultLanguage="markdown"
                  value={active.generated_text ?? ''}
                  theme="vs"
                  options={{
                    minimap: { enabled: false },
                    wordWrap: 'on',
                    fontSize: 14,
                    lineNumbersMinChars: 3,
                    automaticLayout: true
                  }}
                  onChange={(value) => setActive({ ...active, generated_text: value ?? '' })}
                />
              </div>
            </>
          ) : (
            <div className="empty">
              {loadingHistory ? '正在加载历史合同...' : '生成后或从历史列表中选择合同后，会在这里显示正文。'}
            </div>
          )}
        </Panel>
      </div>

      <div className="studio-column studio-column-right">
        <Panel title="操作面板" description="保存、导出和合同管理。" className="panel-soft">
          {active ? (
            <div className="action-stack">
              <button type="button" onClick={() => void handleReloadDetail(active.id)}>重新加载详情</button>
              <button type="button" onClick={handleSave} disabled={saving}>{saving ? '保存中...' : '保存合同'}</button>
              <button type="button" onClick={() => void handleDelete()} disabled={deleting}>{deleting ? '删除中...' : '删除合同'}</button>
              <button
                type="button"
                onClick={() => {
                  window.open(api.contractDocxUrl(settings, active.id), '_blank', 'noopener,noreferrer')
                  setStatusText('已触发 DOCX 导出。')
                }}
              >
                导出 DOCX
              </button>
              <button
                type="button"
                onClick={() => {
                  window.open(api.contractPdfUrl(settings, active.id), '_blank', 'noopener,noreferrer')
                  setStatusText('已触发 PDF 导出。')
                }}
              >
                导出 PDF
              </button>
            </div>
          ) : (
            <div className="empty">生成合同后，这里会显示可执行操作。</div>
          )}
        </Panel>

        <Panel title="提取字段" description="系统从订单中识别出的关键信息。" className="panel-soft">
          {active ? (
            <div className="meta-grid meta-grid-compact">
              {Object.entries(active.extracted_fields).map(([key, value]) => (
                <div className="meta-card" key={key}>
                  <strong>{key}</strong>
                  <span>{value}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">生成后将在这里展示结构化字段。</div>
          )}
        </Panel>

        <Panel title="引用法规" description="当前合同关联的法律依据。" className="panel-soft">
          {active && active.laws_used.length > 0 ? (
            <div className="pill-list">
              {active.laws_used.map((law) => (
                <span className="pill" key={law.boe_id}>{law.title}</span>
              ))}
            </div>
          ) : (
            <div className="empty">暂无关联法规。</div>
          )}
        </Panel>
      </div>
    </div>
  )
}
