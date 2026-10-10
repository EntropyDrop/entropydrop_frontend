import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import type { LangData } from '../../../constants/lang'
import { AddressManager } from '../../../components/AddressManager'
import { useAuthSession } from '../../../hooks/useAuthSession'
import { apiFetch, apiResponseJson } from '../../../utils/api'
import { getAuthSessionKey } from '../../../utils/authSession'
import { waitForAuthReady } from '../../../utils/authClient'
import type { FigureSkinSource } from './figureSource'
import type { FigureModel } from './figureModels'
import type { KitSpecifications } from './kitSpecifications'
import { KitSpecificationsDetails } from './KitSpecificationsDetails'
import { validateAddress } from '../../../constants/shippingAddress'

const GoogleSignInButton = lazy(() => import('../../../components/GoogleSignInButton').then(m => ({ default: m.GoogleSignInButton })))
const buttonClass = 'border border-white/20 px-4 py-2 text-xs hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer'

interface Address { id: string; recipient_name: string; country: string; phone: string; zip_code: string; state: string; city: string; detail_address: string; is_default: boolean }
interface Stock { model_type: string; available: boolean; price: number; stock?: number; kit_specifications?: KitSpecifications | null }
interface Props { current: LangData; source: FigureSkinSource; model: FigureModel; onClose: () => void }

export function FigureCommissionDialog(props: Props) {
    const session = useAuthSession()
    const [initialSession] = useState(session)
    const { onClose } = props
    useEffect(() => { if (session !== initialSession) onClose() }, [session, initialSession, onClose])
    if (session !== initialSession) return null
    return <CommissionSession {...props} session={session} />
}

