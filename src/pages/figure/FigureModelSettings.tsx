import { useEffect, useRef, useState } from 'react'
import type { LangData } from '../../constants/lang'
import { apiFetch, apiResponseJson } from '../../utils/api'
import { getAuthSessionKey } from '../../utils/authSession'
import { getFigureModelName } from './print/figureModels'

interface FigureModel {
    id: string
    model_type: string
    stock: number
    price: number
    product_name: string | null
}

const button = 'inline-flex min-h-9 items-center justify-center border border-white/15 bg-white/5 px-3 py-2 text-xs hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer'
const field = 'mt-2 w-full min-w-0 border border-white/20 bg-[#101510] px-3 py-2 text-sm text-white outline-none focus:border-[#84c96b] disabled:opacity-40'

export function FigureModelSettings({ current }: { current: LangData }) {
    const t = current.figureManagement.models
    const [models, setModels] = useState<FigureModel[] | null>(null)
    const [reload, setReload] = useState(0)
    const [error, setError] = useState('')
    const [savingId, setSavingId] = useState<string | null>(null)
    useEffect(() => {
        const controller = new AbortController()
        const session = getAuthSessionKey()
        void (async () => {
            try {
                const response = await apiFetch('/api/figure/models', { signal: controller.signal, auth: 'required', skipGlobalError: true })
                if (!response.ok) throw new Error(response.status === 403 ? current.figureManagement.restricted : t.loadFailed)
                const result: FigureModel[] = await apiResponseJson(response)
                if (!controller.signal.aborted && session === getAuthSessionKey()) setModels(result)
            } catch (error) {
                if (!controller.signal.aborted && session === getAuthSessionKey()) setError(error instanceof Error ? error.message : t.loadFailed)
            }
        })()
        return () => controller.abort()
    }, [reload, t, current.figureManagement.restricted])

    return <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
            <div><h2 className="m-0 text-base">{t.title}</h2><p className="mb-0 max-w-2xl text-xs leading-relaxed text-white/55">{t.hint}</p></div>
            <button type="button" className={`${button} shrink-0`} disabled={savingId !== null || (!models && !error)} onClick={() => { setModels(null); setError(''); setReload(value => value + 1) }}>{current.figureManagement.refresh}</button>
        </div>
        {error && <p role="alert" className="text-sm text-red-200">{error}</p>}
        {!models && !error && <p role="status" className="text-sm text-white/50">{t.loading}</p>}
        {models?.length === 0 && <p className="py-12 text-center text-sm text-white/45">{t.empty}</p>}
        {models?.map(model => <ModelSettingsRow key={`${reload}:${model.id}`} model={model} current={current} busy={savingId !== null} onSaving={saving => setSavingId(saving ? model.id : null)} />)}
    </div>
}

function ModelSettingsRow({ model, current, busy, onSaving }: { model: FigureModel; current: LangData; busy: boolean; onSaving: (saving: boolean) => void }) {
    const t = current.figureManagement.models
    const [saved, setSaved] = useState(model)
    const [stock, setStock] = useState(String(model.stock))
    const [price, setPrice] = useState(String(model.price))
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState(false)
    const [needsRefresh, setNeedsRefresh] = useState(false)
    const inFlight = useRef(false)
    const abort = useRef<AbortController | null>(null)
    useEffect(() => () => abort.current?.abort(), [])
    const stockValid = /^\d+$/.test(stock) && Number(stock) <= 2147483647
    const priceValid = /^\d+(\.\d{1,2})?$/.test(price) && Number(price) > 0 && Number(price) <= 999999.99
    const dirty = stock !== String(saved.stock) || price !== String(saved.price)
    const submit = async () => {
        if (inFlight.current || busy || needsRefresh || !dirty || !stockValid || !priceValid) return
        inFlight.current = true; setSaving(true); onSaving(true); setError(''); setSuccess(false)
        const controller = new AbortController(); abort.current = controller
        const session = getAuthSessionKey()
        try {
            const response = await apiFetch(`/api/figure/models/${encodeURIComponent(model.id)}`, {
                method: 'PATCH', auth: 'required', signal: controller.signal, skipGlobalError: true,
                body: JSON.stringify({ stock: Number(stock), price: Number(price), expected_stock: saved.stock, expected_price: saved.price }),
            })
            if (!response.ok) throw new Error(response.status === 409 ? t.conflict : response.status === 403 ? current.figureManagement.restricted : t.saveFailed)
            const result: FigureModel = await apiResponseJson(response)
            if (!controller.signal.aborted && session === getAuthSessionKey()) {
                setSaved(result); setStock(String(result.stock)); setPrice(String(result.price)); setSuccess(true)
            }
        } catch (error) {
            if (!controller.signal.aborted && session === getAuthSessionKey()) {
                setError(error instanceof Error ? error.message : t.saveFailed)
                setNeedsRefresh(true)
            }
        } finally {
            if (!controller.signal.aborted && session === getAuthSessionKey()) { inFlight.current = false; setSaving(false); onSaving(false) }
        }
    }
    const reset = () => { setStock(String(saved.stock)); setPrice(String(saved.price)); setSuccess(false) }
    return <form aria-label={`${t.title}: ${model.model_type}`} onSubmit={event => { event.preventDefault(); void submit() }} className="border border-white/10 bg-black/15 p-4 sm:p-5">
        <div className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(180px,1fr)_minmax(140px,180px)_minmax(140px,180px)_auto]">
            <div className="self-center"><h3 className="m-0 break-words text-sm">{model.product_name || getFigureModelName(model.model_type)}</h3><p className="mb-0 break-all text-xs text-white/45">{t.modelType}: {model.model_type}</p></div>
            <label className="block text-xs text-white/65">{t.stock}<input name="stock" type="number" inputMode="numeric" required min="0" max="2147483647" step="1" disabled={busy || needsRefresh} value={stock} onChange={event => { setStock(event.target.value); setSuccess(false) }} aria-invalid={!stockValid} className={field} /></label>
            <label className="block text-xs text-white/65">{t.price}<input name="price" type="number" inputMode="decimal" required min="0.01" max="999999.99" step="0.01" disabled={busy || needsRefresh} value={price} onChange={event => { setPrice(event.target.value); setSuccess(false) }} aria-invalid={!priceValid} className={field} /></label>
            <div className="flex gap-2"><button type="button" disabled={busy || !dirty || needsRefresh} onClick={reset} className={button}>{t.reset}</button><button type="submit" disabled={busy || !dirty || !stockValid || !priceValid || needsRefresh} className={`${button} bg-[#3c8527] text-white`}>{saving ? current.figureManagement.saving : t.save}</button></div>
        </div>
        {!stockValid && <p role="alert" className="mb-0 text-xs text-red-200">{t.invalidStock}</p>}
        {!priceValid && <p role="alert" className="mb-0 text-xs text-red-200">{t.invalidPrice}</p>}
        {error && <p role="alert" className="mb-0 text-xs text-red-200">{error}</p>}
        {success && <p role="status" className="mb-0 text-xs text-[#a6df7a]">{t.saved}</p>}
    </form>
}
