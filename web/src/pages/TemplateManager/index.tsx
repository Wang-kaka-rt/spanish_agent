import { FileText, Loader2, PowerOff, Search, Upload, X } from 'lucide-react'
import { renderAsync } from 'docx-preview'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent } from 'react'

import { api } from '../../api/client'
import { useSettingsStore } from '../../store/settings'
import type { TemplateItem } from '../../types'

const CATEGORIES = ['ALL', 'EXTRANJERIA', 'ASESORAMIENTO', 'GESTORIA', 'MERCANTIL']

function categoryBadge(category: string) {
  switch (category.toUpperCase()) {
    case 'EXTRANJERIA':   return <span className="badge badge-indigo">{category}</span>
    case 'ASESORAMIENTO': return <span className="badge badge-confirmed">{category}</span>
    case 'GESTORIA':      return <span className="badge badge-draft">{category}</span>
    default:              return <span className="badge badge-gray">{category}</span>
  }
}

export function TemplateManagerPage() {
  const serverUrl = useSettingsStore((s) => s.serverUrl)
  const modelConfig = useSettingsStore((s) => s.modelConfig)
  const settings = useMemo(() => ({ serverUrl, modelConfig }), [serverUrl, modelConfig])

  const [items, setItems] = useState<TemplateItem[]>([])
  const [preview, setPreview] = useState<TemplateItem | null>(null)
  const [activeCategory, setActiveCategory] = useState('ALL')
  const [searchText, setSearchText] = useState('')
  const [loading, setLoading] = useState(false)
  const [deactivatingId, setDeactivatingId] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState('')
  const [docxScale, setDocxScale] = useState(1)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const previewFrameRef = useRef<HTMLDivElement>(null)
  const docxPreviewRef = useRef<HTMLDivElement>(null)
  const previewDragRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null)

  // Upload modal state
  const [showModal, setShowModal] = useState(false)
  const [uploadCategory, setUploadCategory] = useState('EXTRANJERIA')
  const [uploadSubcategory, setUploadSubcategory] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    setLoading(true)
    try {
      const data = await api.listTemplates(settings)
      setItems(data)
      if (!preview && data[0]) setPreview(data[0])
      setError('')
    } catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [settings])

  const fitDocxPreviewToFrame = () => {
    const frame = previewFrameRef.current
    const host = docxPreviewRef.current
    const wrapper = host?.querySelector<HTMLElement>('.docx-wrapper')
    const pages = Array.from(host?.querySelectorAll<HTMLElement>('.docx') ?? [])
    if (!frame || !host || !wrapper || pages.length === 0) return

    wrapper.style.transform = 'none'
    wrapper.style.transformOrigin = 'top center'
    host.style.width = ''
    host.style.height = ''

    const frameStyles = window.getComputedStyle(frame)
    const horizontalPadding = parseFloat(frameStyles.paddingLeft) + parseFloat(frameStyles.paddingRight)
    const availableWidth = frame.clientWidth - horizontalPadding
    const pageWidth = Math.max(...pages.map((page) => page.getBoundingClientRect().width))
    const wrapperWidth = Math.max(wrapper.scrollWidth, pageWidth)
    const wrapperHeight = wrapper.scrollHeight
    if (availableWidth <= 0 || pageWidth <= 0 || wrapperHeight <= 0) return

    const scale = Math.min(1, availableWidth / pageWidth)
    setDocxScale(scale)
    wrapper.style.transform = `scale(${scale})`
    host.style.width = `${Math.max(availableWidth, Math.ceil(wrapperWidth * scale))}px`
    host.style.height = `${Math.ceil(wrapperHeight * scale)}px`
    frame.scrollLeft = 0
  }

  useEffect(() => {
    let cancelled = false
    let objectUrl = ''

    const renderPreview = async () => {
      setPdfPreviewUrl('')
      setPreviewError('')
      setDocxScale(1)
      if (docxPreviewRef.current) docxPreviewRef.current.replaceChildren()
      if (!preview) return

      setPreviewLoading(true)
      try {
        const fileBlob = await api.getTemplateFile(settings, preview.id)
        if (cancelled) return

        if (preview.file_name.toLowerCase().endsWith('.pdf')) {
          objectUrl = URL.createObjectURL(fileBlob)
          setPdfPreviewUrl(objectUrl)
          return
        }

        if (!docxPreviewRef.current) return
        await renderAsync(fileBlob, docxPreviewRef.current, undefined, {
          className: 'docx',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true
        })
        requestAnimationFrame(() => {
          if (!cancelled) fitDocxPreviewToFrame()
        })
      } catch (e) {
        if (!cancelled) setPreviewError(String(e))
      } finally {
        if (!cancelled) setPreviewLoading(false)
      }
    }

    void renderPreview()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [preview?.id, settings])

  useEffect(() => {
    const frame = previewFrameRef.current
    if (!frame || pdfPreviewUrl || previewError) return
    fitDocxPreviewToFrame()
    const observer = new ResizeObserver(fitDocxPreviewToFrame)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [preview?.id, previewLoading, pdfPreviewUrl, previewError])

  const handleFileSelect = (file: File | null) => {
    if (!file) return
    if (!file.name.endsWith('.docx') && !file.name.endsWith('.pdf')) {
      setError('仅支持 .docx 和 .pdf 文件。')
      return
    }
    setSelectedFile(file)
    setError('')
  }

  const handleUpload = async () => {
    if (!selectedFile) { setError('请先选择文件。'); return }
    setUploading(true)
    setError('')
    setSuccess('')
    try {
      const fd = new FormData()
      fd.append('file', selectedFile)
      fd.append('category', uploadCategory)
      if (uploadSubcategory.trim()) fd.append('subcategory', uploadSubcategory.trim())
      const result = await api.uploadTemplate(settings, fd)
      setSelectedFile(null)
      setUploadSubcategory('')
      if (fileInputRef.current) fileInputRef.current.value = ''
      setSuccess(`模板「${result.title}」已成功上传并解析。`)
      setShowModal(false)
      await load()
      setPreview(result)
    } catch (e) { setError(String(e)) }
    finally { setUploading(false) }
  }

  const handleDeactivate = async (t: TemplateItem) => {
    if (!window.confirm(`确认停用模板「${t.title}」？`)) return
    setDeactivatingId(t.id)
    try {
      await api.deactivateTemplate(settings, t.id)
      if (preview?.id === t.id) setPreview(null)
      await load()
      setSuccess(`模板「${t.title}」已停用。`)
    } catch (e) { setError(String(e)) }
    finally { setDeactivatingId('') }
  }

  const startPreviewDrag = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !previewFrameRef.current) return
    previewDragRef.current = {
      x: event.clientX,
      y: event.clientY,
      scrollLeft: previewFrameRef.current.scrollLeft,
      scrollTop: previewFrameRef.current.scrollTop
    }
    previewFrameRef.current.classList.add('dragging')
  }

  const movePreviewDrag = (event: MouseEvent<HTMLDivElement>) => {
    const drag = previewDragRef.current
    const frame = previewFrameRef.current
    if (!drag || !frame) return

    frame.scrollLeft = drag.scrollLeft - (event.clientX - drag.x)
    frame.scrollTop = drag.scrollTop - (event.clientY - drag.y)
  }

  const stopPreviewDrag = () => {
    previewDragRef.current = null
    previewFrameRef.current?.classList.remove('dragging')
  }

  const activeCount = items.filter((i) => i.is_active).length
  const filtered = items.filter((item) => {
    const catMatch = activeCategory === 'ALL' || item.category.toUpperCase() === activeCategory
    const textMatch = !searchText || item.title.toLowerCase().includes(searchText.toLowerCase()) || item.file_name.toLowerCase().includes(searchText.toLowerCase())
    return catMatch && textMatch
  })

  const categoryCounts: Record<string, number> = { ALL: items.length }
  for (const item of items) {
    const cat = item.category.toUpperCase()
    categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1
  }

  return (
    <div style={{ padding: '24px 32px', flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

      {/* Filter bar */}
      <div className="tpl-filter-bar">
        <div className="tpl-filter-pills">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`filter-pill${activeCategory === cat ? ' active' : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat === 'ALL' ? '全部' : cat}
              <span className="filter-pill-count">{categoryCounts[cat] ?? 0}</span>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="tpl-search">
            <Search size={13} className="tpl-search-icon" />
            <input
              className="tpl-search-input"
              placeholder="搜索模板..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          <button type="button" className="btn-ghost btn-sm btn-icon" onClick={load} disabled={loading} title="刷新">
            <Loader2 size={14} className={loading ? 'spin-anim' : ''} />
          </button>
          <button type="button" className="btn-primary btn-sm" onClick={() => setShowModal(true)}>
            <Upload size={13} /> 上传模板
          </button>
        </div>
      </div>

      {error ? (
        <div style={{ background: 'var(--red-50)', border: '1px solid var(--red-200)', color: 'var(--red-600)', borderRadius: 'var(--r-md)', padding: '8px 12px', fontSize: 12, marginBottom: 12 }}>
          {error}
        </div>
      ) : null}
      {success ? (
        <div style={{ background: 'var(--green-50)', border: '1px solid var(--green-100)', color: 'var(--green-600)', borderRadius: 'var(--r-md)', padding: '8px 12px', fontSize: 12, marginBottom: 12 }}>
          {success}
        </div>
      ) : null}

      {/* Templates table + preview side-by-side */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 20, overflow: 'hidden' }}>

        {/* Table */}
        <div className="styled-scrollbar" style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
          {loading ? (
            <div className="empty-state"><Loader2 size={20} className="spin-anim" /><p>加载中...</p></div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <FileText size={24} style={{ color: 'var(--gray-300)' }} />
              <p>暂无模板，点击「上传模板」添加。</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>模板名称</th>
                  <th>分类</th>
                  <th>子分类</th>
                  <th>状态</th>
                  <th style={{ width: 80 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr
                    key={item.id}
                    style={{ cursor: 'pointer', opacity: item.is_active ? 1 : 0.5 }}
                    onClick={() => setPreview(item)}
                  >
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="tpl-doc-icon">
                          <span>{item.file_name.endsWith('.pdf') ? 'PDF' : 'DOC'}</span>
                        </div>
                        <div>
                          <div style={{ fontWeight: 500, color: 'var(--gray-900)', fontSize: 13 }}>{item.title}</div>
                          <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2, fontFamily: 'var(--mono)' }}>{item.file_name}</div>
                        </div>
                      </div>
                    </td>
                    <td>{categoryBadge(item.category)}</td>
                    <td style={{ color: 'var(--gray-500)', fontSize: 12 }}>{item.subcategory ?? '—'}</td>
                    <td>
                      {item.is_active
                        ? <span className="badge badge-active">有效</span>
                        : <span className="badge badge-inactive">已停用</span>}
                    </td>
                    <td>
                      <div className="row-actions">
                        {item.is_active && (
                          <button
                            type="button"
                            className="icon-btn"
                            disabled={deactivatingId === item.id}
                            onClick={(e) => { e.stopPropagation(); void handleDeactivate(item) }}
                            title="停用"
                          >
                            {deactivatingId === item.id ? <span className="btn-spinner dark" style={{ width: 12, height: 12 }} /> : <PowerOff size={13} />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Preview panel */}
        {preview && (
          <div className="section-card template-preview-panel">
            <div className="section-card-header">
              <div>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {preview.title}
                  {!preview.is_active && <span className="badge badge-inactive">已停用</span>}
                </h3>
                <p>{preview.category}{preview.subcategory ? ` · ${preview.subcategory}` : ''}</p>
              </div>
              <button type="button" className="icon-btn" onClick={() => setPreview(null)}><X size={14} /></button>
            </div>
            <div className="section-card-body" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ background: 'var(--gray-50)', borderRadius: 'var(--r-md)', padding: '8px 12px' }}>
                  <div style={{ fontSize: 10.5, color: 'var(--gray-500)', marginBottom: 2 }}>文件名</div>
                  <div style={{ fontSize: 12.5, fontFamily: 'var(--mono)', color: 'var(--gray-800)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview.file_name}</div>
                </div>
                <div style={{ background: 'var(--gray-50)', borderRadius: 'var(--r-md)', padding: '8px 12px' }}>
                  <div style={{ fontSize: 10.5, color: 'var(--gray-500)', marginBottom: 2 }}>语言</div>
                  <div style={{ fontSize: 12.5, color: 'var(--gray-800)' }}>español</div>
                </div>
              </div>
              <div style={{ fontSize: 10.5, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--gray-500)' }}>模板预览</div>
              <div
                ref={previewFrameRef}
                className="template-preview-frame styled-scrollbar"
                onMouseDown={startPreviewDrag}
                onMouseMove={movePreviewDrag}
                onMouseUp={stopPreviewDrag}
                onMouseLeave={stopPreviewDrag}
              >
                {previewLoading ? (
                  <div className="template-preview-state">
                    <Loader2 size={18} className="spin-anim" />
                    <span>正在渲染原文件...</span>
                  </div>
                ) : null}
                {previewError ? (
                  <div className="template-preview-fallback">
                    <p>原文件预览暂时不可用，已显示解析文本。</p>
                    <pre>{preview.raw_text || '（该模板暂无可预览内容）'}</pre>
                  </div>
                ) : null}
                {pdfPreviewUrl ? (
                  <iframe className="template-pdf-preview" src={pdfPreviewUrl} title={preview.title} />
                ) : null}
                <div
                  ref={docxPreviewRef}
                  className="template-docx-preview"
                  style={{
                    display: pdfPreviewUrl || previewError ? 'none' : undefined,
                    ['--docx-scale' as string]: docxScale
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Upload Modal ── */}
      {showModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ width: 480 }}>
            <div className="modal-header">
              <div className="modal-header-text">
                <h4>上传新模板</h4>
                <p>支持 DOCX / PDF 格式，上传后自动解析入库</p>
              </div>
              <button type="button" className="icon-btn" onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>

            <div className="modal-body">
              {/* Drop zone */}
              <div
                className={`drop-zone${dragOver ? ' drag-over' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFileSelect(e.dataTransfer.files[0] ?? null) }}
              >
                <div className="drop-zone-icon">
                  {selectedFile ? <FileText size={18} style={{ color: 'var(--indigo-600)' }} /> : <Upload size={18} />}
                </div>
                {selectedFile ? (
                  <div className="drop-zone-text" style={{ color: 'var(--indigo-600)' }}>{selectedFile.name}</div>
                ) : (
                  <>
                    <div className="drop-zone-text">点击选择文件或拖拽至此</div>
                    <div className="drop-zone-hint">.docx · .pdf</div>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".docx,.pdf"
                style={{ display: 'none' }}
                onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
              />

              <div className="modal-fields">
                <div className="field">
                  <label>分类</label>
                  <select value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value)}>
                    {CATEGORIES.filter((c) => c !== 'ALL').map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>子分类（可选）</label>
                  <input
                    value={uploadSubcategory}
                    onChange={(e) => setUploadSubcategory(e.target.value)}
                    placeholder="例：REAGRUPACION"
                  />
                </div>
              </div>

              {error ? (
                <div style={{ marginTop: 12, background: 'var(--red-50)', border: '1px solid var(--red-200)', color: 'var(--red-600)', borderRadius: 'var(--r-md)', padding: '8px 10px', fontSize: 12 }}>
                  {error}
                </div>
              ) : null}
            </div>

            <div className="modal-footer">
              <button type="button" onClick={() => setShowModal(false)}>取消</button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleUpload}
                disabled={uploading || !selectedFile}
              >
                {uploading ? <><span className="btn-spinner" />上传解析中...</> : <><Upload size={13} />上传并入库</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 12, fontSize: 12, color: 'var(--gray-400)' }}>
        共 {items.length} 个模板 · {activeCount} 个有效
      </div>
    </div>
  )
}