function CommissionSession({ current, source, model, onClose, session }: Props & { session: string | null }) {
    const t = current.figurePrint.commissionOrder
    const navigate = useNavigate()
    const dialog = useRef<HTMLDialogElement>(null)
    const pending = useRef<AbortController | null>(null)
    const submitting = useRef(false)
    const [stock, setStock] = useState<Stock | null>(null)
    const [address, setAddress] = useState<Address | null>(null)
    const [addressOpen, setAddressOpen] = useState(false)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [loggingIn, setLoggingIn] = useState(false)
    const [error, setError] = useState('')
    const [retry, setRetry] = useState(0)
    const [quantity, setQuantity] = useState(1)
    const maxQuantity = Math.min(10, Math.max(0, stock?.stock ?? 10))
    const available = !!stock?.available && !!stock.kit_specifications && quantity <= maxQuantity
    const addressValid = !!address && Object.keys(validateAddress(address)).length === 0

    useEffect(() => {
        const element = dialog.current!
        element.showModal()
        return () => { element.close(); pending.current?.abort() }
    }, [])

    useEffect(() => {
        const controller = new AbortController()
        async function load() {
            setLoading(true)
            setError('')
            setStock(null)
            try {
                await waitForAuthReady()
                if (controller.signal.aborted || session !== getAuthSessionKey()) return
                const options = { signal: controller.signal, skipGlobalError: true }
                const [stockResponse, addressResponse] = await Promise.all([
                    apiFetch('/api/orders/model-stock?order_type=print', options),
                    session ? apiFetch('/api/addresses', { ...options, auth: 'required' }) : Promise.resolve(null),
                ])
                if (!stockResponse.ok || (addressResponse && !addressResponse.ok)) throw new Error(t.failed)
                const [models, addresses]: [Stock[], Address[]] = await Promise.all([
                    apiResponseJson(stockResponse), addressResponse ? apiResponseJson(addressResponse) : Promise.resolve([]),
                ])
                if (controller.signal.aborted || session !== getAuthSessionKey()) return
                // Never substitute an older model's price or stock for the Cute kit.
                const kit = models.find(item => item.model_type === model.orderModelType)
                setStock(kit && Number.isFinite(kit.price) && kit.price > 0 ? kit : null)
                setAddress(addresses.find(item => item.is_default) || addresses[0] || null)
            } catch {
                if (!controller.signal.aborted && session === getAuthSessionKey()) setError(t.failed)
            } finally { if (!controller.signal.aborted) setLoading(false) }
        }
        void load()
        return () => controller.abort()
    }, [session, retry, t.failed, model.orderModelType])

    async function login({ credential }: { credential?: string }) {
        if (!credential || loggingIn) return
        const controller = new AbortController()
        pending.current = controller
        setLoggingIn(true)
        setError('')
        try {
            const response = await apiFetch('/api/auth/google', { method: 'POST', signal: controller.signal, skipGlobalError: true, body: JSON.stringify({ token: credential }) })
            if (!response.ok) throw new Error(t.loginFailed)
            const data = await apiResponseJson(response)
            if (controller.signal.aborted || session !== getAuthSessionKey()) return
            if (typeof data.access_token !== 'string' || !data.access_token) throw new Error(t.loginFailed)
            localStorage.setItem('token', data.access_token)
            window.dispatchEvent(new Event('auth-token-updated'))
            onClose()
        } catch { if (!controller.signal.aborted) setError(t.loginFailed) }
        finally { if (!controller.signal.aborted) setLoggingIn(false) }
    }

    async function order() {
        if (submitting.current || !session || session !== getAuthSessionKey() || !address || !addressValid || !available || loading) return
        submitting.current = true
        setSaving(true)
        setError('')
        const controller = new AbortController()
        pending.current = controller
        try {
            const response = await apiFetch('/api/orders', {
                method: 'POST', auth: 'required', signal: controller.signal, skipGlobalError: true,
                body: JSON.stringify({ order_type: 'print', log_id: source.id, model_type: model.orderModelType, address_id: address.id, quantity, sticker_language: current.lang }),
            })
            if (!response.ok) {
                const data = await apiResponseJson(response)
                throw new Error(data.detail === 'Kit specifications are unavailable' ? t.specificationsUnavailable
                    : data.detail === 'Item limit for unpaid orders reached' ? t.limitReached
                    : data.detail === 'This model is sold out' || data.detail === 'Insufficient stock for this quantity' ? t.unavailable
                    : t.createFailed)
            }
            if (controller.signal.aborted || session !== getAuthSessionKey()) return
            onClose()
            navigate('/skin/orders')
        } catch (error) { if (!controller.signal.aborted && session === getAuthSessionKey()) setError(error instanceof Error ? error.message : t.createFailed) }
        finally { submitting.current = false; if (!controller.signal.aborted) setSaving(false) }
    }

    return createPortal(<dialog ref={dialog} aria-labelledby="commission-title" onCancel={event => { event.preventDefault(); if (!saving) onClose() }} className={`fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-full max-w-md overflow-hidden border-l border-white/15 bg-[#131713] p-0 text-white shadow-2xl backdrop:bg-black/50 ${current.fontClass}`}>
        <div className="flex h-full min-h-0 flex-col">
            <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 px-6 py-4">
                <h2 id="commission-title" className="m-0 text-xl">{t.title}</h2>
                <button type="button" disabled={saving} onClick={onClose} className={`${buttonClass} shrink-0`}>{current.modal.cancel}</button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 space-y-5">
                <div><h3 className="m-0 mb-2 text-lg">{source.name || current.figurePrint.unnamedSkin}</h3><p className="m-0 text-xs text-white/50">{current.figurePrint.publisher}: {source.publisher || current.figurePrint.unknownPublisher}</p></div>
                {loading ? <p role="status" className="text-sm">{t.loading}</p> : <>
                    {stock && <p className="flex justify-between text-sm"><span>{t.price}</span><strong>${stock.price.toFixed(2)}</strong></p>}
                    {!available && !error && <p role="status" className="text-sm text-amber-200">{stock?.available && !stock.kit_specifications ? t.specificationsUnavailable : t.unavailable}</p>}
                </>}
                <div className="flex items-center justify-between gap-4 text-sm">
                    <label htmlFor="figure-kit-quantity">{t.quantity}</label>
                    <select id="figure-kit-quantity" value={quantity} disabled={loading || saving || !stock?.available} onChange={event => setQuantity(Number(event.target.value))} className="border border-white/20 bg-[#131713] px-3 py-2 text-white disabled:opacity-40">
                        {Array.from({ length: Math.max(maxQuantity, quantity, 1) }, (_, i) => i + 1).map(value => <option key={value} value={value} disabled={value > maxQuantity}>{value}</option>)}
                    </select>
                </div>
                {stock && <p className="flex justify-between text-sm"><span>{t.total}</span><strong>${(stock.price * quantity).toFixed(2)}</strong></p>}
                {stock?.kit_specifications && <section className="border border-white/10 p-4"><KitSpecificationsDetails specifications={stock.kit_specifications} skinId={source.id} current={current} /></section>}
                <p className="text-xs leading-relaxed text-white/65">{t.approval}</p>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm"><dt className="text-white/50">{t.shipping}</dt><dd className="m-0 text-right">{t.freeShipping}</dd><dt className="text-white/50">{t.production}</dt><dd className="m-0 text-right">{t.productionTime}</dd><dt className="text-white/50">{t.delivery}</dt><dd className="m-0 text-right">{t.deliveryTime}</dd></dl>
            </div>
            <footer className="shrink-0 space-y-3 border-t border-white/10 px-6 py-4">
                {!session ? <div className="space-y-3"><p className="text-sm">{t.signIn}</p><p className="text-xs text-white/50">{current.figurePrint.loginForCommission}</p>{loggingIn ? <p role="status">{current.figurePrint.loggingIn}</p> : <Suspense fallback={<p>{current.figurePrint.loggingIn}</p>}><GoogleSignInButton onSuccess={login} onError={() => setError(t.loginFailed)} locale={current.lang} /></Suspense>}</div> : <>
                    <section className="border border-white/10 p-4"><div className="flex justify-between gap-3 text-sm"><span>{t.shipTo}</span><button type="button" disabled={saving || loading} onClick={() => setAddressOpen(true)} className="cursor-pointer text-[#84c96b] hover:underline">{t.change}</button></div><p className="mb-0 max-h-20 overflow-y-auto break-words text-xs leading-relaxed text-white/65">{address ? <>{address.recipient_name && <>{address.recipient_name}<br /></>}{`${address.country} · ${address.state} ${address.city} ${address.detail_address} ${address.zip_code}`}</> : t.noAddress}</p>
                        {address && !addressValid && <p role="status" className="mb-0 text-xs text-amber-200">{current.address.completeAddress}</p>}
                    </section>
                    <button type="button" disabled={loading || saving || !available || !addressValid} onClick={order} className={`${buttonClass} w-full bg-[#3c8527] hover:bg-[#4ea632]`}>{saving ? t.submitting : t.checkout}</button>
                </>}
                {error && <div role="alert" className="space-y-3 text-xs text-red-200"><p>{error}</p><button type="button" disabled={saving} onClick={() => setRetry(value => value + 1)} className={buttonClass}>{current.figurePrint.retry}</button></div>}
            </footer>
        </div>
        <AddressManager isOpen={addressOpen} current={current} onClose={() => setAddressOpen(false)}
            onSelect={selected => { setAddress(selected); setAddressOpen(false) }}
            onUpdate={updated => setAddress(selected => selected?.id === updated.id ? updated : selected)}
            onDelete={id => setAddress(selected => selected?.id === id ? null : selected)} />
    </dialog>, document.body)
}
