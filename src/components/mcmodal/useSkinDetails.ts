import { useCallback, useEffect, useState } from 'react'
import { apiFetch, apiJson, apiResponseJson } from '../../utils/api'
import { useLatestRequest } from '../../hooks/useLatestRequest'
import { useAuthSession } from '../../hooks/useAuthSession'
import type { GenerationLogItem } from '../../types/log'

/** Detail, ancestry and counts belong to one cancellable selection. */
export function useSkinDetails(initialItem: GenerationLogItem, initialTextureUrl: string) {
    const [item, setItem] = useState(initialItem)
    const [textureUrl, setTextureUrl] = useState(initialTextureUrl)
    const [isLoadingDetails, setIsLoadingDetails] = useState(true)
    const [parentItem, setParentItem] = useState<GenerationLogItem | null>(null)
    const [isParentDeleted, setIsParentDeleted] = useState(false)
    const [isNotFound, setIsNotFound] = useState(false)
    const [derivedCount, setDerivedCount] = useState<number | null>(null)
    const [relatedCollectionsCount, setRelatedCollectionsCount] = useState<number | null>(null)
    const requests = useLatestRequest()
    const session = useAuthSession()
    const loadDetails = useCallback(async (id: string) => {
        const ticket = requests.begin()
        setIsLoadingDetails(Boolean(id))
        setIsNotFound(false)
        setParentItem(null)
        setIsParentDeleted(false)
        setDerivedCount(null)
        setRelatedCollectionsCount(null)
        if (!id) return
        const options = { signal: ticket.signal, skipGlobalError: true }
        try {
            const response = await apiFetch(`/api/logs/${id}`, options)
            const data: GenerationLogItem | null = response.ok ? await apiResponseJson(response) : null
            if (!ticket.isCurrent()) return
            if (!data?.result) {
                if (response.status === 403 || response.status === 404 || response.ok) {
                    setIsNotFound(true)
                    setTextureUrl('')
                }
                return
            }
            setItem(data)
            setTextureUrl(data.result)
            setIsLoadingDetails(false)
            const tasks: Promise<void>[] = []
            if (data.parent) tasks.push((async () => {
                const response = await apiFetch(`/api/logs/${data.parent}`, options)
                const parent: GenerationLogItem | null = response.ok ? await apiResponseJson(response) : null
                if (ticket.isCurrent()) { setParentItem(parent); setIsParentDeleted(response.status === 404) }
            })())
            if (session) {
                tasks.push(apiJson<{ items?: unknown[] }>(`/api/logs/${id}/derived`, options).then(data => {
                    if (ticket.isCurrent()) setDerivedCount(data.items?.length ?? 0)
                }))
                tasks.push(apiJson<{ total?: number }>(`/api/logs/${id}/public_collections?page=1&page_size=1`, options).then(data => {
                    if (ticket.isCurrent()) setRelatedCollectionsCount(data.total ?? 0)
                }))
            }
            await Promise.allSettled(tasks)
        } catch (error) { if (ticket.isCurrent()) console.error('Failed to load skin details', error) }
        finally { if (ticket.isCurrent()) setIsLoadingDetails(false) }
    }, [requests, session])
    useEffect(() => {
        const scope = requests
        void loadDetails(initialItem.id)
        return () => scope.cancel()
    }, [initialItem.id, loadDetails, requests])
    return { item, setItem, textureUrl, setTextureUrl, isLoadingDetails, parentItem, isParentDeleted, isNotFound, derivedCount, relatedCollectionsCount, setRelatedCollectionsCount, loadDetails }
}
