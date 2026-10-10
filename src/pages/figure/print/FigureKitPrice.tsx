import { useEffect, useState } from 'react'
import { apiFetch, apiResponseJson } from '../../../utils/api'

export function FigureKitPrice({ modelType }: { modelType: string }) {
    const [quote, setQuote] = useState<{ modelType: string; price: number } | null>(null)
    useEffect(() => {
        const controller = new AbortController()
        void (async () => {
            try {
                const response = await apiFetch('/api/orders/model-stock?order_type=print', {
                    auth: 'none', signal: controller.signal, skipGlobalError: true,
                })
                if (!response.ok) return
                const catalog: { model_type: string; price: number }[] = await apiResponseJson(response)
                const kit = catalog.find(item => item.model_type === modelType)
                if (!controller.signal.aborted && kit && Number.isFinite(kit.price) && kit.price > 0) {
                    setQuote({ modelType, price: kit.price })
                }
            } catch { /* The order dialog can retry loading current purchase details. */ }
        })()
        return () => controller.abort()
    }, [modelType])
    if (!quote || quote.modelType !== modelType) return null
    return <span className="whitespace-nowrap">· ${quote.price.toFixed(2).replace(/\.00$/, '')}</span>
}
