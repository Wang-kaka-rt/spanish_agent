import { Bot, Plus, Search, Send, Square, Trash2, User } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { api } from '../../api/client'
import { useSettingsStore } from '../../store/settings'
import type { ChatSessionItem, MessageItem } from '../../types'

function buildWsUrl(serverUrl: string, sessionId: string): string {
  const url = new URL(serverUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = `/api/chat/${sessionId}`
  return url.toString()
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function ChatPage() {
  const serverUrl = useSettingsStore((s) => s.serverUrl)
  const modelConfig = useSettingsStore((s) => s.modelConfig)
  const settings = useMemo(() => ({ serverUrl, modelConfig }), [serverUrl, modelConfig])

  const [sessions, setSessions] = useState<ChatSessionItem[]>([])
  const [activeSession, setActiveSession] = useState<ChatSessionItem | null>(null)
  const [history, setHistory] = useState<MessageItem[]>([])
  const [question, setQuestion] = useState('')
  const [streaming, setStreaming] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const socketRef = useRef<WebSocket | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const loadSessions = async () => {
    try {
      const data = await api.listChatSessions(settings)
      setSessions(data)
      if (!activeSession && data[0]) setActiveSession(data[0])
    } catch (e) { setError(String(e)) }
  }

  useEffect(() => { void loadSessions() }, [settings])

  useEffect(() => {
    if (!activeSession) return
    void api.getChatHistory(settings, activeSession.id)
      .then((data) => { setHistory(data); setTimeout(scrollToBottom, 80) })
      .catch((e) => setError(String(e)))
  }, [activeSession, settings])

  useEffect(() => { scrollToBottom() }, [streaming])
  useEffect(() => () => { socketRef.current?.close() }, [])

  const createSession = async () => {
    try {
      const created = await api.createChatSession(settings, `会话 ${sessions.length + 1}`)
      setSessions((prev) => [created, ...prev])
      setActiveSession(created)
      setHistory([])
      setError('')
    } catch (e) { setError(String(e)) }
  }

  const deleteSession = async (id: string) => {
    if (!window.confirm('确认删除该会话及所有消息？')) return
    try {
      await fetch(`${serverUrl}/api/chat/sessions/${id}`, { method: 'DELETE' })
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== id)
        if (activeSession?.id === id) { setActiveSession(next[0] ?? null); setHistory([]) }
        return next
      })
    } catch (e) { setError(String(e)) }
  }

  const sendQuestion = () => {
    if (!activeSession || sending || !question.trim()) return
    socketRef.current?.close()
    setStreaming('')
    setSending(true)
    setError('')

    const wsUrl = buildWsUrl(settings.serverUrl, activeSession.id)
    const socket = new WebSocket(wsUrl)
    socketRef.current = socket

    socket.onopen = () => {
      socket.send(JSON.stringify({ question, model_config: settings.modelConfig }))
    }

    socket.onmessage = async (event) => {
      if (event.data === '[DONE]') {
        socket.close()
        const data = await api.getChatHistory(settings, activeSession.id)
        setHistory(data)
        setStreaming('')
        setQuestion('')
        setSending(false)
        setTimeout(scrollToBottom, 80)
        return
      }
      setStreaming((prev) => prev + event.data)
    }

    socket.onerror = () => { setSending(false); setError('WebSocket 连接出错，请检查服务器和模型配置。') }
    socket.onclose = () => { if (socketRef.current === socket) socketRef.current = null; setSending(false) }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendQuestion() }
  }

  const stopStream = () => { socketRef.current?.close(); setSending(false) }

  const filteredSessions = sessions.filter((s) =>
    !searchQuery || (s.title ?? '').toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, height: '100%' }}>

      {/* ── Sessions Panel ── */}
      <div className="sessions-panel">
        <div className="sessions-panel-header">
          <span className="sessions-panel-label">会话列表</span>
          <button type="button" className="btn-primary btn-sm btn-icon" onClick={createSession} title="新建会话">
            <Plus size={13} />
          </button>
        </div>

        <div className="sessions-search">
          <div className="sessions-search-wrap">
            <Search size={13} className="sessions-search-icon" />
            <input
              className="sessions-search-input"
              placeholder="搜索会话..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="sessions-list">
          {filteredSessions.length === 0 ? (
            <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--gray-400)', fontSize: 12 }}>
              {sessions.length === 0 ? '暂无会话，点击 + 新建' : '未找到匹配会话'}
            </div>
          ) : filteredSessions.map((session) => (
            <button
              key={session.id}
              type="button"
              className={`session-item${activeSession?.id === session.id ? ' active' : ''}`}
              onClick={() => setActiveSession(session)}
            >
              <div className="session-item-top">
                <span className="session-item-title">{session.title ?? '未命名会话'}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span className="session-item-date">{formatDate(session.created_at)}</span>
                  <button
                    type="button"
                    className="icon-btn"
                    style={{ width: 22, height: 22, padding: 0 }}
                    onClick={(e) => { e.stopPropagation(); void deleteSession(session.id) }}
                    title="删除"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
              <div className="session-item-preview">
                {session.title ?? '点击进入会话'}
              </div>
            </button>
          ))}
        </div>

        <div className="sessions-footer">
          <Bot size={13} />
          <span>{sessions.length} 个会话</span>
        </div>
      </div>

      {/* ── Chat Area ── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--gray-50)' }}>

        {/* Topic bar */}
        <div className="topic-bar">
          <div>
            <div className="topic-title">
              {activeSession?.title ?? '选择或新建一个会话'}
            </div>
            <div className="topic-meta">
              <span>按 Enter 发送 · Shift+Enter 换行</span>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="chat-scroller">
          <div className="chat-inner">

            {history.length === 0 && !streaming && (
              <div className="empty-state" style={{ marginTop: 60 }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--indigo-50)', border: '1px solid var(--indigo-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--indigo-600)' }}>
                  <Bot size={24} />
                </div>
                <p style={{ maxWidth: 280 }}>
                  {activeSession ? '向 AI 提问西班牙法律相关问题，支持流式实时回答。' : '请从左侧选择或新建一个会话。'}
                </p>
              </div>
            )}

            {history.map((msg) => (
              msg.role === 'user' ? (
                <div key={msg.id} className="msg-user fade-in">
                  <div className="msg-user-inner">
                    <div className="msg-user-bubble">{msg.content}</div>
                    <div className="msg-user-avatar"><User size={14} /></div>
                  </div>
                </div>
              ) : (
                <div key={msg.id} className="msg-ai fade-in">
                  <div className="msg-ai-inner">
                    <div className="msg-ai-avatar"><Bot size={15} /></div>
                    <div className="msg-ai-body">
                      <div className="msg-ai-bubble ai-prose">{msg.content}</div>
                    </div>
                  </div>
                </div>
              )
            ))}

            {streaming ? (
              <div className="msg-ai fade-in">
                <div className="msg-ai-inner">
                  <div className="msg-ai-avatar"><Bot size={15} /></div>
                  <div className="msg-ai-body">
                    <div className="msg-ai-bubble ai-prose">
                      {streaming}<span className="blink" style={{ display: 'inline-block', width: 2, height: 14, background: 'var(--indigo-600)', verticalAlign: 'text-bottom', marginLeft: 2 }} />
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div ref={bottomRef} />
          </div>
        </div>

        {error ? (
          <div style={{ padding: '0 32px 8px', maxWidth: 760, margin: '0 auto', width: '100%' }}>
            <div style={{ background: 'var(--red-50)', border: '1px solid var(--red-200)', color: 'var(--red-600)', borderRadius: 'var(--r-md)', padding: '8px 12px', fontSize: 12 }}>
              {error}
            </div>
          </div>
        ) : null}

        {/* Composer */}
        <div className="composer">
          <div className="composer-inner">
            {!activeSession ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
                <button type="button" className="btn-primary" onClick={createSession}>
                  <Plus size={14} /> 新建会话
                </button>
              </div>
            ) : (
              <div className="composer-box">
                <textarea
                  ref={textareaRef}
                  className="composer-textarea"
                  rows={3}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="输入问题，例：家庭团聚居留需要准备哪些材料？"
                  disabled={sending}
                />
                <div className="composer-footer">
                  <div className="composer-footer-left">
                    <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>
                      {settings.modelConfig.modelId || '未配置模型'}
                    </span>
                  </div>
                  <div className="composer-footer-right">
                    {sending ? (
                      <button type="button" className="btn-danger btn-sm" onClick={stopStream}>
                        <Square size={12} /> 停止
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-primary btn-sm"
                        onClick={sendQuestion}
                        disabled={!question.trim()}
                      >
                        <Send size={12} /> 发送
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
            <div className="composer-hint">按 Enter 发送 · Shift+Enter 换行</div>
          </div>
        </div>
      </div>
    </div>
  )
}
