import type { LangData } from '../constants/lang'

export interface FigureOrderProgress {
    status: string
    goods_status?: string | null
    figure_review_status?: string | null
    figure_review_reason?: string | null
    refund_status?: string | null
    tracking_number?: string | null
}

function figureOrderStatus(current: LangData, order: FigureOrderProgress) {
    const key = order.status === 'paid' ? (order.figure_review_status === 'approved' ? order.goods_status || 'preparing' : 'awaiting_review') : order.status
    const labels: Record<string, string> = current.figureManagement.statuses
    return labels[key] || key
}

export function FigureOrderStatus({ current, order }: { current: LangData; order: FigureOrderProgress }) {
    const t = current.figureManagement
    const refunds: Record<string, string> = t.refunds
    return <div className="space-y-1 border-l-2 border-[#84c96b]/50 pl-3 text-xs leading-relaxed">
        <p className="m-0 text-[#a6df7a]">{figureOrderStatus(current, order)}</p>
        {order.status === 'paid' && order.figure_review_status !== 'approved' && <p className="m-0 text-white/50">{t.reviewPending}</p>}
        {order.figure_review_reason && <p className="m-0 whitespace-pre-wrap break-words text-white/75">{t.reason}: {order.figure_review_reason}</p>}
        {order.refund_status && <p className="m-0 text-amber-200">{refunds[order.refund_status] || order.refund_status}</p>}
        {order.tracking_number && <p className="m-0 break-words text-white/75">{t.tracking}: {order.tracking_number}</p>}
    </div>
}
