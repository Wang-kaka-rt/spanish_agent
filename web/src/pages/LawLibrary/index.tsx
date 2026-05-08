import { useEffect, useMemo, useState } from 'react'

import { api } from '../../api/client'
import { Panel } from '../../components/Panel'
import { useSettingsStore } from '../../store/settings'
import type { LawItem } from '../../types'

export function LawLibraryPage() {
  const serverUrl = useSettingsStore((state) => state.serverUrl)
  const modelConfig = useSettingsStore((state) => state.modelConfig)
  const settings = useMemo(() => ({ serverUrl, modelConfig }), [serverUrl, modelConfig])
  const [query, setQuery] = useState('BOE-A-2000-544')
  const [results, setResults] = useState<Array<{ boe_id: string; title: string; source_url?: string }>>([])
  const [cached, setCached] = useState<LawItem[]>([])
  const [loadingCached, setLoadingCached] = useState(false)
  const [searching, setSearching] = useState(false)
  const [fetchingId, setFetchingId] = useState('')
  const [error, setError] = useState('')
  const [statusText, setStatusText] = useState('')
  const [preview, setPreview] = useState<LawItem | null>(null)

  const load = async () => {
    setLoadingCached(true)
    try {
      const data = await api.listLaws(settings)
      setCached(data)
      if (!preview && data[0]) {
        setPreview(data[0])
      }
      setError('')
    } catch (requestError) {
      setError(`加载法律缓存失败：${String(requestError)}`)
    } finally {
      setLoadingCached(false)
    }
  }

  useEffect(() => {
    void load()
  }, [settings])

  const handleSearch = async () => {
    if (!query.trim()) {
      setError('请输入 BOE 编号或法律名称。')
      return
    }
    setSearching(true)
    try {
      setResults(await api.searchBoe(settings, query))
      setStatusText('搜索完成。')
      setError('')
    } catch (requestError) {
      setError(`搜索失败：${String(requestError)}`)
    } finally {
      setSearching(false)
    }
  }

  const handleFetch = async (result: { boe_id: string; title: string; source_url?: string }) => {
    setFetchingId(result.boe_id)
    try {
      await api.fetchLaw(settings, result)
      setStatusText(`已缓存法律：${result.boe_id}`)
      await load()
    } catch (requestError) {
      setError(`获取法律失败：${String(requestError)}`)
    } finally {
      setFetchingId('')
    }
  }

  return (
    <div className="grid two-columns">
      <Panel title="BOE 搜索" description="支持按 BOE 编号或标题搜索。">
        <div className="toolbar">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="BOE-A-2000-544" />
          <button type="button" onClick={handleSearch} disabled={searching}>
            {searching ? '搜索中...' : '搜索 BOE'}
          </button>
        </div>
        {statusText ? <div className="status-text">{statusText}</div> : null}
        {error ? <div className="status-error">{error}</div> : null}
        {results.length === 0 ? (
          <div className="empty">输入关键词后搜索，这里会显示 BOE 候选结果。</div>
        ) : (
          <div className="list">
            {results.map((result) => (
              <div className="list-item static" key={result.boe_id}>
                <div>
                  <strong>{result.title}</strong>
                  <p>{result.boe_id}</p>
                </div>
                <button type="button" onClick={() => void handleFetch(result)} disabled={fetchingId === result.boe_id}>
                  {fetchingId === result.boe_id ? '获取中...' : '获取缓存'}
                </button>
              </div>
            ))}
          </div>
        )}
      </Panel>
      <Panel title="已缓存法律" description="后端缓存到数据库的法律正文。">
        {loadingCached ? (
          <div className="empty">正在加载已缓存法律...</div>
        ) : cached.length === 0 ? (
          <div className="empty">当前还没有缓存法律，先搜索并获取一条。</div>
        ) : (
          <div className="list">
            {cached.map((law) => (
              <div className="list-item static" key={law.id}>
                <div>
                  <strong>{law.title}</strong>
                  <p>{law.boe_id}</p>
                </div>
                <div className="toolbar wrap">
                  <button type="button" onClick={() => setPreview(law)}>预览</button>
                  <button
                    type="button"
                    onClick={() => {
                      void api.deleteLaw(settings, law.id)
                        .then(() => {
                          setStatusText(`已删除法律：${law.boe_id}`)
                          if (preview?.id === law.id) {
                            setPreview(null)
                          }
                          return load()
                        })
                        .catch((requestError) => setError(`删除失败：${String(requestError)}`))
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
      <Panel title="法律预览" description="查看缓存法律的正文摘要。">
        {preview ? (
          <>
            <div className="meta-grid">
              <div className="meta-card">
                <strong>标题</strong>
                <span>{preview.title}</span>
              </div>
              <div className="meta-card">
                <strong>BOE 编号</strong>
                <span>{preview.boe_id}</span>
              </div>
              <div className="meta-card">
                <strong>分类</strong>
                <span>{preview.category ?? '-'}</span>
              </div>
            </div>
            <div className="preview-box">{preview.raw_text || '该法律暂无可预览内容。'}</div>
          </>
        ) : (
          <div className="empty">从已缓存法律列表中选择一项后，可在这里查看正文摘要。</div>
        )}
      </Panel>
    </div>
  )
}
