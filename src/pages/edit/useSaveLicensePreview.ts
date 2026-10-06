import { useEffect, useState } from 'react'
import { apiJson } from '../../utils/api'
import { useAuthSession } from '../../hooks/useAuthSession'
import { useLatestRequest } from '../../hooks/useLatestRequest'
import type { CurrentUser } from '../../hooks/useCurrentUser'
import type { GenerationLogItem, SkinLicense } from '../../types/log'

type SaveLicensePreview = SkinLicense['code'] | 'loading' | 'unavailable'
type SelectableSaveLicense = 'cc-by-nc-4.0' | 'entropydrop-commercial-1.0'

export function resolveSaveLicense(user: Pick<CurrentUser, 'id' | 'is_pro'>, parent: GenerationLogItem | null): SaveLicensePreview {
    if (!parent) return user.is_pro ? 'entropydrop-commercial-1.0' : 'cc-by-nc-4.0'
    const code = parent.license?.code
    if (code === 'entropydrop-commercial-1.0') return String(parent.creator?.id) === String(user.id) ? code : 'cc-by-nc-4.0'
    return code === 'unknown' || code === 'cc-by-nc-4.0' ? code : 'unavailable'
}

export function useSaveLicensePreview(parentSkinId: string | null) {
    const session = useAuthSession()
    const key = JSON.stringify([session, parentSkinId])
    const [snapshot, setSnapshot] = useState<{ key: string; license: SaveLicensePreview; isPro: boolean } | null>(null)
    const [selected, setSelected] = useState<{ key: string; license: SelectableSaveLicense } | null>(null)
    const requests = useLatestRequest()
    useEffect(() => {
        if (!session) return
        const ticket = requests.begin()
        const options = { signal: ticket.signal, skipGlobalError: true }
        void Promise.all([
            apiJson<CurrentUser>('/api/users/me', options),
            parentSkinId ? apiJson<GenerationLogItem>(`/api/logs/${parentSkinId}`, options) : Promise.resolve(null),
        ]).then(([user, parent]) => {
            if (ticket.isCurrent()) setSnapshot({ key, license: resolveSaveLicense(user, parent), isPro: user.is_pro === true })
        }).catch(error => {
            if (ticket.isCurrent()) {
                console.error('Failed to resolve the saved skin license', error)
                setSnapshot({ key, license: 'unavailable', isPro: false })
            }
        })
        return () => requests.cancel()
    }, [session, parentSkinId, key, requests])
    const saveLicensePreview = !session ? 'unavailable' : snapshot?.key === key ? snapshot.license : 'loading'
    const selectedSaveLicense: SelectableSaveLicense = selected?.key === key ? selected.license
        : saveLicensePreview === 'entropydrop-commercial-1.0' ? saveLicensePreview : 'cc-by-nc-4.0'
    return { saveLicensePreview, isProUser: snapshot?.key === key && snapshot.isPro,
        selectedSaveLicense, setSelectedSaveLicense: (license: SelectableSaveLicense) => setSelected({ key, license }) }
}
