import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import type { LangData } from '../constants/lang'
import { PageContainer } from '../components/PageContainer'
import { FigureOrderStatus, type FigureOrderProgress } from '../components/FigureOrderStatus'
import { Skin2DImg } from '../components/Skin2DImg'
import { Skin3DModal } from '../components/Skin3DModal'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { useAuthSession } from '../hooks/useAuthSession'
import { apiFetch, apiResponseJson } from '../utils/api'
import { getAuthSessionKey } from '../utils/authSession'
import { OrderKitDetails } from './figure/print/KitSpecificationsDetails'
import type { OrderStickerRecord } from './figure/print/orderSticker'
import type { KitSpecificationRecord } from './figure/print/kitSpecifications'
import { getFigureModelName } from './figure/print/figureModels'

type Source = { skin_id: string; name?: string; publisher_id?: string; publisher_name?: string; parent_id?: string; license?: string; public_license?: string; is_public?: boolean }
type Item = KitSpecificationRecord & OrderStickerRecord & { id: string; model_type: string; skin_url?: string; refer_log_id?: string; source_snapshot?: Source; source_current?: Source }
interface FigureOrder extends FigureOrderProgress {
    id: string; user_id: string; total_price: number; created_at: string; items: Item[]
    figure_reviewed_by?: string; figure_reviewed_at?: string; refund_error?: string; paypal_refund_id?: string
    address?: { recipient_name?: string; country: string; state: string; city: string; detail_address: string; phone: string; zip_code: string }
}
type Queue = 'review' | 'production' | 'shipping' | 'refunds' | 'all'
type Action = 'approve' | 'reject' | 'printing' | 'shipping' | 'completed' | 'sync'
type Selection = { order: FigureOrder; action: Action }
const button = 'inline-flex min-h-9 items-center justify-center border border-white/15 bg-white/5 px-3 py-2 text-xs hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer'
const field = 'w-full border border-white/20 bg-[#101510] px-3 py-2 text-sm text-white outline-none focus:border-[#84c96b]'

export function FigureManagePage({ current }: { current: LangData }) {
    const { user } = useCurrentUser()
    const session = useAuthSession()
    return <PageContainer bg="bg-[#151915]" gap="gap-5" className={current.fontClass}>
        <header><h1 className="m-0 text-xl">{current.figureManagement.title}</h1><p className="mb-0 text-xs leading-relaxed text-white/55">{current.figureManagement.subtitle}</p></header>
        {user?.is_admin && session ? <FigureOrderQueue key={`${user.id}:${session}`} current={current} /> : <p role="status" className="text-sm text-white/60">{current.figureManagement.restricted}</p>}
    </PageContainer>
}

