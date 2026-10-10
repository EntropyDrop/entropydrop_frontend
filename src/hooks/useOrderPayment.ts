import { useEffect, useRef, useState } from 'react'
import type { LangData } from '../constants/lang'
import { apiFetch, apiResponseJson } from '../utils/api'

interface Checkout {
    popup: Window
    controller: AbortController
    timer?: number
}

export function useOrderPayment({ authSession, current, onSuccess, onError }: {
    authSession: string | null
    current: LangData
    onSuccess: () => void
    onError: (message: string) => void
}) {
    const checkout = useRef<Checkout | null>(null)
    const [processing, setProcessing] = useState<{ orderId: string; session: string } | null>(null)

    useEffect(() => () => {
        const active = checkout.current
        checkout.current = null
        if (active) {
            window.clearInterval(active.timer)
            active.controller.abort()
            active.popup.close()
        }
    }, [authSession])

    const pay = async (orderId: string) => {
        if (!authSession || checkout.current) return
        // Open during the click, before the request, so browsers retain user activation.
        const width = 600, height = 700
        const left = window.screenX + (window.innerWidth - width) / 2
        const top = window.screenY + (window.innerHeight - height) / 2
        const popup = window.open('', '_blank', `width=${width},height=${height},left=${left},top=${top}`)
        if (!popup) {
            onError(current.orders.popupBlocked)
            return
        }

        const active: Checkout = { popup, controller: new AbortController() }
        checkout.current = active
        setProcessing({ orderId, session: authSession })
        const isCurrent = () => checkout.current === active && !active.controller.signal.aborted
        const finish = () => {
            window.clearInterval(active.timer)
            if (checkout.current === active) {
                checkout.current = null
                setProcessing(null)
            }
            popup.close()
        }

        const confirmPayment = async (paypalOrderId: string) => {
            window.clearInterval(active.timer)
            if (!isCurrent()) return
            try {
                const response = await apiFetch(`/api/orders/${encodeURIComponent(orderId)}/pay`, {
                    method: 'POST', signal: active.controller.signal, auth: 'required', skipGlobalError: true,
                    body: JSON.stringify({ paypal_order_id: paypalOrderId }),
                })
                const result = await apiResponseJson(response)
                if (!isCurrent()) return
                if (response.ok) {
                    window.dispatchEvent(new Event('user-updated'))
                    onSuccess()
                } else if (!(response.status === 400 && result.detail === 'PayPal payment is not approved')) {
                    onError(result.detail || current.orders.paymentFailed)
                }
            } catch {
                if (isCurrent()) onError(current.orders.paymentFailed)
            } finally {
                finish()
            }
        }

        try {
            popup.document.title = current.modal.payOrder
            popup.document.body.textContent = current.orders.openingPayment
            const returnUrl = `${window.location.origin}/credits?payment_redirect=1`
            const response = await apiFetch(`/api/orders/${encodeURIComponent(orderId)}/create-paypal-order`, {
                method: 'POST', signal: active.controller.signal, auth: 'required', skipGlobalError: true,
                body: JSON.stringify({ return_url: returnUrl }),
            })
            const data = await apiResponseJson(response)
            if (!isCurrent()) return
            if (!response.ok) throw new Error(data.detail || current.orders.paymentFailed)
            if (!data.id) throw new Error(current.orders.paymentFailed)
            // Retry the existing voucher after an uncertain capture; never create another payment.
            if (['APPROVED', 'COMPLETED', 'CAPTURE_PENDING'].includes(data.status)) {
                await confirmPayment(data.id)
                return
            }
            if (popup.closed) { finish(); return }
            const approvalUrl = new URL(data.approval_url)
            if (approvalUrl.protocol !== 'https:' || !['www.paypal.com', 'www.sandbox.paypal.com'].includes(approvalUrl.hostname)) {
                throw new Error(current.orders.paymentFailed)
            }
            popup.location.href = approvalUrl.href
            active.timer = window.setInterval(() => {
                if (popup.closed) void confirmPayment(data.id)
            }, 500)
        } catch (error) {
            if (isCurrent()) onError(error instanceof Error ? error.message : current.orders.paymentFailed)
            finish()
        }
    }

    return { pay, processingOrderId: processing?.session === authSession ? processing.orderId : null }
}
