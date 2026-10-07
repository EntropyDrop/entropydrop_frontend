import { useEffect, useState } from 'react'
import { useAuthSession } from './useAuthSession'
import { useLatestRequest } from './useLatestRequest'
import { apiJson } from '../utils/api'
import type { SkinLicense } from '../types/log'

export type SourceRights = 'original' | 'external'
export type LicensePreview = SkinLicense['code'] | 'loading' | 'unavailable'
interface LicensePolicy {
    code: SkinLicense['code']
    public_license: SkinLicense['public_license']
    is_pro: boolean
    parent_is_private: boolean
}

/** All creation entry points preview the same policy enforced on the server. */
export function useSkinLicensePolicy({ operation, parentId, sourceRights, isPublic = true, enabled = true }: {
    operation: 'generate' | 'save'
    parentId?: string | null
    sourceRights?: SourceRights
    isPublic?: boolean
    enabled?: boolean
}) {
    const session = useAuthSession()
    const requests = useLatestRequest()
    const [revision, setRevision] = useState(0)
    const key = JSON.stringify([session, operation, parentId, sourceRights, isPublic, revision, enabled])
    const [snapshot, setSnapshot] = useState<{ key: string; policy: LicensePolicy | null } | null>(null)
    useEffect(() => {
        const refresh = () => setRevision(value => value + 1)
        window.addEventListener('user-updated', refresh)
        return () => window.removeEventListener('user-updated', refresh)
    }, [])
    useEffect(() => {
        if (!session || !enabled) return
        const ticket = requests.begin()
        const params = new URLSearchParams({ operation, is_public: String(isPublic) })
        if (parentId) params.set('parent', parentId)
        else if (sourceRights) params.set('source_rights', sourceRights)
        void apiJson<LicensePolicy>(`/api/licenses/preview?${params}`, {
            signal: ticket.signal, skipGlobalError: true,
        }).then(policy => {
            if (ticket.isCurrent()) setSnapshot({ key, policy })
        }).catch(() => {
            if (ticket.isCurrent()) setSnapshot({ key, policy: null })
        })
        return () => requests.cancel()
    }, [session, operation, parentId, sourceRights, isPublic, enabled, key, requests])
    const policy = snapshot?.key === key ? snapshot.policy : null
    const code: LicensePreview = !session || !enabled ? 'unavailable'
        : snapshot?.key !== key ? 'loading' : policy?.code ?? 'unavailable'
    return { key, code, policy, ready: code !== 'loading' && code !== 'unavailable' }
}
