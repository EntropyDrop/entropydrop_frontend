import { PageContainer } from '../components/PageContainer';
import { useState, useEffect, useRef } from 'react'
import { Icon } from '@iconify/react'
import { type LangData } from '../constants/lang'
import { motion } from 'framer-motion'
import { apiFetch } from '../utils/api'
import { SEO } from '../components/SEO'

interface CreditsPageProps {
    current: LangData
}

interface CreditLogEntry {
    id: string
    amount: number
    action: string
    source?: string
    timestamp: string
}

interface UserInfo {
    credits: number
}

export function CreditsPage({ current }: CreditsPageProps) {
    const [user, setUser] = useState<UserInfo | null>(null)
    const [items, setItems] = useState<CreditLogEntry[]>([])
    const [page, setPage] = useState(1)
    const [total, setTotal] = useState(0)
    const [pageSize] = useState(15)
    const [isLoading, setIsLoading] = useState(true)

    const [preset, setPreset] = useState<number | null>(1) // preset amount, null=custom
    const [customAmount, setCustomAmount] = useState(1)   // effective dollar amount
    const [isProcessing, setIsProcessing] = useState(false)
    const [purchaseSuccess, setPurchaseSuccess] = useState(false)

    const customInputRef = useRef<HTMLInputElement>(null)

    const c = current.credits

    const fetchUser = async () => {
        try {
            const res = await apiFetch('/api/users/me')
            if (res.ok) {
                const data = await res.json()
                setUser(data)
            }
        } catch (e) {
            console.error('Failed to fetch user', e)
        }
    }

    const fetchHistory = async (p = page) => {
        setIsLoading(true)
        try {
            const res = await apiFetch(`/api/users/me/credits/history?page=${p}&page_size=${pageSize}`)
            if (res.ok) {
                const data = await res.json()
                setItems(data.items || [])
                setTotal(data.total || 0)
            }
        } catch (e) {
            console.error('Failed to fetch credit history', e)
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        if (params.get('payment_redirect') === '1') {
            window.close()
            return
        }

        fetchUser()
        fetchHistory(page)
    }, [page])

    const handlePay = async () => {
        if (customAmount < 1 || isProcessing) return
        setIsProcessing(true)
        try {
            const returnUrl = `${window.location.origin}/credits?payment_redirect=1`
            const res = await apiFetch('/api/credits/purchase', {
                method: 'POST',
                body: JSON.stringify({
                    amount: customAmount,
                    return_url: returnUrl,
                }),
            })
            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.detail || 'Failed to create order')
            }
            const data = await res.json()

            const width = 600
            const height = 700
            const left = window.screenX + (window.innerWidth - width) / 2
            const top = window.screenY + (window.innerHeight - height) / 2
            const popup = window.open(
                data.approval_url,
                'paypal_checkout',
                `width=${width},height=${height},left=${left},top=${top}`,
            )

            if (!popup) {
                alert('Please allow pop-ups to complete payment')
                setIsProcessing(false)
                return
            }

            const paypalOrderId = data.paypal_order_id
            const pollTimer = setInterval(async () => {
                if (popup.closed) {
                    clearInterval(pollTimer)
                    try {
                        const captureRes = await apiFetch('/api/credits/capture', {
                            method: 'POST',
                            body: JSON.stringify({ paypal_order_id: paypalOrderId }),
                        })
                        if (captureRes.ok) {
                            const result = await captureRes.json()
                            setUser({ credits: result.new_balance })
                            setPurchaseSuccess(true)
                            setCustomAmount(0)
                            fetchHistory(1)
                            setTimeout(() => setPurchaseSuccess(false), 5000)
                        } else {
                            let errMsg = 'Payment confirmation failed'
                            try {
                                const err = await captureRes.json()
                                errMsg = err.detail || errMsg
                            } catch (parseErr) {
                                // ignore JSON parse error
                            }
                            if (errMsg !== 'Payment not completed') {
                                alert(errMsg)
                            }
                        }
                    } catch (e) {
                        console.error('Capture after popup close failed', e)
                    } finally {
                        setIsProcessing(false)
                    }
                }
            }, 500)
        } catch (e: any) {
            alert(e.message)
            setIsProcessing(false)
        }
    }

    const getActionStyles = (amount: number) => {
        if (amount > 0) {
            return {
                icon: 'pixelarticons:plus',
                color: 'text-[#a6df7a]',
                bg: 'bg-[#a6df7a]/10',
                border: 'border-[#a6df7a]/20'
            }
        }
        return {
            icon: 'pixelarticons:minus',
            color: 'text-red-400',
            bg: 'bg-red-400/10',
            border: 'border-red-400/20'
        }
    }

    const actionLabels: Record<string, keyof typeof c> = {
        daily_login: 'actionDailyLogin',
        monthly_login: 'actionMonthlyLogin',
        generation: 'actionGeneration',
        refund: 'actionRefund',
        subscription_grant: 'actionSubscriptionGrant',
        purchase: 'actionPurchase',
    }

    const formatActionName = (action: string) => {
        const key = actionLabels[action]
        if (key && key in c) return (c as any)[key] as string
        return action
    }

    const totalPages = Math.ceil(total / pageSize)

    return (
        <PageContainer
            bg="bg-black/60 backdrop-blur-xl"
            animate="animate-in fade-in slide-in-from-bottom-4 duration-500"
            className={current.fontClass}
        >
            <SEO title={c.pageTitle} description={c.pageDesc} />
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mt-2">
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3 text-[#a6df7a]">
                        <Icon icon="pixelarticons:zap" className="text-3xl animate-pulse" />
                        <h1 className="text-2xl sm:text-3xl font-bold">
                            {c.pageTitle}
                        </h1>
                    </div>
                    <p className="text-white/60 text-sm max-w-xl">
                        {c.pageDesc}
                    </p>
                </div>

                <div className="border border-white/10 bg-white/5 p-4 flex flex-col justify-between min-w-[200px] shrink-0">
                    <span className="text-[10px] text-white/40 uppercase tracking-wider">
                        {c.balanceLabel}
                    </span>
                    <span className="text-3xl font-bold text-[#a6df7a] tabular-nums mt-1 flex items-center gap-2">
                        <Icon icon="pixelarticons:zap" className="text-2xl" />
                        {user?.credits ?? 0}
                    </span>
                </div>
            </div>

            {/* Top-Up Section */}
            <div className="border border-white/10 bg-white/5 p-4 mt-4">
                <div className="flex items-center gap-2 mb-4">
                    <Icon icon="pixelarticons:cart-plus" className="text-lg text-white/60" />
                    <span className="text-sm font-bold text-white/80">{c.topUpTitle}</span>
                </div>

                {purchaseSuccess && (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-2 border border-[#a6df7a]/30 bg-[#a6df7a]/10 p-3 mb-4 text-[#a6df7a] text-xs"
                    >
                        <Icon icon="pixelarticons:check" className="text-lg" />
                        {c.purchaseSuccessMsg.replace('{credits}', '')}
                    </motion.div>
                )}

                {/* Amount options */}
                <div className="flex flex-wrap items-center gap-1.5 mb-4">
                    {[1, 5, 10, 20].map((d) => {
                        const active = preset === d
                        return (
                            <button
                                key={d}
                                onClick={() => { setPurchaseSuccess(false); setPreset(d); setCustomAmount(d) }}
                                className={`relative flex flex-col items-center justify-center h-[58px] px-4 transition-all cursor-pointer border ${
                                    active
                                        ? 'border-[#a6df7a] bg-[#a6df7a]/12 text-[#a6df7a] shadow-[0_0_12px_rgba(166,223,122,0.12)]'
                                        : 'border-white/10 bg-transparent text-white/45 hover:border-white/25 hover:text-white/70'
                                }`}
                            >
                                <span className="text-lg font-bold leading-none font-pixel-hans">${d}</span>
                                <span className="text-[9px] mt-0.5 opacity-60">+{d * 10} credits</span>
                                {active && (
                                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#a6df7a] shadow-[0_0_6px_rgba(166,223,122,0.6)]" />
                                )}
                            </button>
                        )
                    })}
                    <div
                        onClick={() => { setPurchaseSuccess(false); setPreset(null); if (preset !== null) { setCustomAmount(0) }; setTimeout(() => customInputRef.current?.focus(), 100) }}
                        className={`relative flex flex-col items-center justify-center h-[58px] px-4 transition-all cursor-pointer border ${
                            preset === null
                                ? 'border-[#a6df7a] bg-[#a6df7a]/12 text-[#a6df7a] shadow-[0_0_12px_rgba(166,223,122,0.12)]'
                                : 'border-white/10 bg-transparent text-white/45 hover:border-white/25 hover:text-white/70'
                        }`}
                    >
                        <div className="flex items-center justify-center gap-0.5 leading-none">
                            <span className="text-lg font-bold font-pixel-hans">$</span>
                            <input
                                ref={customInputRef}
                                type="number"
                                min={1}
                                step={1}
                                placeholder="?"
                                value={preset === null ? (customAmount || '') : ''}
                                onChange={(e) => {
                                    const v = parseInt(e.target.value, 10)
                                    if (v >= 1) { setPurchaseSuccess(false); setCustomAmount(v) }
                                    else setCustomAmount(0)
                                }}
                                onFocus={() => { if (preset !== null) { setPreset(null); setCustomAmount(0) } }}
                                className="bg-transparent w-8 text-center outline-none text-lg font-bold font-pixel-hans text-inherit placeholder:text-white/25 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none h-5 py-0"
                            />
                        </div>
                        <span className="text-[9px] mt-0.5 opacity-60">
                            +{preset === null && customAmount >= 1 ? (customAmount * 10) : '?'} credits
                        </span>
                        {preset === null && (
                            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#a6df7a] shadow-[0_0_6px_rgba(166,223,122,0.6)]" />
                        )}
                    </div>

                    {/* Pay button */}
                    <div className="w-full sm:w-auto sm:ml-auto flex flex-col gap-1.5 align-end">
                        <button
                            onClick={handlePay}
                            disabled={isProcessing || customAmount < 1}
                            className="w-full flex items-center justify-center gap-2 h-[58px] border border-[#a6df7a]/40 bg-[#a6df7a]/12 hover:bg-[#a6df7a]/20 disabled:opacity-40 disabled:pointer-events-none px-6 text-[#a6df7a] font-bold cursor-pointer transition-all hover:shadow-[0_0_12px_rgba(166,223,122,0.15)] animate-in fade-in slide-in-from-left-2 duration-200"
                        >
                            {isProcessing ? (
                                <>
                                    <Icon icon="pixelarticons:reload" className="animate-spin text-lg" />
                                    {c.waitingPayment}
                                </>
                            ) : (
                                <>
                                    <Icon icon="pixelarticons:check" className="text-lg" />
                                    {c.paypalButton}
                                </>
                            )}
                        </button>
                        {!isProcessing && (
                            <div className="flex items-center justify-end gap-1 px-1.5 py-0.5 opacity-40 hover:opacity-75 transition-opacity text-[10px] select-none font-mono">
                                <span>via</span>
                                <Icon icon="fa6-brands:paypal" className="text-[#0079C1] text-xs shrink-0" />
                                <span className="font-bold">PayPal</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* History Table */}
            <div className="flex-1 overflow-hidden border border-white/10 bg-white/5 flex flex-col min-h-[450px] mt-4">
                <div className="grid grid-cols-12 gap-3 p-4 border-b border-white/10 bg-white/5 text-[10px] text-white/40 uppercase tracking-widest">
                    <span className="col-span-3">{c.tableTime}</span>
                    <span className="col-span-3">{c.tableType}</span>
                    <span className="col-span-4">{c.tableSource}</span>
                    <span className="col-span-2 text-right">{c.tableAmount}</span>
                </div>

                {isLoading ? (
                    <div className="flex-1 flex flex-col justify-center items-center gap-3 min-h-[300px]">
                        <Icon icon="pixelarticons:reload" className="text-4xl text-[#a6df7a] animate-spin" />
                        <span className="text-xs tracking-widest text-[#a6df7a]/80 animate-pulse uppercase">
                            {c.loading}
                        </span>
                    </div>
                ) : items.length === 0 ? (
                    <div className="flex-1 flex flex-col justify-center items-center gap-3 min-h-[300px] text-white/35">
                        <Icon icon="pixelarticons:info-box" className="text-3xl" />
                        <span className="text-xs tracking-widest uppercase">
                            {c.empty}
                        </span>
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {items.map((log, i) => {
                            const styles = getActionStyles(log.amount)
                            const localDateStr = new Date(log.timestamp).toLocaleString()
                            return (
                                <motion.div
                                    key={log.id}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.015 }}
                                    className="grid grid-cols-12 gap-3 p-4 border-b border-white/5 hover:bg-white/5 transition-colors items-center group"
                                >
                                    <div className="col-span-3 flex flex-col min-w-0">
                                        <span className="text-[11px] text-white/60 tabular-nums truncate">{localDateStr}</span>
                                        <span className="text-[9px] text-white/20 uppercase tabular-nums truncate">{log.id}</span>
                                    </div>
                                    <div className="col-span-3 flex items-center gap-2 min-w-0">
                                        <div className={`p-1 border ${styles.bg} ${styles.color} ${styles.border}`}>
                                            <Icon icon={styles.icon} className="text-xs" />
                                        </div>
                                        <span className={`text-[10px] uppercase truncate ${styles.color}`}>
                                            {formatActionName(log.action)}
                                        </span>
                                    </div>
                                    <div className="col-span-4 flex flex-col min-w-0">
                                        <span className="text-xs text-white/80 group-hover:text-white transition-colors truncate">
                                            {log.source || '-'}
                                        </span>
                                    </div>
                                    <span className={`col-span-2 text-xs text-right font-bold tabular-nums truncate ${styles.color}`}>
                                        {log.amount > 0 ? `+${log.amount}` : log.amount}
                                    </span>
                                </motion.div>
                            )
                        })}
                    </div>
                )}
            </div>

            {totalPages > 1 && (
                <div className="p-2 flex justify-between items-center text-[10px] font-pixel-hans text-white/60">
                    <button
                        type="button"
                        disabled={page === 1}
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        className="px-3 py-1 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none border border-white/10 cursor-pointer text-white hover:text-white transition-colors flex items-center gap-1.5"
                    >
                        <Icon icon="pixelarticons:chevron-left" />
                        <span>{c.prevPage}</span>
                    </button>
                    <span className="select-none">
                        {c.pageInfo.replace('{page}', String(page)).replace('{total}', String(totalPages))}
                    </span>
                    <button
                        type="button"
                        disabled={page >= totalPages}
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        className="px-3 py-1 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none border border-white/10 cursor-pointer text-white hover:text-white transition-colors flex items-center gap-1.5"
                    >
                        <span>{c.nextPage}</span>
                        <Icon icon="pixelarticons:chevron-right" />
                    </button>
                </div>
            )}
        </PageContainer>
    )
}
