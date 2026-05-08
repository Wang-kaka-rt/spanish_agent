import { useEffect, useMemo, useRef, useState } from 'react'

import { api } from '../../api/client'
import { Panel } from '../../components/Panel'
import { useSettingsStore } from '../../store/settings'
import type { ChatSessionItem, MessageItem } from '../../types'

function buildWsUrl(serverUrl: string, sessionId: string): string {
  const url = new URL(serverUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = `/api/chat/${sessionId}`
  return url.toString()
}

export function ChatPage() {
  const serverUrl = useSettingsStore((state) => state.serverUrl)
  const modelConfig = useSettingsStore((state) => state.modelConfig)
  const settings = useMemo(() => ({ serverUrl, modelConfig }), [serverUrl, modelConfig])
  const [sessions, setSessions] = useState<ChatSessionItem[]>([])
  const [activeSession, setActiveSession] = useState<ChatSessionItem | null>(null)
  const [history, setHistory] = useState<MessageItem[]>([])
  const [question, setQuestion] = useState('家庭团聚需要什么材料？')
  const [streaming, setStreaming] = useState('')
  const [sending, setSending] = useState(false)
  const [statusText, setStatusText] = useState('')
  const socketRef = useRef<WebSocket | null>(null)

  const wsUrl = useMemo(() => (activeSession ? buildWsUrl(settings.serverUrl, activeSession.id) : ''), [activeSession, settings.serverUrl])

  const loadSessions = async () => {
    try {
      const data = await api.listChatSessions(settings)
      setSessions(data)
      if (!activeSession && data[0]) {
        setActiveSession(data[0])
      }
    } catch (error) {
      setStatusText(`加载会话失败：${String(error)}`)
    }
  }

  useEffect(() => {
    void loadSessions()
  }, [settings])

  useEffect(() => {
    if (!activeSession) return
    void api.getChatHistory(settings, activeSession.id)
      .then(setHistory)
      .catch((error) => setStatusText(`加载历史失败：${String(error)}`))
  }, [activeSession, settings])

  useEffect(() => {
    return () => {
      socketRef.current?.close()
    }
  }, [])

  const createSession = async () => {
    try {
      const created = await api.createChatSession(settings, `会话 ${sessions.length + 1}`)
      setSessions((prev) => [created, ...prev])
      setActiveSession(created)
      setStatusText('已创建新会话。')
    } catch (error) {
      setStatusText(`创建会话失败：${String(error)}`)
    }
  }

  const sendQuestion = async () => {
    if (!activeSession || sending || !question.trim()) return
    socketRef.current?.close()
    setStreaming('')
    setSending(true)
    setStatusText('正在建立流式连接...')
    const socket = new WebSocket(wsUrl)
    socketRef.current = socket
    socket.onopen = () => {
      setStatusText('连接成功，正在接收回答...')
      socket.send(JSON.stringify({
        question,
        model_config: settings.modelConfig
      }))
    }
    socket.onmessage = async (event) => {
      if (event.data === '[DONE]') {
        socket.close()
        const data = await api.getChatHistory(settings, activeSession.id)
        setHistory(data)
        setQuestion('')
        setSending(false)
        setStatusText('回答完成。')
        return
      }
      setStreaming((prev) => prev + event.data)
    }
    socket.onerror = () => {
      setSending(false)
      setStatusText('流式连接出现错误，请检查服务器和模型配置。')
    }
    socket.onclose = () => {
      if (socketRef.current === socket) {
        socketRef.current = null
      }
      setSending(false)
    }
  }

  return (
    <div className="grid chat-layout">
      <Panel title="会话列表" description="创建并切换法律问答会话。">
        <button type="button" onClick={createSession}>+ 新建对话</button>
        <div className="list">
          {sessions.map((session) => (
            <button type="button" className="list-item" key={session.id} onClick={() => setActiveSession(session)}>
              <strong>{session.title ?? '未命名会话'}</strong>
              <span>{new Date(session.created_at).toLocaleString()}</span>
            </button>
          ))}
        </div>
      </Panel>
      <Panel title="对话区域" description="通过 WebSocket 接收流式回答。">
        <div className="chat-box">
          {history.map((message) => (
            <div key={message.id} className={message.role === 'assistant' ? 'message assistant' : 'message user'}>
              <strong>{message.role === 'assistant' ? 'AI' : '用户'}</strong>
              <p>{message.content}</p>
            </div>
          ))}
          {streaming ? (
            <div className="message assistant">
              <strong>AI</strong>
              <p>{streaming}</p>
            </div>
          ) : null}
        </div>
        {statusText ? <div className="status-text">{statusText}</div> : null}
        <textarea rows={5} value={question} onChange={(event) => setQuestion(event.target.value)} />
        <div className="toolbar">
          <button type="button" onClick={sendQuestion} disabled={!activeSession || sending || !question.trim()}>
            {sending ? '发送中...' : '发送'}
          </button>
          {sending ? (
            <button
              type="button"
              onClick={() => {
                socketRef.current?.close()
                setStatusText('已停止当前回答。')
              }}
            >
              停止
            </button>
          ) : null}
        </div>
      </Panel>
    </div>
  )
}
