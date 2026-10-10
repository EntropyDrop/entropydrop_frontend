export {}

declare global {
    interface Window {
        dataLayer?: IArguments[]
        gtag?: (...args: [string, ...unknown[]]) => void
    }
}
