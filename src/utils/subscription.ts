import { apiFetch } from './api'

const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds))

export async function activateSubscriptionWithRetry(subscriptionId: string): Promise<Response> {
    let response: Response | null = null
    for (let attempt = 0; attempt < 6; attempt += 1) {
        response = await apiFetch('/api/orders/subscription/activate', {
            method: 'POST',
            body: JSON.stringify({ paypal_order_id: subscriptionId })
        })
        if (response.status !== 409 || attempt === 5) {
            return response
        }
        await wait(Math.min(500 * (2 ** attempt), 4000))
    }
    return response as Response
}
