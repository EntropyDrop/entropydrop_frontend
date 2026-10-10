import { useEffect, useState } from 'react'
import { useAuthSession } from '../../../hooks/useAuthSession'
import { apiFetch, apiResponseJson } from '../../../utils/api'
import { getAuthSessionKey } from '../../../utils/authSession'
import type { OrderStickerSnapshot } from './orderSticker'

interface ProductionSource {
    id: string
    order_id: string
    model_type: string
    skin_url: string
    sticker_snapshot: OrderStickerSnapshot
}

/** A production link reloads the private order image URL and saved sticker data. */
export function useOrderProductionSource(search: string) {
    const query = new URLSearchParams(search)
    const orderId = query.get('order') || ''
    const itemId = query.get('item') || ''
    const active = !!(orderId || itemId)
    const key = JSON.stringify([orderId, itemId])
    const session = useAuthSession()
    const [retry, setRetry] = useState(0)
    const [result, setResult] = useState<{ key: string; session: string | null; data?: ProductionSource; failed?: boolean } | null>(null)
    useEffect(() => {
        if (!active) return
        const controller = new AbortController()
        void (async () => {
            try {
                if (!orderId || !itemId || !session) throw new Error('Invalid production request')
                const response = await apiFetch(`/api/figure/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}/production-source`, { signal: controller.signal, auth: 'required', skipGlobalError: true })
                if (!response.ok) throw new Error('Production source unavailable')
                const data: ProductionSource = await apiResponseJson(response)
                if (data.id !== itemId || data.order_id !== orderId || data.model_type !== 'Cute DIY Kit' || !data.skin_url || !data.sticker_snapshot || data.sticker_snapshot.schema_version !== 1 || data.sticker_snapshot.missing_fields.length) throw new Error('Incomplete production source')
                if (!controller.signal.aborted && session === getAuthSessionKey()) setResult({ key, session, data })
            } catch {
                if (!controller.signal.aborted && session === getAuthSessionKey()) setResult({ key, session, failed: true })
            }
        })()
        return () => controller.abort()
    }, [active, key, orderId, itemId, session, retry])
    const current = result?.key === key && result.session === session ? result : null
    return { active, orderId, data: current?.data, failed: !!current?.failed,
        retry: () => { setResult(null); setRetry(value => value + 1) } }
}
