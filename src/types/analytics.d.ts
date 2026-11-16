export {}

declare global {
    interface Window {
        umami?: {
            track: {
                (eventName: string, eventData?: Record<string, unknown>): void
                (customPayload: (props: Record<string, unknown>) => Record<string, unknown>): void
            }
        }
    }
}
