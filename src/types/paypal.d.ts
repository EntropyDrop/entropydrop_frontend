/** The subset of the PayPal JS SDK used by the embedded checkout. */
export interface PayPalButtons {
    render(container: HTMLElement): Promise<void>
    close(): Promise<void>
}

interface SubscriptionActions {
    subscription: {
        create(options: { plan_id: string; custom_id?: string }): Promise<string>
        revise(id: string, options: { plan_id: string }): Promise<string>
    }
}

interface ButtonOptions {
    createOrder?: () => Promise<string | undefined>
    createSubscription?: (data: unknown, actions: SubscriptionActions) => Promise<string | undefined>
    onApprove: (data: { orderID: string; subscriptionID?: string }) => Promise<void>
    onCancel: () => void
    onError: (error: unknown) => void
}

declare global {
    interface Window {
        paypal?: { Buttons(options: ButtonOptions): PayPalButtons }
    }
}
