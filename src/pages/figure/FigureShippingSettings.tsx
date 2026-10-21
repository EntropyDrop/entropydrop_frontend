import { useEffect, useRef, useState } from 'react'
import type { LangData } from '../../constants/lang'
import { apiFetch, apiResponseJson } from '../../utils/api'
import { getAuthSessionKey } from '../../utils/authSession'
import { figurePricingEvent } from '../../hooks/useFigureOffer'

interface Shipping { shipping_fee: number; version: number }
const button = 'min-h-9 border border-white/15 bg-white/5 px-3 py-2 text-xs hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer'

export function FigureShippingSettings({ current }: { current: LangData }) {
    const t = current.figureShipping
    const [saved, setSaved] = useState<Shipping | null>(null)
    const [fee, setFee] = useState('')
    const [reload, setReload] = useState(0)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState(false)
    const [needsRefresh, setNeedsRefresh] = useState(false)
    const request = useRef<AbortController | null>(null)
    const inFlight = useRef(false)
    useEffect(() => {
        const controller = new AbortController()
        const session = getAuthSessionKey()
        void (async () => {
            try {
                const response = await apiFetch('/api/figure/models/shipping', { auth: 'required', signal: controller.signal, skipGlobalError: true })
                if (!response.ok) throw new Error(response.status === 403 ? current.figureManagement.restricted : t.loadFailed)
                const data: Shipping = await apiResponseJson(response)
                if (!controller.signal.aborted && session === getAuthSessionKey()) { setSaved(data); setFee(data.shipping_fee.toFixed(2)); setNeedsRefresh(false) }
            } catch (error) {
                if (!controller.signal.aborted && session === getAuthSessionKey()) setError(error instanceof Error ? error.message : t.loadFailed)
            }
        })()
        return () => { controller.abort(); request.current?.abort() }
    }, [reload, t, current.figureManagement.restricted])
    const valid = /^\d+(\.\d{1,2})?$/.test(fee) && Number(fee) >= 0 && Number(fee) <= 999999.99
    const dirty = !!saved && Number(fee) !== saved.shipping_fee
    const save = async () => {
        if (!saved || !valid || !dirty || inFlight.current || needsRefresh) return
        inFlight.current = true; setBusy(true); setError(''); setSuccess(false)
        const controller = new AbortController(); request.current = controller
        const session = getAuthSessionKey()
        try {
            const response = await apiFetch('/api/figure/models/shipping', { method: 'PATCH', auth: 'required', signal: controller.signal, skipGlobalError: true,
                body: JSON.stringify({ shipping_fee: Number(fee), expected_version: saved.version }) })
            if (!response.ok) throw new Error(response.status === 409 ? t.changed : response.status === 403 ? current.figureManagement.restricted : t.saveFailed)
            const data: Shipping = await apiResponseJson(response)
            if (!controller.signal.aborted && session === getAuthSessionKey()) {
                setSaved(data); setFee(data.shipping_fee.toFixed(2)); setSuccess(true)
                window.dispatchEvent(new Event(figurePricingEvent))
            }
        } catch (error) {
            if (!controller.signal.aborted && session === getAuthSessionKey()) { setError(error instanceof Error ? error.message : t.saveFailed); setNeedsRefresh(true) }
        } finally {
            if (!controller.signal.aborted && session === getAuthSessionKey()) { inFlight.current = false; setBusy(false) }
        }
    }
    return <form aria-label={t.title} onSubmit={event => { event.preventDefault(); void save() }} className="space-y-4 border border-white/10 bg-black/15 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
            <div><h2 className="m-0 text-base">{t.title}</h2><p className="mb-0 max-w-2xl text-xs leading-relaxed text-white/55">{t.hint}</p></div>
            <button type="button" className={button} disabled={busy || (!saved && !error)} onClick={() => { setSaved(null); setError(''); setSuccess(false); setReload(value => value + 1) }}>{current.figureManagement.refresh}</button>
        </div>
        {!saved && !error && <p role="status" className="text-xs text-white/50">{t.loading}</p>}
        {saved && <div className="flex flex-wrap items-end gap-3">
            <label className="block text-xs text-white/65">{t.fee}<input name="shipping-fee" type="number" required min="0" max="999999.99" step="0.01" value={fee} disabled={busy || needsRefresh} aria-invalid={!valid} onChange={event => { setFee(event.target.value); setSuccess(false) }} className="mt-2 block w-48 border border-white/20 bg-[#101510] px-3 py-2 text-sm text-white disabled:opacity-40" /></label>
            <button type="submit" disabled={busy || needsRefresh || !valid || !dirty} className={`${button} !bg-[#3c8527] text-white`}>{busy ? current.figureManagement.saving : current.figureManagement.models.save}</button>
        </div>}
        {saved && !valid && <p role="alert" className="text-xs text-red-200">{t.invalid}</p>}
        {error && <p role="alert" className="text-xs text-red-200">{error}</p>}
        {success && <p role="status" className="text-xs text-[#a6df7a]">{t.saved}</p>}
    </form>
}
