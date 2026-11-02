import { Icon } from '@iconify/react'
import { type LangData } from '../constants/lang'
import { getNotificationActionUrl } from '../utils/notificationAction'

export function NotificationActionLink({ url, current, onOpen }: {
    url?: string | null
    current: LangData
    onOpen?: () => void
}) {
    const href = getNotificationActionUrl(url)
    if (!href) return null

    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${current.user.notifications.viewDetails} (${current.user.notifications.opensInNewTab})`}
            title={current.user.notifications.opensInNewTab}
            onClick={event => { event.stopPropagation(); onOpen?.() }}
            className="mt-1.5 self-start inline-flex items-center gap-1 px-2 py-1 border border-[#a6df7a]/30 bg-[#a6df7a]/10 text-[#a6df7a] text-[10px] hover:bg-[#a6df7a]/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#a6df7a] transition-colors"
        >
            {current.user.notifications.viewDetails}
            <Icon icon="pixelarticons:external-link" />
        </a>
    )
}
