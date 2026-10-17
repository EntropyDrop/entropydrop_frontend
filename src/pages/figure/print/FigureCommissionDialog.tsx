import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import type { LangData } from '../../../constants/lang'
import { AddressManager } from '../../../components/AddressManager'
import { useAuthSession } from '../../../hooks/useAuthSession'
import { useOrderPayment } from '../../../hooks/useOrderPayment'
import { apiFetch, apiResponseJson } from '../../../utils/api'
import { getAuthSessionKey } from '../../../utils/authSession'
import { waitForAuthReady } from '../../../utils/authClient'
import type { FigureSkinSource } from './figureSource'
import type { FigureModel } from './figureModels'
import type { KitSpecifications } from './kitSpecifications'
import { KitSpecificationsDetails } from './KitSpecificationsDetails'
import { validateAddress } from '../../../constants/shippingAddress'
import { googleLoginPayload } from '../../../utils/creatorReferral'
import { creatorError, useCreatorQuote } from '../../../hooks/useCreatorQuote'
import { CreatorCodeField } from '../../../components/CreatorCodeField'

const GoogleSignInButton = lazy(() => import('../../../components/GoogleSignInButton').then(m => ({ default: m.GoogleSignInButton })))
const buttonClass = 'border border-white/20 px-4 py-2 text-xs hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer'
const checkoutButtonClass = 'min-h-13 border border-white/20 px-5 py-3 text-base font-medium hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer'

