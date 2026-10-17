import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { LangData } from '../../constants/lang'
import { getAuthSessionKey } from '../../utils/authSession'
import { apiFetch, apiResponseJson } from '../../utils/api'
import { CreatorPagination, PayoutCard } from './CreatorPayoutHistory'
import { creatorButton, creatorInput, creatorPortalError, dollars, useCreatorResource, type PageResult, type PayoutRecord } from './creatorPortal'

export function CreatorPayoutAdmin({ current }: { current: LangData }) {
    const t = current.creatorPortal
    const [page, setPage] = useState(1)
    const [status, setStatus] = useState('pending_review')
    const [reload, setReload] = useState(0)
    const [selection, setSelection] = useState<{ payout: PayoutRecord; action: 'approve' | 'reject' } | null>(null)
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)
    const request = useRef<AbortController | null>(null)
    const records = useCreatorResource<PageResult<PayoutRecord>>(`/api/creators/manage/payouts?page=${page}&page_size=20${status ? `&status=${status}` : ''}`, reload, current)
    const states: Record<string, string> = t.states
    useEffect(() => () => request.current?.abort(), [])
    const review = async (payout: PayoutRecord, action: 'approve' | 'reject' | 'sync', note = '') => {
        if (request.current) return
        const controller = new AbortController(), session = getAuthSessionKey()
        request.current = controller; setBusy(true); setError(''); setSelection(null)
        try {
            const response = await apiFetch(`/api/creators/manage/payouts/${encodeURIComponent(payout.id)}/review`, {
                method: 'POST', auth: 'required', signal: controller.signal, skipGlobalError: true, body: JSON.stringify({ action, note }),
            })
            const data = await apiResponseJson(response)
            if (controller.signal.aborted || session !== getAuthSessionKey()) return
            if (!response.ok) throw new Error(creatorPortalError(data.detail, current))
            setReload(value => value + 1)
        } catch (error) { if (!controller.signal.aborted && session === getAuthSessionKey()) { setError(error instanceof Error ? error.message : t.failed); setReload(value => value + 1) } }
        finally { if (!controller.signal.aborted) { request.current = null; setBusy(false) } }
    }
    return <div className="space-y-4">
        <h2 className="m-0 text-sm">{t.adminTitle}</h2>
        <p className="m-0 text-xs leading-relaxed text-white/60">{t.adminHint}</p>
        {records.data?.payouts_enabled === false && <p role="status" className="text-xs text-amber-200">{t.disabled}</p>}
        <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs">{t.filter}<select value={status} disabled={busy} onChange={event => { setStatus(event.target.value); setPage(1) }} className={`${creatorInput} mt-2`}>
                <option value="">{t.all}</option>{['pending_review', 'processing', 'unclaimed', 'on_hold', 'paid', 'rejected', 'failed', 'returned', 'manual_review'].map(value => <option key={value} value={value}>{states[value]}</option>)}
            </select></label>
            <button type="button" className={creatorButton} disabled={records.loading || busy} onClick={() => setReload(value => value + 1)}>{current.figureManagement.refresh}</button>
        </div>
        {(error || records.error) && <p role="alert" className="text-xs text-red-200">{error || records.error}</p>}
        {records.loading && <p role="status" className="text-xs text-white/60">{current.orders.loading}</p>}
        {records.data?.items.length === 0 && <p className="text-xs text-white/50">{t.empty}</p>}
        {records.data?.items.map(payout => <PayoutCard key={payout.id} current={current} payout={payout}><div className="flex flex-wrap justify-end gap-2">
            {payout.status === 'pending_review' ? <>
                <button type="button" className={creatorButton} disabled={busy} onClick={() => setSelection({ payout, action: 'reject' })}>{t.reject}</button>
                <button type="button" className={`${creatorButton} bg-[#3c8527]`} disabled={busy || !records.data?.payouts_enabled} onClick={() => setSelection({ payout, action: 'approve' })}>{t.approve}</button>
            </> : ['processing', 'unclaimed', 'on_hold', 'paid', 'manual_review'].includes(payout.status) && <button type="button" className={creatorButton} disabled={busy || !records.data?.payouts_enabled} onClick={() => void review(payout, 'sync')}>{t.sync}</button>}
        </div></PayoutCard>)}
        <CreatorPagination current={current} result={records.data} page={page} disabled={records.loading || busy} onChange={setPage} />
        {selection && <ReviewDialog current={current} selection={selection} onClose={() => setSelection(null)} onConfirm={note => void review(selection.payout, selection.action, note)} />}
    </div>
}

function ReviewDialog({ current, selection, onClose, onConfirm }: { current: LangData; selection: { payout: PayoutRecord; action: 'approve' | 'reject' }; onClose: () => void; onConfirm: (note: string) => void }) {
    const t = current.creatorPortal
    const [note, setNote] = useState('')
    const approving = selection.action === 'approve'
    return createPortal(<div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4">
        <form role="dialog" aria-modal="true" aria-label={approving ? t.approve : t.reject} onSubmit={event => { event.preventDefault(); if (approving || note.trim()) onConfirm(note.trim()) }} className={`w-full max-w-md space-y-4 border border-white/20 bg-[#151915] p-5 text-white ${current.fontClass}`}>
            <h3 className="m-0 text-base">{approving ? t.approve : t.reject}</h3>
            <p className="m-0 break-all text-sm">{dollars(selection.payout.amount_cents)} USD → {selection.payout.paypal_email}</p>
            {approving && <p className="m-0 text-xs leading-relaxed text-amber-200">{t.approveHint}</p>}
            <label className="block space-y-2 text-xs">{t.reviewNote}<textarea className={creatorInput} value={note} maxLength={500} required={!approving} onChange={event => setNote(event.target.value)} /></label>
            <div className="flex justify-end gap-2"><button type="button" className={creatorButton} onClick={onClose}>{current.modal.cancel}</button><button type="submit" className={creatorButton}>{approving ? t.approve : t.reject}</button></div>
        </form>
    </div>, document.body)
}