function FigureOrderQueue({ current }: { current: LangData }) {
    const t = current.figureManagement
    const [queue, setQueue] = useState<Queue>('review')
    const [page, setPage] = useState(1)
    const [reload, setReload] = useState(0)
    const [data, setData] = useState<{ items: FigureOrder[]; total: number; total_pages: number } | null>(null)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(true)
    const [selection, setSelection] = useState<Selection | null>(null)
    const [preview, setPreview] = useState<string | null>(null)
    useEffect(() => {
        const controller = new AbortController()
        const session = getAuthSessionKey()
        void (async () => {
            setLoading(true); setError(''); setData(null)
            try {
                const response = await apiFetch(`/api/figure/orders?stage=${queue}&page=${page}`, { signal: controller.signal, auth: 'required', skipGlobalError: true })
                if (!response.ok) throw new Error(response.status === 403 ? t.restricted : t.failed)
                const result = await apiResponseJson(response)
                if (!controller.signal.aborted && session === getAuthSessionKey()) setData(result)
            } catch (error) {
                if (!controller.signal.aborted && session === getAuthSessionKey()) setError(error instanceof Error ? error.message : t.failed)
            } finally { if (!controller.signal.aborted && session === getAuthSessionKey()) setLoading(false) }
        })()
        return () => controller.abort()
    }, [queue, page, reload, t])
    const select = (order: FigureOrder, action: Action) => setSelection({ order, action })
    return <>
        <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2" aria-label={t.title}>{(Object.keys(t.filters) as Queue[]).map(key => <button key={key} type="button" aria-pressed={queue === key} disabled={!!selection} onClick={() => { setQueue(key); setPage(1) }} className={`${button} ${queue === key ? 'border-[#84c96b]/70 text-[#a6df7a]' : 'text-white/60'}`}>{t.filters[key]}</button>)}</div>
            <button type="button" disabled={loading || !!selection} onClick={() => setReload(value => value + 1)} className={button}>{t.refresh}</button>
        </div>
        {error && <p role="alert" className="text-sm text-red-200">{error}</p>}
        {loading && <p role="status" className="text-sm text-white/50">{t.loading}</p>}
        {data?.items.length === 0 && <p className="py-16 text-center text-sm text-white/45">{t.empty}</p>}
        {data?.items.map(order => <article key={order.id} className="border border-white/10 bg-black/15 p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap justify-between gap-3">
                <div><h2 className="m-0 text-sm">{t.order} #{order.id}</h2><p className="mb-0 text-xs text-white/45">{t.customer}: {order.user_id} · {new Date(order.created_at).toLocaleString(current.lang)}</p></div>
                <strong className="text-[#a6df7a]">${order.total_price.toFixed(2)}</strong>
            </div>
            <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
                <div className="space-y-3">{order.items.map(item => {
                    const source = item.source_snapshot || item.source_current
                    const sticker = item.sticker_snapshot
                    const skinId = sticker?.skin_id || item.refer_log_id
                    const modelName = item.kit_specifications_snapshot?.product_name || item.kit_specifications_current?.product_name || getFigureModelName(item.model_type)
                    return <div key={item.id} className="flex gap-4 border border-white/10 p-3">
                        {item.skin_url && <button type="button" onClick={() => setPreview(item.skin_url!)} aria-label={t.preview} className="h-28 w-16 shrink-0 bg-black/30 p-2 cursor-pointer"><Skin2DImg src={item.skin_url} className="h-full w-full object-contain" showRawFallback /></button>}
                        <div className="min-w-0 space-y-1 text-xs text-white/60"><h3 className="m-0 text-sm text-white">{sticker?.skin_name || source?.name || modelName}</h3><p className="m-0 text-[#a6df7a]">{modelName}</p>
                            <p className="m-0 text-[10px] text-white/40">{item.source_snapshot ? t.snapshot : t.currentSource}</p>
                            <p className="m-0 break-all">{t.source}: {skinId ? <Link to={`/skin/?id=${encodeURIComponent(skinId)}`} target="_blank" className="underline">{skinId}</Link> : t.unknown}</p>
                            <p className="m-0">{t.publisher}: {sticker?.publisher_name || source?.publisher_name || t.unknown} · {sticker?.publisher_id || source?.publisher_id || t.unknown}</p>
                            <p className="m-0 break-words">{t.license}: {source?.license || t.unknown} · {t.publicLicense}: {source?.public_license || '—'}</p>
                            {source?.parent_id && <p className="m-0">{t.parent}: <Link to={`/skin/?id=${encodeURIComponent(source.parent_id)}`} target="_blank" className="underline">{source.parent_id}</Link></p>}
                            <OrderKitDetails item={item} current={current} />
                            {sticker?.origin === 'legacy_backfill' && <p className="text-[10px] text-amber-200/70">{current.orders.legacyStickerSnapshot}</p>}
                            {item.model_type === 'Cute DIY Kit' && (!sticker || sticker.missing_fields.length > 0) && <p className="text-[10px] text-amber-200/70">{current.orders.stickerSnapshotIncomplete}</p>}
                            {order.figure_review_status === 'approved' && ['paid', 'shipping', 'completed'].includes(order.status) && item.skin_url && sticker && !sticker.missing_fields.length && item.model_type === 'Cute DIY Kit' && <Link className="inline-block pt-2 text-[#a6df7a] underline" to={`/figure/3dprint?order=${encodeURIComponent(order.id)}&item=${encodeURIComponent(item.id)}`}>{t.prepare}</Link>}
                        </div>
                    </div>
                })}</div>
                <div className="space-y-4"><FigureOrderStatus current={current} order={order} />
                    <div className="text-xs leading-relaxed text-white/55"><p className="m-0 mb-1 text-white/80">{t.address}</p>{order.address ? <p className="m-0 break-words">{order.address.recipient_name && <>{order.address.recipient_name}<br /></>}{order.address.country} · {order.address.state} {order.address.city}<br />{order.address.detail_address}<br />{order.address.zip_code} · {order.address.phone}</p> : t.noAddress}</div>
                    {order.figure_reviewed_by && <p className="text-[10px] text-white/40">{t.reviewedBy}: {order.figure_reviewed_by}{order.figure_reviewed_at && <> · {new Date(order.figure_reviewed_at).toLocaleString(current.lang)}</>}</p>}
                    {order.paypal_refund_id && <p className="break-all text-xs text-white/50">{t.refundId}: {order.paypal_refund_id}</p>}
                    {order.refund_error && <p role="alert" className="text-xs leading-relaxed text-amber-200">{order.refund_error}</p>}
                    <div className="flex flex-wrap gap-2">
                        {order.status === 'paid' && (!order.figure_review_status || order.figure_review_status === 'pending') && <><button type="button" className={`${button} bg-[#3c8527]`} onClick={() => select(order, 'approve')}>{t.approve}</button><button type="button" className={`${button} text-red-200`} onClick={() => select(order, 'reject')}>{t.reject}</button></>}
                        {order.status === 'paid' && order.figure_review_status === 'approved' && order.goods_status === 'preparing' && <button type="button" className={button} onClick={() => select(order, 'printing')}>{t.start}</button>}
                        {order.status === 'paid' && order.figure_review_status === 'approved' && order.goods_status === 'printing' && <button type="button" className={button} onClick={() => select(order, 'shipping')}>{t.ship}</button>}
                        {order.status === 'shipping' && order.figure_review_status === 'approved' && <button type="button" className={button} onClick={() => select(order, 'completed')}>{t.complete}</button>}
                        {order.status === 'refund_pending' && <button type="button" className={button} onClick={() => select(order, 'sync')}>{t.sync}</button>}
                    </div>
                </div>
            </div>
        </article>)}
        {data && <div className="flex items-center justify-center gap-4 text-xs text-white/50"><button className={button} disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}>{t.previous}</button><span>{page} / {data.total_pages} · {data.total}</span><button className={button} disabled={page >= data.total_pages || loading} onClick={() => setPage(value => value + 1)}>{t.next}</button></div>}
        {selection && <OrderActionDialog key={`${selection.order.id}:${selection.action}`} current={current} selection={selection} onClose={() => setSelection(null)} onSaved={() => { setSelection(null); setReload(value => value + 1) }} />}
        <Skin3DModal isOpen={!!preview} textureUrl={preview} current={current} onClose={() => setPreview(null)} />
    </>
}

