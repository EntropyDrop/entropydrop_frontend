import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { LangData } from '../constants/lang'
import { PageContainer } from '../components/PageContainer'
import { ConfirmModal } from '../components/ConfirmModal'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { useAuthSession } from '../hooks/useAuthSession'
import { getAuthSessionKey } from '../utils/authSession'
import { apiFetch, apiResponseJson } from '../utils/api'
import { CreatorPagination, PayoutCard } from './creator/CreatorPayoutHistory'
import { creatorButton, creatorInput, creatorPortalError, dollars, useCreatorResource, type CreatorSummary, type PageResult, type PayoutRecord, type ReferredOrder, type ReferredUser } from './creator/creatorPortal'

type Tab = 'users' | 'orders' | 'payouts'
export function CreatorPage({ current }: { current: LangData }) {
    const { user } = useCurrentUser()
    const session = useAuthSession()
    return <PageContainer bg="bg-[#151915]" className={current.fontClass}>
        <header><h1 className="m-0 text-xl">{current.creatorPortal.title}</h1><p className="mb-0 text-xs leading-relaxed text-white/60">{current.creatorPortal.subtitle}</p></header>
        {user?.is_creator && session ? <CreatorDashboard key={session} current={current} email={user.email} /> : <p role="status" className="text-sm text-white/60">{current.creatorPortal.restricted}</p>}
    </PageContainer>
}

export function CreatorDashboard({ current, email }: { current: LangData; email: string }) {
    const t = current.creatorPortal
    const [tab, setTab] = useState<Tab>('users')
    const [page, setPage] = useState(1)
    const [reload, setReload] = useState(0)
    const summary = useCreatorResource<CreatorSummary>('/api/creators/me', reload, current)
    const records = useCreatorResource<PageResult<ReferredUser | ReferredOrder | PayoutRecord>>(`/api/creators/me/${tab}?page=${page}&page_size=20`, reload, current)
    const refresh = () => setReload(value => value + 1)
    const states: Record<string, string> = t.states
    return <>
        <div><button type="button" className={creatorButton} disabled={summary.loading || records.loading} onClick={refresh}>{current.figureManagement.refresh}</button></div>
        {summary.error && <p role="alert" className="text-xs text-red-200">{summary.error}</p>}
        {summary.loading && <p role="status" className="text-xs text-white/60">{current.orders.loading}</p>}
        {summary.data && <>
            <dl className="m-0 grid grid-cols-2 gap-3 lg:grid-cols-4">{[
                [t.available, summary.data.balance.available_cents], [t.pending, summary.data.balance.pending_cents],
                [t.reserved, summary.data.balance.reserved_cents], [t.paid, summary.data.balance.paid_cents],
            ].map(([label, value]) => <div key={label} className="border border-white/15 p-4"><dt className="text-xs text-white/55">{label}</dt><dd className="m-0 mt-2 text-lg text-[#a6df7a]">{dollars(Number(value))}</dd></div>)}</dl>
            {!!summary.data.balance.adjustment_cents && <p className="m-0 text-xs text-amber-200">{t.adjustment.replace('{amount}', dollars(summary.data.balance.adjustment_cents))}</p>}
            <section className="space-y-3"><h2 className="m-0 text-sm">{t.myCodes}</h2>{summary.data.codes.map(code => <div key={code.code} className="space-y-2 border border-white/10 p-3 text-xs">
                <p className="m-0"><strong>{code.code}</strong> · {code.usable ? current.creatorCodes.active : current.creatorCodes.inactive} · {current.creatorCodes.discountRate}: {code.discount_percent}% · {current.creatorCodes.commissionRate}: {code.commission_percent}%</p>
            </div>)}</section>
            <WithdrawalForm current={current} email={email} available={summary.data.balance.available_cents} onSaved={() => { setTab('payouts'); setPage(1); refresh() }} />
        </>}
        <section className="space-y-4">
            <nav aria-label={t.records} className="flex flex-wrap gap-2">{(['users', 'orders', 'payouts'] as const).map(value => <button type="button" key={value} aria-pressed={tab === value} className={`${creatorButton} ${tab === value ? 'text-[#a6df7a] border-[#a6df7a]/60' : ''}`} onClick={() => { setTab(value); setPage(1) }}>{t[value]}</button>)}</nav>
            {tab !== 'payouts' && <p className="m-0 text-xs text-white/50">{t.privacy}</p>}
            {records.loading && <p role="status" className="text-xs text-white/60">{current.orders.loading}</p>}
            {records.error && <p role="alert" className="text-xs text-red-200">{records.error}</p>}
            {records.data?.items.length === 0 && <p className="py-4 text-xs text-white/50">{t.empty}</p>}
            {records.data?.items.map(row => {
                if ('amount_cents' in row) return <PayoutCard key={row.id} current={current} payout={row} />
                return <article key={row.reference} className="space-y-2 border border-white/10 p-4 text-xs">
                    <div className="flex flex-wrap justify-between gap-2"><strong className="break-all">{row.reference}</strong><span className="text-white/50">{new Date('created_at' in row ? row.created_at : row.referred_at).toLocaleString(current.lang)}</span></div>
                    <p className="m-0 break-all text-white/65">{row.email} · {row.code}</p>
                    {'commission_cents' in row && <><p className="m-0 break-all text-white/45">{row.customer_reference}</p><div className="flex flex-wrap gap-4"><span>{t.productAmount}: {dollars(row.product_amount_cents)}</span><span>{t.commission}: {dollars(row.commission_cents)}</span><span>{states[row.status] || row.status}</span></div></>}
                </article>
            })}
            <CreatorPagination current={current} result={records.data} page={page} disabled={records.loading} onChange={setPage} />
        </section>
    </>
}