interface Address { id: string; recipient_name: string; country: string; phone: string; zip_code: string; state: string; city: string; detail_address: string; is_default: boolean }
interface Stock { model_type: string; available: boolean; price: number; shipping_fee: number; stock?: number; kit_specifications?: KitSpecifications | null }
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
    const directOrder = useRef<{ selection: string; id: string } | null>(null)
    const [stock, setStock] = useState<Stock | null>(null)
    const [address, setAddress] = useState<Address | null>(null)
    const [shippingSource, setShippingSource] = useState<'paypal' | 'address_book'>('paypal')
    const [addressLoading, setAddressLoading] = useState(false)
    const [addressError, setAddressError] = useState(false)
    const [addressRetry, setAddressRetry] = useState(0)
    const [addressOpen, setAddressOpen] = useState(false)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [loggingIn, setLoggingIn] = useState(false)
    const [error, setError] = useState('')
    const [retry, setRetry] = useState(0)
    const [quantity, setQuantity] = useState(1)
    const creator = useCreatorQuote(session, model.orderModelType, quantity, current)
    const maxQuantity = Math.min(10, Math.max(0, stock?.stock ?? 10))
    const available = !!stock?.available && !!stock.kit_specifications && quantity <= maxQuantity
    const addressValid = !!address && Object.keys(validateAddress(address)).length === 0
    const shippingReady = shippingSource === 'paypal' || (!addressLoading && addressValid)
    const { pay, isProcessing } = useOrderPayment({
        authSession: session, current,
        onSuccess: orderId => {
            onClose()
            navigate(`/skin/orders?order=${encodeURIComponent(orderId)}`)
        },
        onError: setError,
    })
    const busy = saving || isProcessing
    const orderFields = { order_type: 'print', log_id: source.id, model_type: model.orderModelType, shipping_source: shippingSource, address_id: shippingSource === 'address_book' ? address?.id : undefined, quantity, sticker_language: current.lang,
        creator_code: creator.quote?.offer?.code || '', creator_offer_version: creator.quote?.offer?.version }

    async function createOrder(signal: AbortSignal, buyNow = false) {
        const response = await apiFetch('/api/orders', {
            method: 'POST', auth: 'required', signal, skipGlobalError: true,
            body: JSON.stringify({ ...orderFields, ...(buyNow ? { checkout_mode: 'buy_now' } : {}) }),
        })
        const data = await apiResponseJson(response)
        if (!response.ok) {
            if (typeof data.detail === 'string' && data.detail.startsWith('creator_')) throw new Error(creatorError(data.detail, current))
            throw new Error(data.detail === 'Kit specifications are unavailable' ? t.specificationsUnavailable
                : data.detail === 'Item limit for unpaid orders reached' ? t.limitReached
                : data.detail === 'This model is sold out' || data.detail === 'Insufficient stock for this quantity' ? t.unavailable
                : t.createFailed)
        }
        if (typeof data.id !== 'string' || !data.id) throw new Error(t.createFailed)
        return data.id
    }

    function buyNow() {
        if (submitting.current || busy || !session || session !== getAuthSessionKey() || !shippingReady || !available || loading || !creator.ready) return
        submitting.current = true
        setError('')
        const selection = JSON.stringify({ ...orderFields, address: shippingSource === 'address_book' ? address : null, unitPrice: stock?.price, shippingFee: stock?.shipping_fee })
        void pay(async signal => {
            // A cancelled checkout or uncertain capture resumes the same order.
            if (directOrder.current?.selection === selection) return directOrder.current.id
            const id = await createOrder(signal, true)
            if (!signal.aborted && session === getAuthSessionKey()) directOrder.current = { selection, id }
            return id
        }).finally(() => { submitting.current = false })
    }

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
                const stockResponse = await apiFetch('/api/orders/model-stock?order_type=print', options)
                if (!stockResponse.ok) throw new Error(t.failed)
                const models: Stock[] = await apiResponseJson(stockResponse)
                if (controller.signal.aborted || session !== getAuthSessionKey()) return
                // Never substitute an older model's price or stock for the Cute kit.
                const kit = models.find(item => item.model_type === model.orderModelType)
                setStock(kit && Number.isFinite(kit.price) && kit.price > 0 && Number.isFinite(kit.shipping_fee) && kit.shipping_fee >= 0 ? kit : null)
            } catch {
                if (!controller.signal.aborted && session === getAuthSessionKey()) setError(t.failed)
            } finally { if (!controller.signal.aborted) setLoading(false) }
        }
        void load()
        return () => controller.abort()
    }, [session, retry, t.failed, model.orderModelType])

    useEffect(() => {
        if (!session || shippingSource !== 'address_book') return
        const controller = new AbortController()
        async function loadAddresses() {
            setAddressLoading(true)
            setAddressError(false)
            try {
                const response = await apiFetch('/api/addresses', { signal: controller.signal, skipGlobalError: true, auth: 'required' })
                if (!response.ok) throw new Error('Could not load addresses')
                const addresses: Address[] = await apiResponseJson(response)
                if (controller.signal.aborted || session !== getAuthSessionKey()) return
                setAddress(selected => addresses.find(item => item.id === selected?.id) || addresses.find(item => item.is_default) || addresses[0] || null)
            } catch {
                if (!controller.signal.aborted && session === getAuthSessionKey()) setAddressError(true)
            } finally { if (!controller.signal.aborted) setAddressLoading(false) }
        }
        void loadAddresses()
        return () => controller.abort()
    }, [session, shippingSource, addressRetry])

    async function login({ credential }: { credential?: string }) {
        if (!credential || loggingIn) return
        const controller = new AbortController()
        pending.current = controller
        setLoggingIn(true)
        setError('')
        try {
            const response = await apiFetch('/api/auth/google', { method: 'POST', signal: controller.signal, skipGlobalError: true, body: JSON.stringify(googleLoginPayload(credential)) })
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
        if (submitting.current || busy || !session || session !== getAuthSessionKey() || !shippingReady || !available || loading || !creator.ready) return
        submitting.current = true
        setSaving(true)
        setError('')
        const controller = new AbortController()
        pending.current = controller
        try {
            await createOrder(controller.signal)
            if (controller.signal.aborted || session !== getAuthSessionKey()) return
            onClose()
            navigate('/skin/orders')
        } catch (error) { if (!controller.signal.aborted && session === getAuthSessionKey()) setError(error instanceof Error ? error.message : t.createFailed) }
        finally { submitting.current = false; if (!controller.signal.aborted) setSaving(false) }
    }

    return createPortal(<dialog ref={dialog} aria-labelledby="commission-title" onCancel={event => { event.preventDefault(); if (!busy) onClose() }} className={`fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-full max-w-md overflow-hidden border-l border-white/15 bg-[#131713] p-0 text-white shadow-2xl backdrop:bg-black/50 ${current.fontClass}`}>
        <div className="flex h-full min-h-0 flex-col">
            <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 px-6 py-4">
                <h2 id="commission-title" className="m-0 text-xl">{t.title}</h2>
                <button type="button" disabled={busy} onClick={onClose} className={`${buttonClass} shrink-0`}>{current.modal.cancel}</button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 space-y-5">
                <div><h3 className="m-0 mb-2 text-lg">{source.name || current.figurePrint.unnamedSkin}</h3><p className="m-0 text-xs text-white/50">{current.figurePrint.publisher}: {source.publisher || current.figurePrint.unknownPublisher}</p></div>
                {loading ? <p role="status" className="text-sm">{t.loading}</p> : <>
                    {stock && <p className="flex justify-between text-sm"><span>{t.price}</span><strong>${stock.price.toFixed(2)}</strong></p>}
                    {!available && !error && <p role="status" className="text-sm text-amber-200">{stock?.available && !stock.kit_specifications ? t.specificationsUnavailable : t.unavailable}</p>}
                </>}
                <div className="flex items-center justify-between gap-4 text-sm">
                    <label htmlFor="figure-kit-quantity">{t.quantity}</label>
                    <select id="figure-kit-quantity" value={quantity} disabled={loading || busy || !stock?.available} onChange={event => setQuantity(Number(event.target.value))} className="border border-white/20 bg-[#131713] px-3 py-2 text-white disabled:opacity-40">
                        {Array.from({ length: Math.max(maxQuantity, quantity, 1) }, (_, i) => i + 1).map(value => <option key={value} value={value} disabled={value > maxQuantity}>{value}</option>)}
                    </select>
                </div>
                {stock?.kit_specifications && <section className="border border-white/10 p-4"><KitSpecificationsDetails specifications={stock.kit_specifications} skinId={source.id} current={current} /></section>}
                {session && <>
                    <CreatorCodeField key={creator.quote?.offer?.code || ''} current={current} offer={creator.quote?.offer} busy={creator.busy} disabled={busy} error={creator.error} onApply={code => void creator.apply(code)} />
                    {!creator.ready && !creator.busy && <button type="button" onClick={() => void creator.retry()} className={buttonClass}>{current.figurePrint.retry}</button>}
                </>}
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <dt className="text-white/50">{t.shipping}</dt><dd className="m-0 text-right">{stock ? t.shippingPerOrder.replace('{amount}', stock.shipping_fee.toFixed(2)) : '—'}</dd>
                    {!!creator.quote?.discount_amount && <><dt>{current.creatorCodes.discount}</dt><dd className="m-0 text-right text-[#a6df7a]">−${creator.quote.discount_amount.toFixed(2)}</dd></>}
                    {stock && <><dt>{t.total}</dt><dd className="m-0 text-right"><strong>{session ? creator.quote ? `$${creator.quote.total_price.toFixed(2)}` : '—' : `$${(stock.price * quantity + stock.shipping_fee).toFixed(2)}`}</strong></dd></>}
                    <dt className="text-white/50">{t.production}</dt><dd className="m-0 text-right">{t.productionTime}</dd>
                    <dt className="text-white/50">{t.delivery}</dt><dd className="m-0 text-right">{t.deliveryTime}</dd>
                </dl>
            </div>
            <footer className="flex shrink-0 flex-col gap-5 border-t border-white/10 px-6 py-5">
                {!session ? <div className="space-y-3"><p className="text-sm">{t.signIn}</p><p className="text-xs text-white/50">{current.figurePrint.loginForCommission}</p>{loggingIn ? <p role="status">{current.figurePrint.loggingIn}</p> : <Suspense fallback={<p>{current.figurePrint.loggingIn}</p>}><GoogleSignInButton onSuccess={login} onError={() => setError(t.loginFailed)} locale={current.lang} /></Suspense>}</div> : <>
                    <fieldset disabled={busy} className="m-0 min-w-0 space-y-3 border border-white/10 p-4">
                        <legend className="px-1 text-sm">{t.shipTo}</legend>
                        <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="radio" name="shipping-source" value="paypal" checked={shippingSource === 'paypal'} onChange={() => setShippingSource('paypal')} className="accent-[#84c96b]" />{t.paypalAddress}</label>
                        <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="radio" name="shipping-source" value="address_book" checked={shippingSource === 'address_book'} onChange={() => setShippingSource('address_book')} className="accent-[#84c96b]" />{t.addressBook}</label>
                    {shippingSource === 'address_book' && <div className="border-t border-white/10 pt-3"><div className="flex justify-between gap-3 text-sm"><span>{t.shipTo}</span><button type="button" disabled={saving || addressLoading} onClick={() => setAddressOpen(true)} className="cursor-pointer text-[#84c96b] hover:underline">{t.change}</button></div><p className="mb-0 max-h-20 overflow-y-auto break-words text-xs leading-relaxed text-white/65">{addressLoading ? current.orders.loading : address ? <>{address.recipient_name && <>{address.recipient_name}<br /></>}{`${address.country} · ${address.state} ${address.city} ${address.detail_address} ${address.zip_code}`}</> : t.noAddress}</p>
                        {address && !addressValid && <p role="status" className="mb-0 text-xs text-amber-200">{current.address.completeAddress}</p>}
                        {addressError && <p role="alert" className="mb-0 text-xs text-amber-200">{t.addressLoadFailed} <button type="button" onClick={() => setAddressRetry(value => value + 1)} className="cursor-pointer underline">{current.figurePrint.retry}</button></p>}
                    </div>}
                    </fieldset>
                    <div className="grid grid-cols-2 gap-3">
                        <button type="button" disabled={loading || busy || !available || !shippingReady || !creator.ready} onClick={order} className={checkoutButtonClass}>{saving ? t.submitting : t.checkout}</button>
                        <button type="button" disabled={loading || busy || !available || !shippingReady || !creator.ready} onClick={buyNow} className={`${checkoutButtonClass} bg-[#3c8527] hover:bg-[#4ea632]`}>{isProcessing ? t.buying : t.buyNow}</button>
                    </div>
                </>}
                {error && <div role="alert" className="space-y-3 text-xs text-red-200"><p>{error}</p><button type="button" disabled={busy} onClick={() => { setRetry(value => value + 1); void creator.retry() }} className={buttonClass}>{current.figurePrint.retry}</button></div>}
            </footer>
        </div>
        <AddressManager isOpen={addressOpen} current={current} onClose={() => setAddressOpen(false)}
            onSelect={selected => { setAddress(selected); setAddressOpen(false) }}
            onUpdate={updated => setAddress(selected => selected?.id === updated.id ? updated : selected)}
            onDelete={id => setAddress(selected => selected?.id === id ? null : selected)} />
    </dialog>, document.body)
}
