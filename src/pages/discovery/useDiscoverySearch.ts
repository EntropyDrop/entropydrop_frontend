import { useEffect, useState } from 'react'
import { apiFetch, apiJson, apiResponseJson } from '../../utils/api'
import { useLatestRequest } from '../../hooks/useLatestRequest'
import { useAuthSession } from '../../hooks/useAuthSession'
import type { GenerationLogItem, GenerationLogItemBrief } from '../../types/log'
import type { ModelSeries } from '../../types/discovery'
import type { LangData } from '../../constants/lang'

export type DiscoverySearchItem = GenerationLogItemBrief & Partial<Omit<GenerationLogItem, keyof GenerationLogItemBrief>>
function normalizeItem(item: unknown): DiscoverySearchItem | null {
    if (!item || typeof item !== 'object') return null
    const raw = item as Record<string, unknown>
    if (typeof raw.id !== 'string' || !raw.id.trim() || typeof raw.result !== 'string' || !raw.result.trim()) return null
    return { ...raw, id: raw.id.trim(), result: raw.result.trim(), prompt: typeof raw.prompt === 'string' ? raw.prompt : '', is_public: raw.is_public !== false } as DiscoverySearchItem
}

/** Both views share search criteria, results and pagination. Only the latest request can commit. */
export function useDiscoverySearch(view: 'list' | '3d', current: LangData) {
    const [query, setQuery] = useState('')
    const [criteria, setCriteria] = useState({ query: '', page: 1, revision: 0 })
    const [sortBy, setSortByState] = useState<'created_at' | 'likes'>('created_at')
    const [modelSeries, setModelSeriesState] = useState<ModelSeries>('')
    const [items, setItems] = useState<DiscoverySearchItem[]>([])
    const [total, setTotal] = useState(0)
    const [isLoading, setIsLoading] = useState(false)
    const [openSession, setOpenSession] = useState<string | null>(null)
    const [resultKey, setResultKey] = useState<string | null>(null)
    const [settledKey, setSettledKey] = useState<string | null>(null)
    const requests = useLatestRequest()
    const metadata = useLatestRequest()
    const authSession = useAuthSession()
    const isOpen = openSession !== null && openSession === authSession
    const active = view === 'list' || isOpen
    const key = JSON.stringify([authSession, criteria.query, criteria.page, sortBy, modelSeries])
    const pageSize = 24
    const messages = current.discovery

    useEffect(() => {
        if (!active) return
        const scope = requests
        const ticket = scope.begin()
        setIsLoading(true)
        const params = new URLSearchParams({ page: String(criteria.page), page_size: String(pageSize), sort_by: sortBy })
        if (criteria.query) params.set('q', criteria.query)
        if (modelSeries) params.set('model_series', modelSeries)
        void (async () => {
            try {
                const res = await apiFetch(`/api/discovery/search?${params}`, { signal: ticket.signal, skipGlobalError: true, cacheTtlMs: 10_000 })
                const data = await apiResponseJson(res).catch(() => null)
                if (!ticket.isCurrent()) return
                if (!res.ok) {
                    window.dispatchEvent(new CustomEvent('global-error', { detail: {
                        title: res.status === 429 ? messages.rateLimitTitle : current.common.requestError,
                        message: res.status === 429 ? messages.rateLimitMessage : (typeof data?.detail === 'string' ? data.detail : current.common.requestFailed),
                    } }))
                    return
                }
                const results = (Array.isArray(data?.items) ? data.items : []).map(normalizeItem).filter((item: DiscoverySearchItem | null): item is DiscoverySearchItem => item !== null)
                setResultKey(key)
                setItems(results)
                setTotal(typeof data?.total === 'number' ? data.total : results.length)
            } catch (error) {
                if (ticket.isCurrent() && !(error instanceof DOMException && error.name === 'AbortError')) {
                    console.error('Discovery search failed', error)
                    window.dispatchEvent(new CustomEvent('global-error', { detail: { title: current.common.networkError, message: current.common.networkConnectFailed } }))
                }
            } finally { if (ticket.isCurrent()) { setIsLoading(false); setSettledKey(key) } }
        })()
        return () => scope.cancel()
    }, [active, criteria, sortBy, modelSeries, authSession, requests, messages, current.common, key])

    const handleSearch = (page: number) => {
        const trimmed = query.trim()
        if (!trimmed && view === '3d') return
        if (trimmed && trimmed.length < (/[\u4e00-\u9fa5]/.test(trimmed) ? 1 : 3)) {
            window.dispatchEvent(new CustomEvent('global-error', { detail: { title: current.generate.notice, message: messages.searchMinLengthWarning } }))
            return
        }
        setOpenSession(authSession)
        setCriteria(previous => ({ query: trimmed, page, revision: previous.revision + 1 }))
    }
    const setSortBy = (value: typeof sortBy) => { setSortByState(value); setCriteria(previous => ({ ...previous, page: 1 })) }
    const setModelSeries = (value: ModelSeries) => { setModelSeriesState(value); setCriteria(previous => ({ ...previous, page: 1 })) }
    const closeSearch = () => { setOpenSession(null); requests.cancel() }
    const refreshItem = async (id: string) => {
        const ticket = metadata.begin()
        try {
            const data = await apiJson<GenerationLogItem>(`/api/logs/${id}`, { signal: ticket.signal, skipGlobalError: true })
            if (ticket.isCurrent()) setItems(previous => previous.map(item => item.id === id ? { ...item, name: data.name, likes_count: data.likes_count, is_liked: data.is_liked } : item))
        } catch (error) { if (ticket.isCurrent()) console.error('Failed to refresh skin metadata', error) }
    }
    const handleLike = async (item: DiscoverySearchItem) => {
        if (!authSession) {
            window.dispatchEvent(new CustomEvent('global-error', { detail: { title: current.generate.notice, message: current.common.authRequired } }))
            return
        }
        try {
            const data = await apiJson<{ action: string; likes_count: number }>(`/api/like/${item.id}`, { method: 'POST' })
            setItems(previous => previous.map(result => result.id === item.id ? { ...result, is_liked: data.action === 'liked', likes_count: data.likes_count } : result))
        } catch (error) { console.error('Failed to like skin', error) }
    }
    return {
        query, setQuery, submittedQuery: criteria.query,
        items: resultKey === key ? items : [], total: resultKey === key ? total : 0,
        page: criteria.page, totalPages: Math.ceil((resultKey === key ? total : 0) / pageSize),
        isLoading: active && (isLoading || settledKey !== key), isOpen: isOpen && view === '3d',
        closeSearch, handleSearch, sortBy, setSortBy, modelSeries, setModelSeries, refreshItem, handleLike,
    }
}
export type DiscoverySearchController = ReturnType<typeof useDiscoverySearch>
