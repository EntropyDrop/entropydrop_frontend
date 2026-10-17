import { useEffect, useRef, useState } from 'react'
import type { LangData } from '../../constants/lang'
import { apiFetch, apiResponseJson } from '../../utils/api'
import { getAuthSessionKey } from '../../utils/authSession'
import { creatorError } from '../../hooks/useCreatorQuote'
import { creatorPortalError } from '../creator/creatorPortal'
import { CreatorPayoutAdmin } from '../creator/CreatorPayoutAdmin'

interface CodeSettings {
    code: string; creator_email: string | null; creator_user_id: string | null; discount_bps: number; commission_bps: number; active: boolean; expires_at: string | null; version: number
    attributed_orders: number; acquired_users: number; paid_sales: number; pending_commission: number; eligible_commission: number
}
const button = 'border border-white/20 px-3 py-2 text-xs hover:bg-white/10 disabled:opacity-40 cursor-pointer'
const input = 'w-full border border-white/20 bg-black/20 px-3 py-2 text-sm text-white'

export function CreatorCodeSettings({ current }: { current: LangData }) {
    const t = current.creatorCodes
    const [section, setSection] = useState<'codes' | 'payouts'>('codes')
    const [codes, setCodes] = useState<CodeSettings[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [reload, setReload] = useState(0)
    const [editing, setEditing] = useState<CodeSettings | null>(null)
    const [generation, setGeneration] = useState(0)
    useEffect(() => {
        const controller = new AbortController()
        void (async () => {
            setLoading(true); setError('')
            try {
                const response = await apiFetch('/api/creators/manage', { auth: 'required', signal: controller.signal, skipGlobalError: true })
                if (!response.ok) throw new Error(t.failed)
                const data = await apiResponseJson(response)
                if (!controller.signal.aborted) setCodes(data)
            } catch { if (!controller.signal.aborted) setError(t.failed) }
            finally { if (!controller.signal.aborted) setLoading(false) }
        })()
        return () => controller.abort()
    }, [reload, t.failed])
    return <><nav className="flex flex-wrap gap-2 mb-4" aria-label={t.management}><button type="button" className={button} aria-pressed={section === 'codes'} onClick={() => setSection('codes')}>{current.creatorPortal.myCodes}</button><button type="button" className={button} aria-pressed={section === 'payouts'} onClick={() => setSection('payouts')}>{current.creatorPortal.adminTitle}</button></nav>{section === 'payouts' ? <CreatorPayoutAdmin current={current} /> : <div className="space-y-5">
        <p className="m-0 text-xs leading-relaxed text-white/60">{t.managementHint}</p>
        <CreatorSettingsForm key={`${editing?.code || 'new'}:${generation}`} current={current} record={editing}
            onSaved={() => { setEditing(null); setGeneration(value => value + 1); setReload(value => value + 1) }} />
        {editing && <button type="button" className={button} onClick={() => { setEditing(null); setGeneration(value => value + 1) }}>{t.newCode}</button>}
        <button type="button" className={button} disabled={loading} onClick={() => setReload(value => value + 1)}>{current.figureManagement.refresh}</button>
        {error && <p role="alert" className="text-xs text-red-200">{error}</p>}
        {loading && <p role="status" className="text-xs text-white/60">{current.orders.loading}</p>}
        {!loading && codes.length === 0 && <p className="text-xs text-white/50">{t.empty}</p>}
        {codes.map(code => <article key={code.code} className="space-y-3 border border-white/10 p-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-3"><strong>{code.creator_email || current.creatorPortal.unbound} · {code.code}</strong><button type="button" className={button} onClick={() => { setEditing(code); setGeneration(value => value + 1) }}>{current.nav.edit}</button></div>
            <p className="m-0 text-white/60">{code.active ? t.active : t.inactive} · {t.discountRate}: {code.discount_bps / 100}% · {t.commissionRate}: {code.commission_bps / 100}%{code.expires_at && <> · {t.expiry}: {new Date(code.expires_at).toLocaleString(current.lang)}</>}</p>
            <label className="block text-white/60">{t.link}<input readOnly value={`${window.location.origin}/figure/3dprint?ref=${encodeURIComponent(code.code)}`} onFocus={event => event.target.select()} className={`${input} mt-2 text-xs`} /></label>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">{[
                [t.acquired, code.acquired_users], [t.orders, code.attributed_orders], [t.sales, `$${code.paid_sales.toFixed(2)}`],
                [t.pendingCommission, `$${code.pending_commission.toFixed(2)}`], [t.eligibleCommission, `$${code.eligible_commission.toFixed(2)}`],
            ].map(([label, value]) => <div key={label}><dt className="text-white/45">{label}</dt><dd className="m-0 mt-1">{value}</dd></div>)}</dl>
        </article>)}
    </div>}</>
}

