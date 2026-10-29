import { useState, useEffect } from 'react'
import { apiFetch, apiResponseJson } from '../utils/api'

let cachedPaymentEnabled: boolean | null = null

export function setCachedPaymentEnabled(enabled: boolean) {
    cachedPaymentEnabled = enabled
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('payment-status-updated', { detail: enabled }))
    }
}

export function usePaymentStatus() {
    const [isPaymentEnabled, setIsPaymentEnabled] = useState<boolean>(() => {
        if (cachedPaymentEnabled !== null) return cachedPaymentEnabled
        return true
    })

    useEffect(() => {
        let active = true
        const controller = new AbortController()

        const handleStatusEvent = (e: Event) => {
            const customEvent = e as CustomEvent<boolean>
            if (typeof customEvent.detail === 'boolean') {
                cachedPaymentEnabled = customEvent.detail
                setIsPaymentEnabled(customEvent.detail)
            }
        }

        window.addEventListener('payment-status-updated', handleStatusEvent)

        apiFetch('/api/orders/payment/status', {
            signal: controller.signal,
            skipGlobalError: true,
        })
            .then(res => res.ok ? apiResponseJson(res) : null)
            .then(data => {
                if (active && data && typeof data.payment_enabled === 'boolean') {
                    cachedPaymentEnabled = data.payment_enabled
                    setIsPaymentEnabled(data.payment_enabled)
                }
            })
            .catch(() => {})

        return () => {
            active = false
            controller.abort()
            window.removeEventListener('payment-status-updated', handleStatusEvent)
        }
    }, [])

    return {
        isPaymentEnabled,
        isPaymentUnderMaintenance: !isPaymentEnabled,
    }
}
