import type { LangData } from '../constants/lang'

export function FigureOrderNotification({ current, notification }: { current: LangData; notification: { type: string; orderId?: string; message?: string } }) {
    const messages: Record<string, string> = current.figureManagement.notifications
    return <span>
        <strong className="block text-[#a6df7a]">{current.figureManagement.order} #{notification.orderId}</strong>
        <span>{messages[notification.type] || current.figureManagement.title}</span>
        {notification.message && <span className="mt-1 block whitespace-pre-wrap break-words text-white/70">{notification.message}</span>}
    </span>
}
