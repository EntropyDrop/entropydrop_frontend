import type { LangData } from '../../constants/lang'
import { creatorButton, dollars, type PageResult, type PayoutRecord } from './creatorPortal'

export function CreatorPagination({ current, result, page, onChange, disabled }: { current: LangData; result?: Pick<PageResult<unknown>, 'total' | 'total_pages'>; page: number; onChange: (page: number) => void; disabled?: boolean }) {
    return <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-white/60">
        <button type="button" className={creatorButton} disabled={disabled || page <= 1} onClick={() => onChange(page - 1)}>{current.figureManagement.previous}</button>
        <span>{page} / {result?.total_pages || 1} · {result?.total ?? 0}</span>
        <button type="button" className={creatorButton} disabled={disabled || !result || page >= result.total_pages} onClick={() => onChange(page + 1)}>{current.figureManagement.next}</button>
    </div>
}

export function PayoutCard({ current, payout, children }: { current: LangData; payout: PayoutRecord; children?: React.ReactNode }) {
    const t = current.creatorPortal
    const states: Record<string, string> = t.states
    return <article className="space-y-3 border border-white/15 bg-black/10 p-4 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-3"><strong className="text-base text-[#a6df7a]">{dollars(payout.amount_cents)} USD</strong><span>{states[payout.status] || payout.status}</span></div>
        <p className="m-0 break-all text-white/50">{payout.id} · {new Date(payout.created_at).toLocaleString(current.lang)}</p>
        {payout.creator_email && <p className="m-0 break-all">{t.accountEmail}: {payout.creator_email}</p>}
        <p className="m-0 break-all">{t.paypalEmail}: {payout.paypal_email}</p>
        {payout.review_note && <p className="m-0 break-words text-white/65">{t.reviewNote}: {payout.review_note === 'balance_changed' ? t.insufficient : payout.review_note}</p>}
        {payout.last_error && <p className="m-0 leading-relaxed text-amber-200">{payout.status === 'manual_review' ? t.manualReviewHint : t.transferError}</p>}
        {payout.paypal_transaction_id && <p className="m-0 break-all text-white/60">{t.transaction}: {payout.paypal_transaction_id}</p>}
        {payout.events.length > 0 && <details className="text-white/60"><summary className="cursor-pointer">{t.history}</summary><ol className="space-y-2 pl-4">{payout.events.map((event, index) => <li key={index}>{new Date(event.created_at).toLocaleString(current.lang)} · {states[event.status] || event.status}</li>)}</ol></details>}
        {children}
    </article>
}