function WithdrawalForm({ current, email, available, onSaved }: { current: LangData; email: string; available: number; onSaved: () => void }) {
    const t = current.creatorPortal
    const [receiver, setReceiver] = useState(email)
    const [amount, setAmount] = useState('')
    const [error, setError] = useState('')
    const [confirm, setConfirm] = useState<{ cents: number; email: string } | null>(null)
    const [busy, setBusy] = useState(false)
    const request = useRef<AbortController | null>(null)
    const retryKey = useRef<{ selection: string; key: string } | null>(null)
    useEffect(() => () => request.current?.abort(), [])
    const prepare = (event: React.FormEvent) => {
        event.preventDefault()
        const parts = amount.trim().split('.')
        const cents = /^\d+(\.\d{1,2})?$/.test(amount.trim()) ? Number(parts[0]) * 100 + Number((parts[1] || '').padEnd(2, '0')) : NaN
        if (!Number.isSafeInteger(cents) || cents < 1 || cents > available || !receiver.trim()) { setError(t.invalidAmount); return }
        setError(''); setConfirm({ cents, email: receiver.trim().toLowerCase() })
    }
    const submit = async () => {
        if (request.current || !confirm) return
        const selection = JSON.stringify(confirm)
        if (retryKey.current?.selection !== selection) retryKey.current = { selection, key: crypto.randomUUID() }
        const controller = new AbortController(), session = getAuthSessionKey()
        request.current = controller; setBusy(true); setConfirm(null)
        try {
            const response = await apiFetch('/api/creators/me/payouts', { method: 'POST', auth: 'required', signal: controller.signal, skipGlobalError: true,
                body: JSON.stringify({ amount_cents: confirm.cents, paypal_email: confirm.email, request_key: retryKey.current.key }) })
            const data = await apiResponseJson(response)
            if (controller.signal.aborted || session !== getAuthSessionKey()) return
            if (!response.ok) throw new Error(creatorPortalError(data.detail, current))
            setAmount(''); retryKey.current = null; onSaved()
        } catch (error) { if (!controller.signal.aborted && session === getAuthSessionKey()) setError(error instanceof Error ? error.message : t.failed) }
        finally { if (!controller.signal.aborted) { request.current = null; setBusy(false) } }
    }
    return <form onSubmit={prepare} className="space-y-3 border border-white/15 p-4">
        <h2 className="m-0 text-sm">{t.request}</h2><p className="m-0 text-xs leading-relaxed text-white/55">{t.requestHint}</p>
        <fieldset disabled={busy} className="m-0 grid gap-3 border-none p-0 sm:grid-cols-2">
            <label className="space-y-1 text-xs">{t.paypalEmail}<input className={creatorInput} type="email" maxLength={127} value={receiver} required onChange={event => setReceiver(event.target.value)} /></label>
            <label className="space-y-1 text-xs">{t.amount}<input className={creatorInput} inputMode="decimal" value={amount} required onChange={event => setAmount(event.target.value)} /></label>
        </fieldset>
        {error && <p role="alert" className="m-0 text-xs text-red-200">{error}</p>}
        <button type="submit" disabled={busy || available < 1} className={creatorButton}>{busy ? current.creatorCodes.applying : t.request}</button>
        {confirm && createPortal(<ConfirmModal current={current} isOpen title={t.confirmRequest} message={t.confirmRequestBody.replace('{amount}', dollars(confirm.cents)).replace('{email}', confirm.email)} onClose={() => setConfirm(null)} onConfirm={() => void submit()} confirmText={t.submitRequest} />, document.body)}
    </form>
}