function OrderActionDialog({ current, selection: { order, action }, onClose, onSaved }: { current: LangData; selection: Selection; onClose: () => void; onSaved: () => void }) {
    const t = current.figureManagement
    const dialog = useRef<HTMLDialogElement>(null)
    const inFlight = useRef(false)
    const abort = useRef<AbortController | null>(null)
    const [saving, setSaving] = useState(false)
    const [checked, setChecked] = useState(false)
    const [text, setText] = useState('')
    const [error, setError] = useState('')
    useEffect(() => { dialog.current?.showModal(); return () => abort.current?.abort() }, [])
    const title = { approve: t.approve, reject: t.reject, printing: t.start, shipping: t.ship, completed: t.complete, sync: t.sync }[action]
    const hint = { approve: t.approveHint, reject: t.rejectHint, printing: t.startHint, shipping: t.shippingHint, completed: t.completeHint, sync: '' }[action]
    const submit = async () => {
        if (inFlight.current || (action === 'approve' && !checked) || (['reject', 'shipping'].includes(action) && !text.trim())) return
        inFlight.current = true; setSaving(true); setError('')
        const session = getAuthSessionKey()
        const controller = new AbortController(); abort.current = controller
        const path = action === 'sync' ? 'refund/sync' : ['approve', 'reject'].includes(action) ? 'review' : 'fulfillment'
        const body = path === 'review' ? { decision: action, reason: text.trim() } : path === 'fulfillment' ? { stage: action, tracking_number: action === 'shipping' ? text.trim() : undefined } : undefined
        try {
            const response = await apiFetch(`/api/figure/orders/${encodeURIComponent(order.id)}/${path}`, { method: 'POST', body: body ? JSON.stringify(body) : undefined, auth: 'required', signal: controller.signal, skipGlobalError: true })
            const result = await apiResponseJson(response)
            if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : t.actionFailed)
            if (!controller.signal.aborted && session === getAuthSessionKey()) onSaved()
        } catch (error) {
            if (!controller.signal.aborted && session === getAuthSessionKey()) setError(error instanceof Error ? error.message : t.actionFailed)
        } finally {
            if (!controller.signal.aborted && session === getAuthSessionKey()) { inFlight.current = false; setSaving(false) }
        }
    }
    return createPortal(<dialog ref={dialog} aria-labelledby="figure-action-title" onCancel={event => { event.preventDefault(); if (!saving) onClose() }} className={`m-auto w-[calc(100%-2rem)] max-w-lg border border-white/20 bg-[#151915] p-6 text-white backdrop:bg-black/70 ${current.fontClass}`}>
        <h2 id="figure-action-title" className="m-0 text-lg">{title}</h2><p className="text-xs text-white/45">#{order.id} · ${order.total_price.toFixed(2)}</p><p className="text-sm leading-relaxed text-white/70">{hint}</p>
        <form onSubmit={event => { event.preventDefault(); void submit() }} className="space-y-4">
            {action === 'approve' && <label className="flex items-start gap-3 text-sm"><input type="checkbox" required checked={checked} disabled={saving} onChange={event => setChecked(event.target.checked)} className="mt-1 accent-[#84c96b]" />{t.approveCheck}</label>}
            {['reject', 'shipping'].includes(action) && <label className="block text-sm">{action === 'reject' ? t.reason : t.tracking}<textarea required value={text} disabled={saving} maxLength={action === 'reject' ? 2000 : 200} rows={action === 'reject' ? 4 : 2} onChange={event => setText(event.target.value)} placeholder={action === 'reject' ? t.reasonPlaceholder : undefined} className={`${field} mt-2`} /></label>}
            {error && <p role="alert" className="text-xs text-red-200">{error}</p>}
            <div className="flex justify-end gap-2"><button type="button" disabled={saving} className={button} onClick={onClose}>{t.cancel}</button><button type="submit" disabled={saving || (action === 'approve' && !checked) || (['reject', 'shipping'].includes(action) && !text.trim())} className={`${button} ${action === 'reject' ? 'bg-red-900/50' : 'bg-[#3c8527]'}`}>{saving ? t.saving : t.confirm}</button></div>
        </form>
    </dialog>, document.body)
}
