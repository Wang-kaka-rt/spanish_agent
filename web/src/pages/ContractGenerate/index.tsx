import Editor from '@monaco-editor/react'
import {
  Bot, CheckCircle2, Copy, Download,
  FileText, Loader2, PanelRight, Plus, RefreshCw,
  Save, Send, Sparkles, X, ZoomIn, ZoomOut,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { api } from '../../api/client'
import { useSettingsStore } from '../../store/settings'
import type { ContractItem } from '../../types'

/* ── Message types ── */
type StepStatus = 'pending' | 'running' | 'done' | 'error' | 'retrying'

interface StepState {
  key: string
  label: string
  detail?: string
  status: StepStatus
}

const INITIAL_STEPS: StepState[] = [
  { key: 'extract_fields',    label: '解析订单字段', status: 'pending' },
  { key: 'select_template',   label: '匹配合同模板', status: 'pending' },
  { key: 'load_template',     label: '加载模板内容', status: 'pending' },
  { key: 'fetch_laws',        label: '搜索法律条文', status: 'pending' },
  { key: 'generate_contract', label: 'AI 起草合同',  status: 'pending' },
  { key: 'validate_contract', label: '校验合同结构', status: 'pending' },
]

interface UserMsg      { kind: 'user';      text: string }
interface AiMsg        { kind: 'ai';        text: string; edits?: { from: string; to: string }[] }
interface ExtractedMsg { kind: 'extracted'; fields: Record<string, string> }
interface StepsMsg     { kind: 'steps';     steps: StepState[] }
interface FileMsg      { kind: 'file';      contract: ContractItem }
interface ErrorMsg     { kind: 'error';     text: string }

type GenMsg = UserMsg | AiMsg | ExtractedMsg | StepsMsg | FileMsg | ErrorMsg

function statusBadge(status: string) {
  switch (status) {
    case 'exported':  return <span className="badge badge-exported">已导出</span>
    case 'confirmed': return <span className="badge badge-confirmed">已确认</span>
    default:          return <span className="badge badge-draft">草稿</span>
  }
}

/* ── Individual message renderers ── */
function UserBubble({ text }: { text: string }) {
  return (
    <div className="msg-user fade-in">
      <div className="msg-user-inner">
        <div className="msg-user-bubble" style={{ whiteSpace: 'pre-wrap' }}>{text}</div>
        <div className="msg-user-avatar" style={{ background: 'var(--gray-200)', color: 'var(--gray-600)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
        </div>
      </div>
    </div>
  )
}

function AiBubble({ text, edits }: { text: string; edits?: { from: string; to: string }[] }) {
  return (
    <div className="msg-ai fade-in">
      <div className="msg-ai-inner">
        <div className="msg-ai-avatar"><Bot size={15} /></div>
        <div className="msg-ai-body">
          <div className="msg-ai-bubble ai-prose">
            <p>{text}</p>
            {edits?.map((e, i) => (
              <div key={i} className="diff-block" style={{ marginTop: 10 }}>
                <div className="diff-header">
                  <span>修订内容</span>
                  <button style={{ color: 'var(--indigo-600)', fontSize: 11.5, background: 'none', border: 'none', cursor: 'pointer', padding: 0, height: 'auto' }}>查看差异</button>
                </div>
                <div className="diff-del">{e.from}</div>
                <div className="diff-add">{e.to}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function ExtractedCard({ fields }: { fields: Record<string, string> }) {
  const entries = Object.entries(fields).filter(([k]) => k !== 'raw_order')
  return (
    <div className="msg-ai fade-in">
      <div className="msg-ai-inner">
        <div className="msg-card-avatar" style={{ background: 'var(--indigo-50)', border: '1px solid var(--indigo-100)', color: 'var(--indigo-600)' }}>
          <Sparkles size={14} />
        </div>
        <div className="msg-card-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 12, color: 'var(--gray-500)' }}>
            <CheckCircle2 size={13} style={{ color: 'var(--green-600)' }} />
            <span>已从订单中识别 <strong style={{ color: 'var(--gray-800)' }}>{entries.length}</strong> 个字段</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
            {entries.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                <span style={{ color: 'var(--gray-400)', minWidth: 56, flexShrink: 0, fontSize: 12 }}>{k}</span>
                <span className="doc-val" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function StepDot({ status }: { status: StepStatus }) {
  return (
    <span className={`step-dot ${status}`}>
      {status === 'done'     && <CheckCircle2 size={10} />}
      {status === 'running'  && <Loader2 size={10} className="spin-anim" />}
      {status === 'retrying' && <RefreshCw size={10} className="spin-anim" />}
      {status === 'error'    && <X size={10} />}
      {status === 'pending'  && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--gray-300)', display: 'block' }} />}
    </span>
  )
}

function StepsCard({ steps }: { steps: StepState[] }) {
  const allDone   = steps.every(s => s.status === 'done')
  const hasError  = steps.some(s => s.status === 'error')
  const isRunning = steps.some(s => s.status === 'running' || s.status === 'retrying')

  return (
    <div className="msg-ai fade-in">
      <div className="msg-ai-inner">
        <div className="msg-card-avatar">
          {hasError  ? <X size={14} style={{ color: 'var(--red-600)' }} />
          : allDone  ? <CheckCircle2 size={14} style={{ color: 'var(--green-600)' }} />
          : isRunning ? <Loader2 size={14} className="spin-anim" style={{ color: 'var(--indigo-600)' }} />
          : <Loader2 size={14} style={{ color: 'var(--gray-400)' }} />}
        </div>
        <div className="msg-card-body">
          <div className="steps-label">
            生成流程 · {hasError ? '出错' : allDone ? '完成' : '进行中…'}
          </div>
          <ol style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 0, margin: 0, listStyle: 'none' }}>
            {steps.map((s) => (
              <li key={s.key} className="step-item">
                <StepDot status={s.status} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span className="step-title" style={{
                    color: s.status === 'running' || s.status === 'retrying' ? 'var(--indigo-700)'
                      : s.status === 'error' ? 'var(--red-600)' : undefined,
                    fontWeight: s.status === 'running' || s.status === 'retrying' ? 600 : undefined,
                  }}>{s.label}</span>
                  {s.detail && <div className="step-detail">{s.detail}</div>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}

function FileCard({
  contract,
  isActive,
  onOpen,
  settings,
}: {
  contract: ContractItem
  isActive: boolean
  onOpen: () => void
  settings: { serverUrl: string; modelConfig: any }
}) {
  return (
    <div className="msg-ai fade-in">
      <div className="msg-ai-inner">
        <div className="msg-ai-avatar"><Bot size={15} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <button
            type="button"
            className={`file-card${isActive ? ' active' : ''}`}
            onClick={onOpen}
          >
            <div className="file-card-inner">
              <div className="docx-thumb">
                <div className="docx-thumb-lines">
                  <div className="docx-thumb-line" />
                  <div className="docx-thumb-line" style={{ width: '70%' }} />
                  <div className="docx-thumb-line" />
                  <div className="docx-thumb-line" style={{ width: '85%' }} />
                </div>
                <div className="docx-thumb-label">DOCX</div>
              </div>
              <div className="file-card-meta">
                <div className="file-card-name">{contract.title}</div>
                <div className="file-card-sub">
                  <span>DOCX</span>
                  <span className="dot-sep" />
                  {statusBadge(contract.status)}
                  {contract.template_id && (
                    <><span className="dot-sep" /><span>基于模板</span></>
                  )}
                </div>
              </div>
              <div className="file-card-hint">
                {isActive ? '已在右侧预览' : '点击预览 →'}
              </div>
            </div>
            {contract.laws_used.length > 0 && (
              <div className="file-card-footer">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {contract.laws_used.slice(0, 3).map((law) => (
                    <span key={law.boe_id} className="chip" style={{ fontSize: 10.5 }}>{law.boe_id}</span>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--gray-400)' }}>
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    style={{ height: 24, padding: '0 6px', fontSize: 11 }}
                    onClick={(e) => { e.stopPropagation(); window.open(api.contractDocxUrl(settings, contract.id), '_blank', 'noopener') }}
                  >
                    <Download size={11} /> DOCX
                  </button>
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    style={{ height: 24, padding: '0 6px', fontSize: 11 }}
                    onClick={(e) => { e.stopPropagation(); window.open(api.contractPdfUrl(settings, contract.id), '_blank', 'noopener') }}
                  >
                    <FileText size={11} /> PDF
                  </button>
                </div>
              </div>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

function ErrorBubble({ text }: { text: string }) {
  return (
    <div className="msg-ai fade-in">
      <div className="msg-ai-inner">
        <div className="msg-card-avatar" style={{ background: 'var(--red-50)', border: '1px solid var(--red-200)', color: 'var(--red-600)' }}>
          <X size={13} />
        </div>
        <div className="msg-card-body" style={{ borderColor: 'var(--red-200)', background: 'var(--red-50)' }}>
          <p style={{ color: 'var(--red-600)', fontSize: 13 }}>{text}</p>
        </div>
      </div>
    </div>
  )
}

/* ── Preview Drawer ── */
function PreviewDrawer({
  open,
  contract,
  onClose,
  settings,
}: {
  open: boolean
  contract: ContractItem | null
  onClose: () => void
  settings: { serverUrl: string; modelConfig: any }
}) {
  const [zoom, setZoom] = useState(100)
  const [tab, setTab] = useState<'preview' | 'editor'>('preview')
  const [editText, setEditText] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (contract) setEditText(contract.generated_text ?? '')
  }, [contract?.id])

  const handleSave = async () => {
    if (!contract) return
    setSaving(true)
    try {
      await api.updateContract(settings, contract.id, {
        title: contract.title,
        generated_text: editText,
        status: contract.status,
      })
    } catch { /* silent */ }
    finally { setSaving(false) }
  }

  return (
    <aside className={`preview-drawer${open && contract ? ' open' : ' closed'}`}>
      {open && contract && (
        <>
          {/* Header */}
          <div className="drawer-header">
            <div className="doc-icon"><span>DOC</span></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="drawer-file-name">{contract.title}</div>
              <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                {statusBadge(contract.status)}
                {contract.laws_used.length > 0 && (
                  <><span style={{ color: 'var(--gray-300)' }}>·</span><span>引用 {contract.laws_used.length} 部法律</span></>
                )}
              </div>
            </div>
            <button type="button" className="icon-btn" onClick={onClose} title="折叠预览">
              <X size={15} />
            </button>
          </div>

          {/* Toolbar */}
          <div className="drawer-toolbar">
            <div className="seg-btns">
              <button type="button" className={`seg-btn${tab === 'preview' ? ' active' : ''}`} onClick={() => setTab('preview')}>正文</button>
              <button type="button" className={`seg-btn${tab === 'editor' ? ' active' : ''}`} onClick={() => setTab('editor')}>编辑</button>
            </div>
            {tab === 'preview' && (
              <div className="zoom-controls">
                <button type="button" className="zoom-btn" onClick={() => setZoom((z) => Math.max(60, z - 10))}><ZoomOut size={12} /></button>
                <span className="zoom-val">{zoom}%</span>
                <button type="button" className="zoom-btn" onClick={() => setZoom((z) => Math.min(160, z + 10))}><ZoomIn size={12} /></button>
              </div>
            )}
          </div>

          {/* Content */}
          {tab === 'preview' ? (
            <div className="drawer-doc-area">
              <div
                className="doc-page"
                style={{
                  width: Math.round(440 * zoom / 100),
                  padding: Math.round(36 * zoom / 100),
                  fontSize: Math.round(12 * zoom / 100),
                  lineHeight: 1.8,
                  color: 'var(--gray-800)',
                  fontFamily: '"Times New Roman", serif',
                  margin: '0 auto',
                }}
              >
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 'inherit', lineHeight: 'inherit', margin: 0 }}>
                  {contract.generated_text || '（合同正文为空，请点击「编辑」标签查看或在左侧重新生成）'}
                </pre>
              </div>
              <div className="doc-page-num">— 第 1 页 —</div>
            </div>
          ) : (
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <Editor
                height="100%"
                defaultLanguage="markdown"
                value={editText}
                theme="vs"
                options={{
                  minimap: { enabled: false },
                  wordWrap: 'on',
                  fontSize: 13,
                  lineNumbersMinChars: 3,
                  automaticLayout: true,
                  padding: { top: 12, bottom: 12 },
                  scrollBeyondLastLine: false,
                  renderLineHighlight: 'none',
                }}
                onChange={(v) => setEditText(v ?? '')}
              />
            </div>
          )}

          {/* Footer */}
          <div className="drawer-footer">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--gray-500)' }}>
              <CheckCircle2 size={12} style={{ color: 'var(--green-500)' }} />
              字段校验通过
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {tab === 'editor' && (
                <button type="button" className="btn-sm" onClick={handleSave} disabled={saving}>
                  {saving ? <><span className="btn-spinner dark" />保存中</> : <><Save size={12} />保存</>}
                </button>
              )}
              <button
                type="button"
                className="btn-primary btn-sm"
                onClick={() => window.open(api.contractDocxUrl(settings, contract.id), '_blank', 'noopener')}
              >
                <Download size={12} /> 导出
              </button>
            </div>
          </div>
        </>
      )}
    </aside>
  )
}

/* ── Main page ── */
export function ContractGeneratePage() {
  const serverUrl = useSettingsStore((s) => s.serverUrl)
  const modelConfig = useSettingsStore((s) => s.modelConfig)
  const settings = useMemo(() => ({ serverUrl, modelConfig }), [serverUrl, modelConfig])

  const [messages, setMessages] = useState<GenMsg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewContract, setPreviewContract] = useState<ContractItem | null>(null)
  const [sessionTitle, setSessionTitle] = useState<string | null>(null)
  const [msgCount, setMsgCount] = useState(0)

  const scrollerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = () => {
    const el = scrollerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }

  useEffect(() => { scrollToBottom() }, [messages])

  const newSession = () => {
    setMessages([])
    setPreviewOpen(false)
    setPreviewContract(null)
    setSessionTitle(null)
    setMsgCount(0)
    setInput('')
    textareaRef.current?.focus()
  }

  const openPreview = (contract: ContractItem) => {
    setPreviewContract(contract)
    setPreviewOpen(true)
  }

  const handleSend = async () => {
    if (!input.trim() || sending) return
    const text = input.trim()
    setInput('')
    setSending(true)

    setMsgCount((c) => c + 1)
    if (!sessionTitle) setSessionTitle(text.slice(0, 24) + (text.length > 24 ? '…' : ''))

    // Add user message + live steps card
    const steps: StepState[] = INITIAL_STEPS.map((s) => ({ ...s }))
    setMessages((prev) => [
      ...prev,
      { kind: 'user', text },
      { kind: 'steps', steps: [...steps] },
    ])
    scrollToBottom()

    const updateStep = (key: string, status: StepStatus, detail?: string) => {
      const idx = steps.findIndex((s) => s.key === key)
      if (idx >= 0) steps[idx] = { ...steps[idx], status, detail }
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (last?.kind === 'steps') return [...prev.slice(0, -1), { kind: 'steps', steps: [...steps] }]
        return prev
      })
      scrollToBottom()
    }

    try {
      const response = await fetch(`${serverUrl}/api/contracts/generate/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_input: text, model_config: modelConfig }),
        signal: AbortSignal.timeout(300000),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      if (!response.body) throw new Error('No response body')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (!raw) continue
          let event: Record<string, unknown>
          try { event = JSON.parse(raw) } catch { continue }

          if (event.type === 'step') {
            const data = event.data as Record<string, unknown> | undefined
            let detail: string | undefined
            if (data?.template_title) detail = `使用模板: ${data.template_title}`
            if (data?.laws) detail = (data.laws as Array<{ boe_id: string }>).map((l) => l.boe_id).join(' · ')
            if (data?.attempt && Number(data.attempt) > 1) detail = `第 ${data.attempt} 次尝试`
            if (data?.errors) detail = (data.errors as string[]).join('; ')
            updateStep(String(event.step), event.status as StepStatus, detail)
          } else if (event.type === 'done') {
            const contract = event.contract as ContractItem
            setMessages((prev) => {
              const withoutSteps = prev.filter((m) => m.kind !== 'steps')
              const fieldCount = Object.keys(contract.extracted_fields).filter((k) => k !== 'raw_order').length
              return [
                ...withoutSteps,
                { kind: 'steps', steps: steps.map((s) => ({ ...s, status: s.status === 'pending' ? 'done' as StepStatus : s.status })) },
                { kind: 'extracted', fields: contract.extracted_fields },
                { kind: 'ai', text: `合同已生成完成 ✓  共识别 ${fieldCount} 个字段、引用 ${contract.laws_used.length} 部法律条文，校验通过。点击下方文件卡片在右侧预览，确认后可导出。` },
                { kind: 'file', contract },
              ]
            })
            setPreviewContract(contract)
            setPreviewOpen(true)
          } else if (event.type === 'error') {
            setMessages((prev) => {
              const withoutSteps = prev.filter((m) => m.kind !== 'steps')
              return [...withoutSteps, { kind: 'error', text: `生成失败：${String(event.message)}` }]
            })
          }
        }
      }
    } catch (e) {
      setMessages((prev) => {
        const withoutSteps = prev.filter((m) => m.kind !== 'steps')
        return [...withoutSteps, { kind: 'error', text: `生成失败：${String(e)}` }]
      })
    } finally {
      setSending(false)
      scrollToBottom()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  const isEmpty = messages.length === 0

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, height: '100%', overflow: 'hidden' }}>

      {/* ── Chat column ── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--gray-50)' }}>

        {/* Context bar */}
        <div className="topic-bar">
          <div>
            <div className="topic-title">{sessionTitle ?? '合同生成'}</div>
            <div className="topic-meta">
              {msgCount > 0
                ? <span>{msgCount} 条消息 · 粘贴订单信息，AI 自动识别字段并起草合同</span>
                : <span>粘贴订单信息，AI 自动识别字段并起草合同</span>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {!previewOpen && previewContract && (
              <button
                type="button"
                style={{ height: 28, padding: '0 10px', borderRadius: 'var(--r-md)', background: 'var(--indigo-50)', border: '1px solid var(--indigo-100)', color: 'var(--indigo-700)', fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                onClick={() => setPreviewOpen(true)}
              >
                <PanelRight size={12} /> 打开预览
              </button>
            )}
            <button type="button" className="btn-sm" onClick={newSession}>
              <Plus size={13} /> 新建会话
            </button>
            <button type="button" className="icon-btn" title="复制会话" onClick={() => { if (messages.length) navigator.clipboard.writeText(messages.filter(m => m.kind === 'user').map(m => (m as UserMsg).text).join('\n')) }}>
              <Copy size={14} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="chat-scroller" ref={scrollerRef}>
          <div className="chat-inner" style={{ maxWidth: 720 }}>

            {isEmpty && (
              <div className="empty-state" style={{ marginTop: 60 }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--indigo-50)', border: '1px solid var(--indigo-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--indigo-600)' }}>
                  <FileText size={24} />
                </div>
                <p style={{ maxWidth: 300, textAlign: 'center', lineHeight: 1.6 }}>
                  粘贴订单信息，或直接描述合同需求，AI 将自动识别字段、匹配模板、起草合同。
                </p>
              </div>
            )}

            {messages.map((m, i) => {
              if (m.kind === 'user')      return <UserBubble key={i} text={m.text} />
              if (m.kind === 'ai')        return <AiBubble key={i} text={m.text} edits={m.edits} />
              if (m.kind === 'extracted') return <ExtractedCard key={i} fields={m.fields} />
              if (m.kind === 'steps')     return <StepsCard key={i} steps={m.steps} />
              if (m.kind === 'file')      return (
                <FileCard
                  key={i}
                  contract={m.contract}
                  isActive={previewContract?.id === m.contract.id && previewOpen}
                  onOpen={() => openPreview(m.contract)}
                  settings={settings}
                />
              )
              if (m.kind === 'error')     return <ErrorBubble key={i} text={m.text} />
              return null
            })}

            {sending && (
              <div className="msg-ai fade-in">
                <div className="msg-ai-inner">
                  <div className="msg-ai-avatar"><Bot size={15} /></div>
                  <div className="msg-ai-body">
                    <div className="msg-ai-bubble">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--gray-500)' }}>
                        <Loader2 size={14} className="spin-anim" style={{ color: 'var(--indigo-500)' }} />
                        <span>正在生成合同<span className="blink" style={{ display: 'inline-block', width: 2, height: 13, background: 'var(--indigo-600)', verticalAlign: 'text-bottom', marginLeft: 2 }} /></span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Composer */}
        <div className="composer">
          <div className="composer-inner" style={{ maxWidth: 720 }}>
            <div className="composer-box">
              <textarea
                ref={textareaRef}
                className="composer-textarea"
                rows={3}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="粘贴订单信息，或直接描述合同需求…  Shift + Enter 换行"
                disabled={sending}
              />
              <div className="composer-footer">
                <div className="composer-footer-left">
                  <button type="button" className="composer-action-btn" style={{ opacity: 0.7, cursor: 'not-allowed' }} title="指定模板（即将推出）">
                    <FileText size={12} /> 指定模板
                  </button>
                  <button type="button" className="composer-action-btn" style={{ opacity: 0.7, cursor: 'not-allowed' }} title="引用法律（即将推出）">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>
                    </svg> 引用法律
                  </button>
                </div>
                <div className="composer-footer-right">
                  <span style={{ fontSize: 11.5, color: 'var(--gray-400)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className="model-dot" />
                    {modelConfig.modelId || '未配置模型'}
                  </span>
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    onClick={() => void handleSend()}
                    disabled={!input.trim() || sending}
                  >
                    生成 <Send size={12} />
                  </button>
                </div>
              </div>
            </div>
            <div className="composer-hint">生成结果以 DOCX 形式呈现，可在右侧预览 / 编辑后导出。</div>
          </div>
        </div>
      </div>

      {/* ── Preview Drawer ── */}
      <PreviewDrawer
        open={previewOpen}
        contract={previewContract}
        onClose={() => setPreviewOpen(false)}
        settings={settings}
      />
    </div>
  )
}
