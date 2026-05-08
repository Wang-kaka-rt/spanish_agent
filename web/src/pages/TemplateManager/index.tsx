import { useEffect, useMemo, useState } from 'react'

import { api } from '../../api/client'
import { Panel } from '../../components/Panel'
import { useSettingsStore } from '../../store/settings'
import type { TemplateItem } from '../../types'

export function TemplateManagerPage() {
  const serverUrl = useSettingsStore((state) => state.serverUrl)
  const modelConfig = useSettingsStore((state) => state.modelConfig)
  const settings = useMemo(() => ({ serverUrl, modelConfig }), [serverUrl, modelConfig])
  const [items, setItems] = useState<TemplateItem[]>([])
  const [category, setCategory] = useState('EXTRANJERIA')
  const [subcategory, setSubcategory] = useState('REAGRUPACION FAMILIAR')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [statusText, setStatusText] = useState('')
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<TemplateItem | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const data = await api.listTemplates(settings)
      setItems(data)
      if (!preview && data[0]) {
        setPreview(data[0])
      }
      setError('')
    } catch (requestError) {
      setError(`加载模板失败：${String(requestError)}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [settings])

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('请先选择模板文件。')
      return
    }
    setSubmitting(true)
    const form = new FormData()
    form.append('file', selectedFile)
    form.append('category', category)
    form.append('subcategory', subcategory)
    try {
      await api.uploadTemplate(settings, form)
      setSelectedFile(null)
      setStatusText('模板上传成功。')
      setError('')
      await load()
    } catch (requestError) {
      setError(`模板上传失败：${String(requestError)}`)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeactivate = async (templateId: string) => {
    try {
      await api.deactivateTemplate(settings, templateId)
      setStatusText('模板已停用。')
      await load()
      if (preview?.id === templateId) {
        setPreview((current) => (current ? { ...current, is_active: false } : current))
      }
    } catch (requestError) {
      setError(`停用模板失败：${String(requestError)}`)
    }
  }

  return (
    <div className="grid two-columns">
      <Panel title="上传模板" description="支持 DOCX/PDF 上传与解析入库。">
        <input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="分类" />
        <input value={subcategory} onChange={(event) => setSubcategory(event.target.value)} placeholder="子分类" />
        <input type="file" accept=".docx,.pdf" onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} />
        <button type="button" onClick={handleUpload} disabled={submitting}>
          {submitting ? '上传中...' : '上传模板'}
        </button>
        {statusText ? <div className="status-text">{statusText}</div> : null}
        {error ? <div className="status-error">{error}</div> : null}
      </Panel>
      <Panel title="模板列表" description="当前服务器内的模板元数据。">
        {loading ? (
          <div className="empty">正在加载模板列表...</div>
        ) : items.length === 0 ? (
          <div className="empty">当前没有模板，先上传一份 DOCX 或 PDF。</div>
        ) : (
          <div className="list">
            {items.map((item) => (
              <div className="list-item static" key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.category} / {item.subcategory ?? '-'}</p>
                </div>
                <div className="toolbar wrap">
                  <button type="button" onClick={() => setPreview(item)}>预览</button>
                  <button type="button" onClick={() => void handleDeactivate(item.id)} disabled={!item.is_active}>
                    {item.is_active ? '停用' : '已停用'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
      <Panel title="模板预览" description="查看模板解析后的正文内容。">
        {preview ? (
          <>
            <div className="meta-grid">
              <div className="meta-card">
                <strong>标题</strong>
                <span>{preview.title}</span>
              </div>
              <div className="meta-card">
                <strong>分类</strong>
                <span>{preview.category} / {preview.subcategory ?? '-'}</span>
              </div>
              <div className="meta-card">
                <strong>状态</strong>
                <span>{preview.is_active ? '启用中' : '已停用'}</span>
              </div>
            </div>
            <div className="preview-box">{preview.raw_text || '该模板暂无可预览内容。'}</div>
          </>
        ) : (
          <div className="empty">从左侧模板列表中选择一项后，可在这里预览正文。</div>
        )}
      </Panel>
    </div>
  )
}
