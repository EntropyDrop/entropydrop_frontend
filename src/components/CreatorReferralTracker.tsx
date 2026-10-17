import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuthSession } from '../hooks/useAuthSession'
import { apiFetch, apiResponseJson } from '../utils/api'
import { clearReferralReceipt, readReferralReceipt, referralCode, saveReferralReceipt, type ReferralReceipt } from '../utils/creatorReferral'

export function CreatorReferralTracker() {
    const { search } = useLocation()
    const session = useAuthSession()
    const [code, setCode] = useState(() => referralCode(search))
    const [receipt, setReceipt] = useState(readReferralReceipt)
    useEffect(() => {
        const next = referralCode(search)
        if (next) void Promise.resolve().then(() => setCode(next))
    }, [search])
    useEffect(() => {
        if (!code) return
        const controller = new AbortController()
        void (async () => {
            try {
                const response = await apiFetch('/api/creators/visit', { method: 'POST', auth: 'none', credentials: 'omit',
                    signal: controller.signal, skipGlobalError: true, body: JSON.stringify({ code }) })
                if (!response.ok) return
                const data: ReferralReceipt = await apiResponseJson(response)
                if (!controller.signal.aborted && data.code === code && typeof data.token === 'string' && Date.parse(data.expires_at) > Date.now()) {
                    saveReferralReceipt(data)
                    setReceipt(data)
                }
            } catch { /* Referral lookup never interrupts browsing. */ }
        })()
        return () => controller.abort()
    }, [code])
    useEffect(() => {
        if (!session || !receipt) return
        const controller = new AbortController()
        void (async () => {
            try {
                const response = await apiFetch('/api/creators/referral', { method: 'POST', auth: 'required',
                    signal: controller.signal, skipGlobalError: true, body: JSON.stringify({ token: receipt.token }) })
                if (response.ok && !controller.signal.aborted) { clearReferralReceipt(receipt.token); setReceipt(null) }
            } catch { /* The saved receipt can be retried at checkout. */ }
        })()
        return () => controller.abort()
    }, [session, receipt])
    return null
}
