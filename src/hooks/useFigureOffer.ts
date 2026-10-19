import { useEffect, useState } from 'react'
import { apiFetch, apiResponseJson } from '../utils/api'

export const figurePricingEvent = 'figure-pricing-updated'
export interface FigureOffer {
    model_type: string
    price: number
    discounted_price?: number
    global_discount_bps?: number
    global_discount_version?: number
}

export function figureDiscountAmount(price: number, quantity: number, bps = 0) {
    return Math.round(Math.round(price * 100) * quantity * bps / 10000) / 100
}

export function useFigureOffer(modelType: string) {
    const [offer, setOffer] = useState<FigureOffer | null>(null)
    useEffect(() => {
        let controller: AbortController | undefined
        const load = async () => {
            controller?.abort()
            const request = new AbortController()
            controller = request
            try {
                const response = await apiFetch('/api/orders/model-stock?order_type=print', {
                    auth: 'none', signal: request.signal, skipGlobalError: true,
                })
                if (!response.ok) {
                    if (!request.signal.aborted) setOffer(null)
                    return
                }
                const catalog: FigureOffer[] = await apiResponseJson(response)
                const kit = catalog.find(item => item.model_type === modelType)
                if (!request.signal.aborted) setOffer(kit && Number.isFinite(kit.price) && kit.price > 0 ? kit : null)
            } catch {
                if (!request.signal.aborted) setOffer(null)
            }
        }
        void load()
        window.addEventListener(figurePricingEvent, load)
        window.addEventListener('focus', load)
        return () => {
            controller?.abort()
            window.removeEventListener(figurePricingEvent, load)
            window.removeEventListener('focus', load)
        }
    }, [modelType])
    return offer?.model_type === modelType ? offer : null
}
