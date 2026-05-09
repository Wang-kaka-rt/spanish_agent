import { BookOpen, Download, Loader2, Search, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { api } from '../../api/client'
import { useSettingsStore } from '../../store/settings'
import type { LawItem } from '../../types'

export function LawLibraryPage() {
  const serverUrl = useSettingsStore((s) => s.serverUrl)
  const modelConfig = useSettingsStore((s) => s.modelConfig)
  const settings = useMemo(() => ({ serverUrl, modelConfig }), [serverUrl, modelConfig])

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Array<{ boe_id: string; title: string; source_url?: string }>>([])
  const [cached, setCached] = useState<LawItem[]>([])
  const [preview, setPreview] = useState<LawItem | null>(null)
  const [searching, setSearching] = useState(false)
  const [fetchingId, setFetchingId] = useState('')
  const [deletingId, setDeletingId] = useState('')
  const [loadingCached, setLoadingCached] = useState(false)
  const [searchError, setSearchError] = useState('')

  const loadCached = async () => {
    setLoadingCached(true)
    try {
      const data = await api.listLaws(settings)
      setCached(data)
      if (!preview && data[0]) setPreview(data[0])
    } catch { /* silent */ }
    finally { setLoadingCached(false) }
  }

  useEffect(() => { void loadCached() }, [settings])

  const handleSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    setSearchError('')
    setResults([])
    try {
      const data = await api.searchBoe(settings, query)
      setResults(data)
      if (data.length === 0) setSearchError('未找到匹配法律，请尝试其他关键词或 BOE 编号。')
    } catch (e) { setSearchError(String(e)) }
    finally { setSearching(false) }
  }

  const handleFetch = async (result: { boe_id: string; title: string; source_url?: string }) => {
    setFetchingId(result.boe_id)
    try {
      const law = await api.fetchLaw(settings, result)
      await loadCached()
      setPreview(law)
    } catch (e) { setSearchError(`获取失败：${String(e)}`) }
    finally { setFetchingId('') }
  }

  const handleDelete = async (law: LawItem) => {
    if (!window.confirm(`确认删除「${law.title}」的缓存？`)) return
    setDeletingId(law.id)
    try {
      await api.deleteLaw(settings, law.id)
      if (preview?.id === law.id) setPreview(null)
      await loadCached()
    } catch { /* silent */ }
    finally { setDeletingId('') }
  }

  const isAlreadyCached = (boeId: string) => cached.some((c) => c.boe_id === boeId)

  return (
    <div style={{ padding: '24px 32px', flex: 1, minHeight: 0, overflow: 'auto' }}>

      {/* Search bar */}
      <div className="law-search-bar">
        <div className="law-search-label">
          <Search size={13} />
          <span>BOE 搜索</span>
        </div>
        <div className="law-search-wrap">
          <Search size={13} className="law-search-icon" />
          <input
            className="law-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleSearch()}
            placeholder="输入法律名称或 BOE 编号，例：Ley 4/2000 或 BOE-A-2000-544"
          />
        </div>
        <button
          type="button"
          className="btn-primary btn-sm"
          onClick={handleSearch}
          disabled={searching || !query.trim()}
          style={{ flexShrink: 0 }}
        >
          {searching ? <><span className="btn-spinner" />搜索中</> : <><Search size={13} />搜索</>}
        </button>
      </div>

      {searchError ? (
        <div style={{ background: 'var(--red-50)', border: '1px solid var(--red-200)', color: 'var(--red-600)', borderRadius: 'var(--r-md)', padding: '8px 12px', fontSize: 12, marginBottom: 16 }}>
          {searchError}
        </div>
      ) : null}

      {/* Two-column grid */}
      <div className="law-two-col">

        {/* Search results */}
        <div>
          <div className="law-section-header">
            <div className="law-section-title">搜索结果</div>
            <div className="law-section-count">{results.length > 0 ? `${results.length} 条` : '—'}</div>
          </div>

          {results.length === 0 ? (
            <div className="law-list" style={{ padding: '40px 20px', textAlign: 'center' }}>
              <Search size={24} style={{ color: 'var(--gray-300)', margin: '0 auto 10px' }} />
              <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>输入关键词搜索 BOE 法律数据库</div>
            </div>
          ) : (
            <div className="law-list">
              {results.map((r) => {
                const alreadyCached = isAlreadyCached(r.boe_id)
                return (
                  <div key={r.boe_id} className="law-list-item">
                    <div className="law-icon-box search">
                      <BookOpen size={14} />
                    </div>
                    <div className="law-item-body">
                      <div className="law-item-title">
                        {r.title}
                        {alreadyCached && <span className="badge badge-cached" style={{ fontSize: 10 }}>已缓存</span>}
                      </div>
                      <div className="law-item-code">{r.boe_id}</div>
                    </div>
                    <div className="law-item-actions">
                      {alreadyCached ? (
                        <span className="badge badge-active">已缓存</span>
                      ) : (
                        <button
                          type="button"
                          className="btn-primary btn-sm"
                          disabled={fetchingId === r.boe_id}
                          onClick={() => void handleFetch(r)}
                        >
                          {fetchingId === r.boe_id
                            ? <><span className="btn-spinner" />获取中</>
                            : <><Download size={12} />获取缓存</>}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Cached laws */}
        <div>
          <div className="law-section-header">
            <div className="law-section-title">已缓存法律</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="law-section-count">{cached.length} 条</span>
              <button type="button" className="icon-btn" style={{ width: 28, height: 28 }} onClick={loadCached} disabled={loadingCached} title="刷新">
                <Loader2 size={13} className={loadingCached ? 'spin-anim' : ''} />
              </button>
            </div>
          </div>

          {cached.length === 0 ? (
            <div className="law-list" style={{ padding: '40px 20px', textAlign: 'center' }}>
              <BookOpen size={24} style={{ color: 'var(--gray-300)', margin: '0 auto 10px' }} />
              <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>尚无缓存法律，先搜索并获取一条</div>
            </div>
          ) : (
            <div className="law-list">
              {cached.map((law) => (
                <div
                  key={law.id}
                  className="law-list-item"
                  style={{ cursor: 'pointer', background: preview?.id === law.id ? 'var(--indigo-50)' : undefined }}
                  onClick={() => setPreview(law)}
                >
                  <div className="law-icon-box cached">
                    <BookOpen size={14} />
                  </div>
                  <div className="law-item-body">
                    <div className="law-item-title">{law.title}</div>
                    <div className="law-item-code">{law.boe_id}{law.category ? ` · ${law.category}` : ''}</div>
                  </div>
                  <div className="law-item-actions">
                    <button
                      type="button"
                      className="icon-btn"
                      disabled={deletingId === law.id}
                      onClick={(e) => { e.stopPropagation(); void handleDelete(law) }}
                      title="删除缓存"
                      style={{ color: 'var(--red-600)' }}
                    >
                      {deletingId === law.id ? <span className="btn-spinner dark" style={{ width: 12, height: 12 }} /> : <Trash2 size={13} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Preview panel */}
      {preview && (
        <div className="section-card" style={{ marginTop: 20 }}>
          <div className="section-card-header">
            <div>
              <h3>{preview.title}</h3>
              <p>{preview.boe_id}{preview.category ? ` · ${preview.category}` : ''}</p>
            </div>
            <button type="button" className="icon-btn" onClick={() => setPreview(null)}><X size={14} /></button>
          </div>
          <div className="section-card-body">
            <div style={{ background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 'var(--r-md)', padding: '14px 16px', fontSize: 12.5, color: 'var(--gray-700)', lineHeight: 1.8, maxHeight: 400, overflowY: 'auto', fontFamily: 'var(--mono)', whiteSpace: 'pre-wrap' }}>
              {preview.raw_text || '该法律暂无可预览内容。'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