function CreatorSettingsForm({ current, record, onSaved }: { current: LangData; record: CodeSettings | null; onSaved: () => void }) {
    const t = current.creatorCodes
    const [code, setCode] = useState(record?.code || '')
    const [email, setEmail] = useState(record?.creator_email || '')
    const [discount, setDiscount] = useState(record ? String(record.discount_bps / 100) : '')
    const [commission, setCommission] = useState(record ? String(record.commission_bps / 100) : '')
    const [active, setActive] = useState(record?.active ?? true)
    const [expires, setExpires] = useState(record?.expires_at ? new Date(new Date(record.expires_at).getTime() - new Date(record.expires_at).getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const pending = useRef<AbortController | null>(null)
    useEffect(() => () => pending.current?.abort(), [])
    const save = async (event: React.FormEvent) => {
        event.preventDefault()
        if (pending.current) return
        const normalized = code.trim().toUpperCase()
        const rates = [discount, commission].map(value => /^\d+(\.\d{1,2})?$/.test(value) ? Math.round(Number(value) * 100) : NaN)
        if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(normalized) || !email.trim() || !rates.every(Number.isInteger) || rates[0] > 9900 || rates[1] > 10000) { setError(t.invalidSettings); return }
        const controller = new AbortController()
        const session = getAuthSessionKey()
        pending.current = controller; setSaving(true); setError('')
        try {
            const response = await apiFetch(`/api/creators/manage/${encodeURIComponent(normalized)}`, { method: 'PUT', auth: 'required', signal: controller.signal, skipGlobalError: true,
                body: JSON.stringify({ creator_email: email.trim().toLowerCase(), discount_bps: rates[0], commission_bps: rates[1], active,
                    expires_at: expires ? new Date(expires).toISOString() : null, expected_version: record?.version }) })
            const data = await apiResponseJson(response)
            if (controller.signal.aborted || session !== getAuthSessionKey()) return
            if (!response.ok) throw new Error(data.detail === 'creator_code_exists' ? t.exists : ['creator_user_not_found', 'creator_owner_locked'].includes(data.detail) ? creatorPortalError(data.detail, current) : creatorError(data.detail, current))
            onSaved()
        } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : t.failed) }
        finally { if (!controller.signal.aborted) { pending.current = null; setSaving(false) } }
    }
    return <form onSubmit={save} className="space-y-3 border border-white/15 p-4">
        <h3 className="m-0 text-sm">{record ? t.editCode : t.newCode}</h3>
        <fieldset disabled={saving} className="m-0 grid gap-3 border-none p-0 sm:grid-cols-2">
            <label className="space-y-1 text-xs">{t.label}<input className={input} value={code} onChange={event => setCode(event.target.value)} disabled={!!record} maxLength={32} required /></label>
            <label className="space-y-1 text-xs">{t.creatorEmail}<input type="email" className={input} value={email} disabled={!!record?.creator_user_id} onChange={event => setEmail(event.target.value)} maxLength={100} required /></label>
            <label className="space-y-1 text-xs">{t.discountRate} (%)<input className={input} type="number" min="0" max="99" step="0.01" value={discount} onChange={event => setDiscount(event.target.value)} required /></label>
            <label className="space-y-1 text-xs">{t.commissionRate} (%)<input className={input} type="number" min="0" max="100" step="0.01" value={commission} onChange={event => setCommission(event.target.value)} required /></label>
            <label className="space-y-1 text-xs">{t.expiry}<input className={input} type="datetime-local" value={expires} onChange={event => setExpires(event.target.value)} /></label>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} />{t.active}</label>
        </fieldset>
        {error && <p role="alert" className="text-xs text-red-200">{error}</p>}
        <button type="submit" disabled={saving} className={button}>{saving ? t.applying : t.save}</button>
    </form>
}
