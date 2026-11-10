import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { LangData } from '../../constants/lang'
import { getAuthSessionKey } from '../../utils/authSession'
import { apiFetch, apiResponseJson } from '../../utils/api'
import { CreatorPagination, PayoutCard } from './CreatorPayoutHistory'
import { creatorButton, creatorInput, creatorPortalError, dollars, parseDollars, useCreatorResource, type PageResult, type PayoutRecord } from './creatorPortal'

type Action = 'transfer' | 'reject'
// Requests waiting for a transfer. The PayPal-era statuses still reserve balance, so an administrator resolves them the same way.
const open = ['pending_review', 'processing', 'unclaimed', 'on_hold', 'manual_review']

export function CreatorPayoutAdmin({ current }: { current: LangData }) {
    const t = current.creatorPortal
    const [page, setPage] = useState(1)
    const [status, setStatus] = useState('pending_review')
    const [reload, setReload] = useState(0)
    const [selection, setSelection] = useState<{ payout: PayoutRecord; action: Action } | null>(null)
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)
    const request = useRef<AbortController | null>(null)
    const records = useCreatorResource<PageResult<PayoutRecord>>(`/api/creators/manage/payouts?page=${page}&page_size=20${status ? `&status=${status}` : ''}`, reload, current)
    const states: Record<string, string> = t.states
    useEffect(() => () => request.current?.abort(), [])
    const submit = async (payout: PayoutRecord, action: Action, body: Record<string, unknown>) => {
        if (request.current) return
        const controller = new AbortController(), session = getAuthSessionKey()
        request.current = controller; setBusy(true); setError(''); setSelection(null)
        try {
            const response = await apiFetch(`/api/creators/manage/payouts/${encodeURIComponent(payout.id)}/${action}`, {
                method: 'POST', auth: 'required', signal: controller.signal, skipGlobalError: true, body: JSON.stringify(body),
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
        <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs">{t.filter}<select value={status} disabled={busy} onChange={event => { setStatus(event.target.value); setPage(1) }} className={`${creatorInput} mt-2`}>
                <option value="">{t.all}</option>{Object.keys(states).filter(value => !['eligible', 'pending', 'excluded'].includes(value)).map(value => <option key={value} value={value}>{states[value]}</option>)}
            </select></label>
            <button type="button" className={creatorButton} disabled={records.loading || busy} onClick={() => setReload(value => value + 1)}>{current.figureManagement.refresh}</button>
        </div>
        {(error || records.error) && <p role="alert" className="text-xs text-red-200">{error || records.error}</p>}
        {records.loading && <p role="status" className="text-xs text-white/60">{current.orders.loading}</p>}
        {records.data?.items.length === 0 && <p className="text-xs text-white/50">{t.empty}</p>}
        {records.data?.items.map(payout => <PayoutCard key={payout.id} current={current} payout={payout}>{open.includes(payout.status) && <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className={creatorButton} disabled={busy} onClick={() => setSelection({ payout, action: 'reject' })}>{t.reject}</button>
            <button type="button" className={`${creatorButton} bg-[#3c8527]`} disabled={busy} onClick={() => setSelection({ payout, action: 'transfer' })}>{t.recordTransfer}</button>
        </div>}</PayoutCard>)}
        <CreatorPagination current={current} result={records.data} page={page} disabled={records.loading || busy} onChange={setPage} />
        {selection && <PayoutDialog current={current} selection={selection} onClose={() => setSelection(null)} onConfirm={body => void submit(selection.payout, selection.action, body)} />}
    </div>
}

function PayoutDialog({ current, selection, onClose, onConfirm }: { current: LangData; selection: { payout: PayoutRecord; action: Action }; onClose: () => void; onConfirm: (body: Record<string, unknown>) => void }) {
    const t = current.creatorPortal
    const { payout, action } = selection
    const transferring = action === 'transfer'
    const [reference, setReference] = useState('')
    const [fee, setFee] = useState('')
    const [note, setNote] = useState('')
    const [error, setError] = useState('')
    const feeCents = parseDollars(fee)
    const feeValid = feeCents !== null && feeCents < payout.amount_cents
    const submit = (event: React.FormEvent) => {
        event.preventDefault()
        if (!transferring) { if (note.trim()) onConfirm({ note: note.trim() }); return }
        if (!feeValid) { setError(t.feeInvalid); return }
        if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,99}$/.test(reference.trim())) { setError(t.referenceInvalid); return }
        onConfirm({ transfer_reference: reference.trim(), fee_cents: feeCents, note: note.trim() })
    }
    return createPortal(<div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4">
        <form role="dialog" aria-modal="true" aria-label={transferring ? t.recordTransfer : t.reject} onSubmit={submit} className={`w-full max-w-md space-y-4 border border-white/20 bg-[#151915] p-5 text-white ${current.fontClass}`}>
            <h3 className="m-0 text-base">{transferring ? t.recordTransfer : t.reject}</h3>
            <p className="m-0 break-all text-sm">{dollars(payout.amount_cents)} USD → {payout.payout_email}</p>
            {transferring && <>
                <label className="block space-y-2 text-xs">{t.transferReference}<input className={creatorInput} value={reference} maxLength={100} required autoComplete="off" onChange={event => setReference(event.target.value)} /></label>
                <label className="block space-y-2 text-xs">{t.feeAmount}<input className={creatorInput} inputMode="decimal" value={fee} required onChange={event => setFee(event.target.value)} /></label>
                <p className="m-0 text-sm text-[#a6df7a]">{t.creatorReceives}: {feeValid ? `${dollars(payout.amount_cents - feeCents)} USD` : '—'}</p>
                <p className="m-0 text-xs leading-relaxed text-amber-200">{t.recordHint}</p>
            </>}
            <label className="block space-y-2 text-xs">{t.reviewNote}<textarea className={creatorInput} value={note} maxLength={500} required={!transferring} onChange={event => setNote(event.target.value)} /></label>
            {error && <p role="alert" className="m-0 text-xs text-red-200">{error}</p>}
            <div className="flex justify-end gap-2"><button type="button" className={creatorButton} onClick={onClose}>{current.modal.cancel}</button><button type="submit" className={creatorButton}>{transferring ? t.recordTransfer : t.reject}</button></div>
        </form>
    </div>, document.body)
}
