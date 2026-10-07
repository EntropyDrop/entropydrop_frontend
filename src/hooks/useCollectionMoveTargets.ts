import { useEffect, useState } from 'react'
import { useAuthSession } from './useAuthSession'
import { useLatestRequest } from './useLatestRequest'
import { apiJson } from '../utils/api'

interface MoveTarget {
    id: string | number
    name: string
    is_public: boolean
    original_creation?: boolean
}

interface MoveTargetPage {
    items: MoveTarget[]
    total_pages: number
}

export function useCollectionMoveTargets({ enabled, sourceCollectionId, skinIsPublic }: {
    enabled: boolean
    sourceCollectionId?: string | number
    skinIsPublic?: boolean
}) {
    const session = useAuthSession()
    const requests = useLatestRequest()
    const [revision, setRevision] = useState(0)
    const canLoad = enabled && !!session && sourceCollectionId != null && skinIsPublic !== undefined
    const key = JSON.stringify([session, canLoad, sourceCollectionId, skinIsPublic, revision])
    const [snapshot, setSnapshot] = useState<{
        key: string; status: 'ready' | 'error'; targets: MoveTarget[]
    } | null>(null)

    useEffect(() => {
        if (!canLoad) return
        const ticket = requests.begin()
        const load = async () => {
            const targets = new Map<string, MoveTarget>()
            let page = 1
            let totalPages = 1
            do {
                const visibilityFilter = skinIsPublic ? '' : '&is_public=false'
                const data: MoveTargetPage = await apiJson<MoveTargetPage>(
                    `/api/collections?page=${page}&page_size=100&show_original_creation=false${visibilityFilter}`,
                    { signal: ticket.signal, skipGlobalError: true },
                )
                if (!ticket.isCurrent()) return
                for (const collection of data.items) {
                    if (!collection.original_creation && (skinIsPublic || !collection.is_public) && String(collection.id) !== String(sourceCollectionId)) {
                        targets.set(String(collection.id), collection)
                    }
                }
                totalPages = data.total_pages
                page += 1
            } while (page <= totalPages)
            setSnapshot({ key, status: 'ready', targets: [...targets.values()] })
        }
        void load().catch(() => {
            if (ticket.isCurrent()) setSnapshot({ key, status: 'error', targets: [] })
        })
        return () => requests.cancel()
    }, [canLoad, key, skinIsPublic, sourceCollectionId, requests])

    return {
        status: !canLoad ? 'idle' : snapshot?.key === key ? snapshot.status : 'loading',
        targets: canLoad && snapshot?.key === key ? snapshot.targets : [],
        reload: () => setRevision(value => value + 1),
    }
}
