import { useCallback, useEffect, useState, useSyncExternalStore, type SetStateAction } from 'react'
import { useAuthSession } from './useAuthSession'
import { useLatestRequest } from './useLatestRequest'
import { getAuthSessionKey } from '../utils/authSession'
import { apiJson, invalidateApiQueries } from '../utils/api'
import { isAuthReady, subscribeAuthReady } from '../utils/authClient'

export interface CurrentUser {
    id: string
    username: string
    picture: string
    google_id: string
    is_pro: boolean
    is_admin: boolean
    pro_expires_at: string
    email: string
    terms_agreed: boolean
    pro_level: string
    paypal_subscription_status?: string
    skin_url?: string | null
    skin_type?: string | null
    text_to_skin_enabled?: boolean
    image_to_skin_enabled?: boolean
    image_edit_to_skin_enabled?: boolean
    credits?: number
}

/** Profile requests share the API cache; each mounted consumer has its own cancellation lease. */
export function useCurrentUser() {
    const session = useAuthSession()
    const ready = useSyncExternalStore(subscribeAuthReady, isAuthReady, () => false)
    const [snapshot, setSnapshot] = useState<{ session: string | null; user: CurrentUser | null }>({ session: null, user: null })
    const requests = useLatestRequest()
    const refresh = useCallback(async (force = false) => {
        const expected = getAuthSessionKey()
        if (!expected) return
        if (force) {
            invalidateApiQueries()
            window.dispatchEvent(new Event('user-updated'))
        }
        const ticket = requests.begin()
        try {
            const user = await apiJson<CurrentUser>('/api/users/me', { signal: ticket.signal, auth: 'required', skipGlobalError: true })
            if (ticket.isCurrent() && expected === getAuthSessionKey()) setSnapshot({ session: expected, user })
        } catch (error) { if (ticket.isCurrent()) console.error('Failed to load current user', error) }
    }, [requests])
    useEffect(() => {
        const scope = requests
        let active = true
        void Promise.resolve().then(() => { if (active) return refresh() })
        const updated = () => { void refresh() }
        window.addEventListener('user-updated', updated)
        return () => { active = false; scope.cancel(); window.removeEventListener('user-updated', updated) }
    }, [session, ready, refresh, requests])
    const setUser = useCallback((value: SetStateAction<CurrentUser | null>) => {
        const session = getAuthSessionKey()
        setSnapshot(previous => ({ session, user: typeof value === 'function' ? value(previous.session === session ? previous.user : null) : value }))
    }, [])
    return { user: snapshot.session === session ? snapshot.user : null, setUser, refresh }
}
