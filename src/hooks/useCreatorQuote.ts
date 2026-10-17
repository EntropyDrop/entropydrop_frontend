import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch, apiResponseJson } from '../utils/api'
import { getAuthSessionKey } from '../utils/authSession'
import { readReferralReceipt, referralEvent } from '../utils/creatorReferral'
import type { LangData } from '../constants/lang'

export interface CreatorOffer { code: string; discount_percent: number; version: number }
interface CreatorQuote { offer: CreatorOffer | null; subtotal: number; shipping_fee: number; discount_amount: number; total_price: number }

export function creatorError(detail: unknown, current: LangData) {
    return (detail === 'creator_code_invalid' || detail === 'creator_self_referral') ? current.creatorCodes.invalid
        : detail === 'creator_offer_changed' ? current.creatorCodes.changed
        : current.creatorCodes.failed
}

export function useCreatorQuote(session: string | null, modelType: string, quantity: number, current: LangData) {
    const key = JSON.stringify([session, modelType, quantity])
    const [result, setResult] = useState<{ key: string; quote: CreatorQuote } | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const selectedCode = useRef<string | null>(null)
    const request = useRef<AbortController | null>(null)
    const load = useCallback(async (code: string | null, apply = false) => {
        if (!session) return
        request.current?.abort()
        const controller = new AbortController()
        request.current = controller
        setBusy(true); setError('')
        try {
            const response = await apiFetch('/api/creators/quote', { method: 'POST', auth: 'required', signal: controller.signal,
                skipGlobalError: true, body: JSON.stringify({ code, model_type: modelType, quantity, referral_token: readReferralReceipt()?.token }) })
            const quote = await apiResponseJson(response)
            if (controller.signal.aborted || session !== getAuthSessionKey()) return
            if (!response.ok) throw new Error(creatorError(quote.detail, current))
            if (![quote.subtotal, quote.shipping_fee, quote.discount_amount, quote.total_price].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)
                || (quote.offer && (typeof quote.offer.code !== 'string' || !Number.isInteger(quote.offer.version)))) throw new Error(current.creatorCodes.failed)
            if (apply) selectedCode.current = quote.offer?.code || ''
            setResult({ key, quote })
        } catch (error) {
            if (!controller.signal.aborted && session === getAuthSessionKey()) setError(error instanceof Error ? error.message : current.creatorCodes.failed)
        } finally { if (!controller.signal.aborted) setBusy(false) }
    }, [session, modelType, quantity, key, current])
    useEffect(() => {
        let active = true
        void Promise.resolve().then(() => { if (active) return load(selectedCode.current) })
        const refresh = () => { if (selectedCode.current === null) void load(null) }
        window.addEventListener(referralEvent, refresh)
        return () => { active = false; request.current?.abort(); window.removeEventListener(referralEvent, refresh) }
    }, [load])
    const quote = result?.key === key ? result.quote : null
    return { quote, busy, error, ready: !!quote && !busy, apply: (code: string) => load(code.trim().toUpperCase(), true), retry: () => load(selectedCode.current) }
}
