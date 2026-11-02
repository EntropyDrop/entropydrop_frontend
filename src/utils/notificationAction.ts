export function getNotificationActionUrl(value?: string | null): string | null {
    const url = value?.trim()
    if (!url || url.length > 2083 || !/^https?:\/\//i.test(url)) return null
    try {
        const parsed = new URL(url)
        return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && parsed.href.length <= 2083 ? parsed.href : null
    } catch {
        return null
    }
}
