import { useCurrentUser } from '../hooks/useCurrentUser'
import { useAuthSession } from '../hooks/useAuthSession'
import { usePaymentStatus } from '../hooks/usePaymentStatus'
import { PageContainer } from '../components/PageContainer'
import { Footer } from '../components/Footer'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams, Link } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { type LangData } from '../constants/lang'
import { motion, AnimatePresence } from 'framer-motion'
import { apiFetch, apiResponseJson } from '../utils/api'
import { SEO } from '../components/SEO'
import { NotificationActionLink } from '../components/NotificationActionLink'

const MIN_PURCHASE_AMOUNT = 2
const FIGURE_GOAL_CREDITS = 600
const CREDIT_RATE = 10 // $1 USD = 10 Credits

interface CreditsPageProps {
    current: LangData
}

interface CreditLogEntry {
    id: string
    amount: number
    action: string
    source?: string
    actionUrl?: string | null
    timestamp: string
}

type TabType = 'history' | 'redeem' | 'earn'

export function CreditsPage({ current }: CreditsPageProps) {
    const authSession = useAuthSession()
    const { user, setUser } = useCurrentUser()
    const { isPaymentUnderMaintenance } = usePaymentStatus()
    const [searchParams, setSearchParams] = useSearchParams()

    // Tab state (synced with ?tab= query parameter, default to 'history')
    const tabFromUrl = searchParams.get('tab') as string | null
    const initialTab: TabType = (tabFromUrl === 'redeem' || tabFromUrl === 'earn')
        ? tabFromUrl
        : 'history'
    const [activeTab, setActiveTab] = useState<TabType>(initialTab)

    // History data state
    const [items, setItems] = useState<CreditLogEntry[]>([])
    const [page, setPage] = useState(1)
    const [total, setTotal] = useState(0)
    const [pageSize] = useState(15)
    const [isLoading, setIsLoading] = useState(true)
    const [filter, setFilter] = useState<'all' | 'income' | 'expense'>('all')

    // Top-up form state
    const [preset, setPreset] = useState<number | null>(MIN_PURCHASE_AMOUNT)
    const [customAmount, setCustomAmount] = useState(MIN_PURCHASE_AMOUNT)
    const [isProcessing, setIsProcessing] = useState(false)
    const [purchaseSuccess, setPurchaseSuccess] = useState(false)
    const [showComingSoonToast, setShowComingSoonToast] = useState<string | null>(null)

    // YouTube Subscription Task state
    const [youtubeTaskClaimed, setYoutubeTaskClaimed] = useState(false)
    const [hasVisitedYoutube, setHasVisitedYoutube] = useState(() => {
        try {
            return localStorage.getItem('entropydrop_youtube_visited') === '1'
        } catch {
            return false
        }
    })
    const [isClaimingYoutube, setIsClaimingYoutube] = useState(false)
    const [taskToast, setTaskToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

    const customInputRef = useRef<HTMLInputElement>(null)
    const c = current.credits

    // Switch tab and keep URL in sync
    const handleTabChange = (tab: TabType) => {
        setActiveTab(tab)
        setSearchParams(prev => {
            const next = new URLSearchParams(prev)
            next.set('tab', tab)
            return next
        }, { replace: true })
    }

    const fetchHistory = useCallback(async (p = page) => {
        setIsLoading(true)
        try {
            const res = await apiFetch(`/api/users/me/credits/history?page=${p}&page_size=${pageSize}`)
            if (res.ok) {
                const data = await apiResponseJson(res)
                setItems(data.items || [])
                setTotal(data.total || 0)
            }
        } catch (e) {
            console.error('Failed to fetch credit history', e)
        } finally {
            setIsLoading(false)
        }
    }, [page, pageSize])

    useEffect(() => {
        setItems([])
    }, [authSession])

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        if (params.get('payment_redirect') === '1') {
            window.close()
            return
        }

        if (!authSession) return
        fetchHistory(page)
    }, [authSession, page, fetchHistory])

    const handlePay = async () => {
        if (customAmount < MIN_PURCHASE_AMOUNT || isProcessing) return
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
                const err = await apiResponseJson(res)
                throw new Error(err.detail || 'Failed to create order')
            }
            const data = await apiResponseJson(res)

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
                            const result = await apiResponseJson(captureRes)
                            setUser(previous => previous ? { ...previous, credits: result.new_balance } : previous)
                            window.dispatchEvent(new Event('user-updated'))
                            setPurchaseSuccess(true)
                            setCustomAmount(MIN_PURCHASE_AMOUNT)
                            setPreset(MIN_PURCHASE_AMOUNT)
                            fetchHistory(1)
                            setTimeout(() => setPurchaseSuccess(false), 5000)
                        } else {
                            let errMsg = 'Payment confirmation failed'
                            try {
                                const err = await apiResponseJson(captureRes)
                                errMsg = err.detail || errMsg
                            } catch {
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
        } catch (e) {
            alert(e instanceof Error ? e.message : 'Failed to create order')
            setIsProcessing(false)
        }
    }

    const triggerComingSoonToast = (msg?: string) => {
        setShowComingSoonToast(msg || c.comingSoonNotice)
        setTimeout(() => setShowComingSoonToast(null), 4000)
    }

    // Load YouTube Subscription task status
    useEffect(() => {
        if (!authSession) {
            setYoutubeTaskClaimed(false)
            return
        }
        let active = true
        apiFetch('/api/credits/tasks/youtube-subscription')
            .then(res => res.ok ? apiResponseJson(res) : null)
            .then(data => {
                if (active && data && typeof data.claimed === 'boolean') {
                    setYoutubeTaskClaimed(data.claimed)
                }
            })
            .catch(() => {})
        return () => { active = false }
    }, [authSession])

    const handleOpenYoutube = () => {
        setHasVisitedYoutube(true)
        try {
            localStorage.setItem('entropydrop_youtube_visited', '1')
        } catch {}
        window.open('https://www.youtube.com/@EntropyDrop?sub_confirmation=1', '_blank', 'noopener,noreferrer')
    }

    const handleClaimYoutube = async () => {
        if (!authSession) {
            setTaskToast({ type: 'error', message: c.earnYoutubeToastLoginRequired })
            setTimeout(() => setTaskToast(null), 3500)
            return
        }
        if (youtubeTaskClaimed || isClaimingYoutube) return
        setIsClaimingYoutube(true)
        try {
            const res = await apiFetch('/api/credits/tasks/youtube-subscription/claim', {
                method: 'POST'
            })
            if (!res.ok) {
                const err = await apiResponseJson(res).catch(() => null)
                if (err?.detail?.includes('already been claimed')) {
                    setYoutubeTaskClaimed(true)
                }
                throw new Error(err?.detail || c.earnYoutubeToastError)
            }
            const data = await apiResponseJson(res)
            setYoutubeTaskClaimed(true)
            if (typeof data.new_balance === 'number') {
                setUser(prev => prev ? { ...prev, credits: data.new_balance } : prev)
            }
            setTaskToast({ type: 'success', message: c.earnYoutubeToastSuccess })
            setTimeout(() => setTaskToast(null), 4000)
            fetchHistory(1)
        } catch (err: any) {
            setTaskToast({ type: 'error', message: err?.message || c.earnYoutubeToastError })
            setTimeout(() => setTaskToast(null), 3500)
        } finally {
            setIsClaimingYoutube(false)
        }
    }

    const currentBalance = user?.credits ?? 0
    const progressPercent = Math.min(100, Math.round((currentBalance / FIGURE_GOAL_CREDITS) * 100))
    const creditsNeeded = Math.max(0, FIGURE_GOAL_CREDITS - currentBalance)

    const getActionStyles = (amount: number) => {
        if (amount > 0) {
            return {
                icon: 'pixelarticons:plus',
                color: 'text-[#a6df7a]',
                bg: 'bg-[#a6df7a]/10',
                border: 'border-[#a6df7a]/20',
            }
        }
        return {
            icon: 'pixelarticons:minus',
            color: 'text-red-400',
            bg: 'bg-red-400/10',
            border: 'border-red-400/20',
        }
    }

    const actionLabels: Record<string, keyof typeof c> = {
        daily_login: 'actionDailyLogin',
        monthly_login: 'actionMonthlyLogin',
        generation: 'actionGeneration',
        refund: 'actionRefund',
        subscription_grant: 'actionSubscriptionGrant',
        purchase: 'actionPurchase',
        system_gift: 'actionSystemGift',
        youtube_subscribe: 'actionYoutubeSubscribe',
    }

    const formatActionName = (action: string) => {
        const key = actionLabels[action]
        if (key && key in c) return c[key]
        return action
    }

    const filteredItems = items.filter(item => {
        if (filter === 'income') return item.amount > 0
        if (filter === 'expense') return item.amount < 0
        return true
    })

    const totalPages = Math.ceil(total / pageSize)

    return (
        <PageContainer
            bg="bg-black/60 backdrop-blur-xl"
            animate="animate-in fade-in slide-in-from-bottom-4 duration-500"
            gap="gap-2.5"
            className={`${current.fontClass || 'font-pixel-hans'} font-pixel-hans`}
        >
            <SEO title={c.pageTitle} description={c.pageDesc} />

            {/* Top Balance Bar - Original Pixel Style */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-1">
                <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2.5 text-[#a6df7a]">
                        <Icon icon="pixelarticons:zap" className="text-2xl sm:text-3xl animate-pulse" />
                        <h1 className="text-xl sm:text-2xl font-bold">
                            {c.pageTitle}
                        </h1>
                    </div>
                    <p className="text-white/60 text-xs sm:text-sm max-w-xl">
                        {c.pageDesc}
                    </p>
                </div>

                <div className="border border-white/10 bg-white/5 p-3 flex flex-col justify-between min-w-[180px] shrink-0">
                    <span className="text-[10px] text-white/40 uppercase tracking-wider">
                        {c.balanceLabel}
                    </span>
                    <span className="text-2xl sm:text-3xl font-bold text-[#a6df7a] tabular-nums mt-0.5 flex items-center gap-2">
                        <Icon icon="pixelarticons:zap" className="text-xl sm:text-2xl" />
                        {currentBalance}
                    </span>
                </div>
            </div>

            {/* Pixel Tabs Navigation */}
            <div className="flex flex-wrap items-center gap-2 mt-1 pb-1.5 border-b border-white/10">
                <button
                    type="button"
                    onClick={() => handleTabChange('history')}
                    className={`px-3.5 py-1.5 text-xs sm:text-sm font-bold border transition-colors cursor-pointer flex items-center gap-1.5 ${
                        activeTab === 'history'
                            ? 'border-[#a6df7a] bg-[#a6df7a]/15 text-[#a6df7a] shadow-[0_0_12px_rgba(166,223,122,0.15)]'
                            : 'border-white/10 bg-white/5 text-white/50 hover:border-white/25 hover:text-white/80'
                    }`}
                >
                    <Icon icon="pixelarticons:bulletlist" className="text-base" />
                    <span>{c.tabHistory}</span>
                    {total > 0 && (
                        <span className="text-[10px] text-white/40">
                            ({total})
                        </span>
                    )}
                </button>

                <button
                    type="button"
                    onClick={() => handleTabChange('redeem')}
                    className={`px-3.5 py-1.5 text-xs sm:text-sm font-bold border transition-colors cursor-pointer flex items-center gap-1.5 ${
                        activeTab === 'redeem'
                            ? 'border-[#a6df7a] bg-[#a6df7a]/15 text-[#a6df7a] shadow-[0_0_12px_rgba(166,223,122,0.15)]'
                            : 'border-white/10 bg-white/5 text-white/50 hover:border-white/25 hover:text-white/80'
                    }`}
                >
                    <Icon icon="pixelarticons:gift" className="text-base" />
                    <span>{c.tabRedeem}</span>
                </button>

                <button
                    type="button"
                    onClick={() => handleTabChange('earn')}
                    className={`px-3.5 py-1.5 text-xs sm:text-sm font-bold border transition-colors cursor-pointer flex items-center gap-1.5 ${
                        activeTab === 'earn'
                            ? 'border-[#a6df7a] bg-[#a6df7a]/15 text-[#a6df7a] shadow-[0_0_12px_rgba(166,223,122,0.15)]'
                            : 'border-white/10 bg-white/5 text-white/50 hover:border-white/25 hover:text-white/80'
                    }`}
                >
                    <Icon icon="pixelarticons:lightbulb" className="text-base" />
                    <span>{c.tabEarn}</span>
                </button>
            </div>

            <AnimatePresence mode="wait">
                {/* TAB 1: 变动明细与充值 (TRANSACTION LOGS & TOP-UP) - ORIGINAL COMBINED STYLE */}
                {activeTab === 'history' && (
                    <motion.div
                        key="tab-history"
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.15 }}
                        className="space-y-3 mt-1"
                    >
                        {/* Top-Up Section - Compact Pixel Style */}
                        <div className="border border-white/10 bg-white/5 p-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 mb-2">
                                <div className="flex items-center gap-1.5">
                                    <Icon icon="pixelarticons:cart-plus" className="text-base text-white/60" />
                                    <span className="text-xs font-bold text-white/80">{c.topUpTitle}</span>
                                </div>
                                <div className="text-[10px] text-white/40 flex items-center gap-1">
                                    <Icon icon="pixelarticons:mail" className="text-xs shrink-0" />
                                    <span>{c.supportText}</span>
                                    <a href="mailto:support@entropydrop.com" className="text-white/60 hover:text-white transition-colors cursor-pointer underline">support@entropydrop.com</a>
                                </div>
                            </div>

                            {isPaymentUnderMaintenance && (
                                <div className="flex items-center gap-2 border border-amber-500/30 bg-amber-500/10 p-2 mb-2 text-amber-300 text-xs animate-in fade-in duration-200">
                                    <Icon icon="pixelarticons:alert" className="text-base shrink-0 text-amber-400" />
                                    <span>{c.paymentUnderMaintenance}</span>
                                </div>
                            )}

                            {purchaseSuccess && (
                                <motion.div
                                    initial={{ opacity: 0, y: -6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="flex items-center gap-2 border border-[#a6df7a]/30 bg-[#a6df7a]/10 p-2 mb-2 text-[#a6df7a] text-xs"
                                >
                                    <Icon icon="pixelarticons:check" className="text-base" />
                                    <span>{c.purchaseSuccessMsg.replace('{credits}', '')}</span>
                                </motion.div>
                            )}

                            {/* Amount options */}
                            <div className="flex flex-wrap items-center gap-1.5">
                                {[MIN_PURCHASE_AMOUNT, 5, 10, 20].map((d) => {
                                    const active = preset === d
                                    return (
                                        <button
                                            key={d}
                                            type="button"
                                            onClick={() => { setPurchaseSuccess(false); setPreset(d); setCustomAmount(d) }}
                                            className={`relative flex flex-col items-center justify-center h-[40px] px-3 transition-all cursor-pointer border ${
                                                active
                                                    ? 'border-[#a6df7a] bg-[#a6df7a]/12 text-[#a6df7a] shadow-[0_0_12px_rgba(166,223,122,0.12)]'
                                                    : 'border-white/10 bg-transparent text-white/45 hover:border-white/25 hover:text-white/70'
                                            }`}
                                        >
                                            <span className="text-sm font-bold leading-none font-pixel-hans">${d}</span>
                                            <span className="text-[8px] mt-0.5 opacity-60">+{d * CREDIT_RATE} credits</span>
                                            {active && (
                                                <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-[#a6df7a] shadow-[0_0_6px_rgba(166,223,122,0.6)]" />
                                            )}
                                        </button>
                                    )
                                })}
                                <div
                                    onClick={() => { setPurchaseSuccess(false); setPreset(null); if (preset !== null) { setCustomAmount(0) }; setTimeout(() => customInputRef.current?.focus(), 100) }}
                                    className={`relative flex flex-col items-center justify-center h-[40px] px-3 transition-all cursor-pointer border ${
                                        preset === null
                                            ? 'border-[#a6df7a] bg-[#a6df7a]/12 text-[#a6df7a] shadow-[0_0_12px_rgba(166,223,122,0.12)]'
                                            : 'border-white/10 bg-transparent text-white/45 hover:border-white/25 hover:text-white/70'
                                    }`}
                                >
                                    <div className="flex items-center justify-center gap-0.5 leading-none">
                                        <span className="text-sm font-bold font-pixel-hans">$</span>
                                        <input
                                            ref={customInputRef}
                                            type="number"
                                            min={MIN_PURCHASE_AMOUNT}
                                            step={1}
                                            placeholder="?"
                                            value={preset === null ? (customAmount || '') : ''}
                                            onChange={(e) => {
                                                const v = parseInt(e.target.value, 10)
                                                if (v >= MIN_PURCHASE_AMOUNT) { setPurchaseSuccess(false); setCustomAmount(v) }
                                                else setCustomAmount(0)
                                            }}
                                            onFocus={() => { if (preset !== null) { setPreset(null); setCustomAmount(0) } }}
                                            className="bg-transparent w-7 text-center outline-none text-sm font-bold font-pixel-hans text-inherit placeholder:text-white/25 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none h-4 py-0"
                                        />
                                    </div>
                                    <span className="text-[8px] mt-0.5 opacity-60">
                                        +{preset === null && customAmount >= MIN_PURCHASE_AMOUNT ? (customAmount * CREDIT_RATE) : '?'} credits
                                    </span>
                                    {preset === null && (
                                        <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-[#a6df7a] shadow-[0_0_6px_rgba(166,223,122,0.6)]" />
                                    )}
                                </div>

                                {/* Pay button */}
                                <div className="w-full sm:w-auto sm:ml-auto flex flex-col gap-0.5 items-end">
                                    <button
                                        type="button"
                                        onClick={handlePay}
                                        disabled={isProcessing || customAmount < MIN_PURCHASE_AMOUNT || isPaymentUnderMaintenance}
                                        className={`w-full sm:w-auto flex items-center justify-center gap-1.5 h-[40px] border px-4 font-bold text-xs transition-all ${
                                            isPaymentUnderMaintenance
                                                ? 'border-white/10 bg-white/5 text-white/30 cursor-not-allowed'
                                                : 'border-[#a6df7a]/40 bg-[#a6df7a]/12 hover:bg-[#a6df7a]/20 disabled:opacity-40 disabled:pointer-events-none text-[#a6df7a] cursor-pointer hover:shadow-[0_0_12px_rgba(166,223,122,0.15)] animate-in fade-in slide-in-from-left-2 duration-200'
                                        }`}
                                    >
                                        {isProcessing ? (
                                            <>
                                                <Icon icon="pixelarticons:reload" className="animate-spin text-sm" />
                                                <span>{c.waitingPayment}</span>
                                            </>
                                        ) : isPaymentUnderMaintenance ? (
                                            <>
                                                <Icon icon="pixelarticons:lock" className="text-sm" />
                                                <span>{current.common.paymentUnderMaintenanceBtn}</span>
                                            </>
                                        ) : (
                                            <>
                                                <Icon icon="pixelarticons:check" className="text-sm" />
                                                <span>{c.paypalButton}</span>
                                            </>
                                        )}
                                    </button>
                                    {!isProcessing && (
                                        <div className="flex items-center justify-end gap-1 px-1 opacity-40 hover:opacity-75 transition-opacity text-[9px] select-none">
                                            <span>via</span>
                                            <Icon icon="fa6-brands:paypal" className="text-[#0079C1] text-[10px] shrink-0" />
                                            <span className="font-bold">PayPal</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* History Table - Original Pixel Style */}
                        <div className="flex-1 overflow-hidden border border-white/10 bg-white/5 flex flex-col min-h-[450px]">
                            {/* Header & Filter Controls */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 border-b border-white/10 bg-white/5">
                                <div className="flex items-center gap-2">
                                    <Icon icon="pixelarticons:bulletlist" className="text-base text-white/60" />
                                    <span className="text-xs font-bold text-white/80">{c.logsTitle}</span>
                                    <span className="text-[10px] text-white/40">({total})</span>
                                </div>

                                <div className="flex items-center gap-1">
                                    {(['all', 'income', 'expense'] as const).map(f => (
                                        <button
                                            key={f}
                                            type="button"
                                            onClick={() => setFilter(f)}
                                            className={`px-2.5 py-1 text-[10px] font-bold border transition-colors cursor-pointer ${
                                                filter === f
                                                    ? 'border-[#a6df7a] bg-[#a6df7a]/15 text-[#a6df7a]'
                                                    : 'border-white/10 bg-transparent text-white/40 hover:text-white/70'
                                            }`}
                                        >
                                            {f === 'all' ? c.filterAll : f === 'income' ? c.filterIncome : c.filterExpense}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Table Column Titles */}
                            <div className="grid grid-cols-12 gap-3 p-3 border-b border-white/10 bg-white/5 text-[10px] text-white/40 uppercase tracking-widest">
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
                            ) : filteredItems.length === 0 ? (
                                <div className="flex-1 flex flex-col justify-center items-center gap-3 min-h-[300px] text-white/35">
                                    <Icon icon="pixelarticons:info-box" className="text-3xl" />
                                    <span className="text-xs tracking-widest uppercase">
                                        {c.empty}
                                    </span>
                                </div>
                            ) : (
                                <div className="flex-1 overflow-y-auto custom-scrollbar">
                                    {filteredItems.map((log, i) => {
                                        const styles = getActionStyles(log.amount)
                                        const localDateStr = new Date(log.timestamp).toLocaleString()
                                        return (
                                            <motion.div
                                                key={log.id}
                                                initial={{ opacity: 0, y: 8 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: i * 0.015 }}
                                                className="grid grid-cols-12 gap-3 p-3.5 border-b border-white/5 hover:bg-white/5 transition-colors items-center group"
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
                                                    {log.action === 'system_gift' && (
                                                        <NotificationActionLink url={log.actionUrl} current={current} />
                                                    )}
                                                </div>
                                                <span className={`col-span-2 text-xs text-right font-bold tabular-nums truncate ${styles.color}`}>
                                                    {log.amount > 0 ? `+${log.amount}` : log.amount}
                                                </span>
                                            </motion.div>
                                        )
                                    })}
                                </div>
                            )}

                            {/* Pagination Footer */}
                            {totalPages > 1 && (
                                <div className="p-2 flex justify-between items-center text-[10px] text-white/60 border-t border-white/10">
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
                        </div>
                    </motion.div>
                )}

                {/* TAB 2: 兑换商城 (REDEEM STORE) */}
                {activeTab === 'redeem' && (
                    <motion.div
                        key="tab-redeem"
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.15 }}
                        className="mt-1.5 max-w-xl mx-auto"
                    >
                        {/* 10CM PHYSICAL FIGURE REDEMPTION */}
                        <div className="border border-[#a6df7a]/40 bg-white/5 p-4 sm:p-5 flex flex-col justify-between hover:border-[#a6df7a] transition-colors group">
                            <div>
                                {/* Image box */}
                                <div className="relative h-56 sm:h-64 w-full overflow-hidden bg-black/60 border border-white/10 mb-4">
                                    <img
                                        src="/images/figure_duo_showcase.jpg"
                                        alt={c.itemFigureTitle}
                                        className="w-full h-full object-cover object-center group-hover:scale-102 transition-transform duration-300"
                                    />
                                    <div className="absolute top-2 left-2 flex items-center gap-1.5">
                                        <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-[#a6df7a] text-black">
                                            {c.itemFigureTag}
                                        </span>
                                        <span className="px-2 py-0.5 text-[9px] border border-white/20 bg-black/80 text-white/70">
                                            {c.comingSoonBadge}
                                        </span>
                                    </div>
                                    <div className="absolute bottom-2 right-2 px-2.5 py-1 bg-black/90 border border-[#a6df7a]/50 text-[#a6df7a] font-bold text-sm tabular-nums flex items-center gap-1">
                                        <Icon icon="pixelarticons:zap" className="text-xs" />
                                        <span>{c.itemFigureCost}</span>
                                    </div>
                                </div>

                                {/* Title & Desc */}
                                <div className="space-y-1">
                                    <h3 className="text-base sm:text-lg font-bold text-white group-hover:text-[#a6df7a] transition-colors">
                                        {c.itemFigureTitle}
                                    </h3>
                                    <p className="text-xs sm:text-sm text-white/60 leading-relaxed">
                                        {c.itemFigureDesc}
                                    </p>
                                </div>

                                {/* Spec list */}
                                <div className="mt-3 pt-3 border-t border-white/10 space-y-1.5 text-xs text-white/70">
                                    <div className="flex items-start gap-2">
                                        <Icon icon="pixelarticons:check" className="text-sm text-[#a6df7a] shrink-0 mt-0.5" />
                                        <span>{c.itemFigureF1}</span>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <Icon icon="pixelarticons:check" className="text-sm text-[#a6df7a] shrink-0 mt-0.5" />
                                        <span>{c.itemFigureF2}</span>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <Icon icon="pixelarticons:check" className="text-sm text-[#a6df7a] shrink-0 mt-0.5" />
                                        <span>{c.itemFigureF3}</span>
                                    </div>
                                </div>

                                {/* Goal progress box */}
                                <div className="border border-white/10 bg-black/30 p-3 mt-4 space-y-1.5">
                                    <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-white/50">{c.progressLabel}</span>
                                        <span className="font-bold text-[#a6df7a] tabular-nums">{currentBalance} / 600 ({progressPercent}%)</span>
                                    </div>
                                    <div className="w-full h-2 bg-white/10 border border-white/10 overflow-hidden">
                                        <div
                                            className="h-full bg-[#a6df7a] transition-all duration-300"
                                            style={{ width: `${progressPercent}%` }}
                                        />
                                    </div>
                                    <div className="text-[10px] text-white/50">
                                        {currentBalance >= FIGURE_GOAL_CREDITS ? (
                                            <span className="text-[#a6df7a]">✓ {c.progressCompleted}</span>
                                        ) : (
                                            <span>{c.progressRemain.replace('{count}', creditsNeeded.toString())}</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Coming Soon Button */}
                            <button
                                type="button"
                                onClick={() => triggerComingSoonToast(c.comingSoonNotice)}
                                className="w-full h-[46px] mt-4 border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-bold text-xs uppercase flex items-center justify-center gap-2 cursor-pointer transition-colors"
                            >
                                <Icon icon="pixelarticons:lock" className="text-base" />
                                <span>{c.comingSoon} · {c.comingSoonBadge}</span>
                            </button>
                        </div>
                    </motion.div>
                )}



                {/* TAB 3: 获取途径 (HOW TO EARN) - ORIGINAL PIXEL STYLE */}
                {activeTab === 'earn' && (
                    <motion.div
                        key="tab-earn"
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.15 }}
                        className="mt-1.5 space-y-3"
                    >
                        <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                            <Icon icon="pixelarticons:lightbulb" className="text-lg text-[#a6df7a]" />
                            <span className="text-sm font-bold text-white/80">{c.tabEarn}</span>
                            <span className="text-xs text-white/40 hidden sm:inline">— {c.earnSubtitle}</span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {/* Method 1: Daily Login */}
                            <div className="border border-white/10 bg-white/5 p-4 flex flex-col justify-between hover:border-white/20 transition-colors">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-[#a6df7a]">
                                            <Icon icon="pixelarticons:calendar" className="text-xl" />
                                            <h3 className="text-base font-bold text-white">
                                                {c.earnDailyTitle}
                                            </h3>
                                        </div>
                                        <span className="border border-[#a6df7a]/30 bg-[#a6df7a]/10 text-[#a6df7a] px-2 py-0.5 text-[10px] font-bold">
                                            {c.earnDailyReward}
                                        </span>
                                    </div>
                                    <p className="text-xs text-white/60 leading-relaxed">
                                        {c.earnDailyDesc}
                                    </p>
                                </div>
                            </div>

                            {/* Method 2: Monthly Login */}
                            <div className="border border-white/10 bg-white/5 p-4 flex flex-col justify-between hover:border-white/20 transition-colors">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-[#a6df7a]">
                                            <Icon icon="pixelarticons:calendar-month" className="text-xl" />
                                            <h3 className="text-base font-bold text-white">
                                                {c.earnMonthlyTitle}
                                            </h3>
                                        </div>
                                        <span className="border border-[#a6df7a]/30 bg-[#a6df7a]/10 text-[#a6df7a] px-2 py-0.5 text-[10px] font-bold">
                                            {c.earnMonthlyReward}
                                        </span>
                                    </div>
                                    <p className="text-xs text-white/60 leading-relaxed">
                                        {c.earnMonthlyDesc}
                                    </p>
                                </div>
                            </div>

                            {/* Method 3: YouTube Channel Subscription */}
                            <div className="border border-white/10 bg-white/5 p-4 flex flex-col justify-between hover:border-white/20 transition-colors">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-[#FF0000]">
                                            <Icon icon="fa6-brands:youtube" className="text-xl" />
                                            <h3 className="text-base font-bold text-white">
                                                {c.earnYoutubeTitle}
                                            </h3>
                                        </div>
                                        <span className="border border-[#a6df7a]/30 bg-[#a6df7a]/10 text-[#a6df7a] px-2 py-0.5 text-[10px] font-bold">
                                            {c.earnYoutubeReward}
                                        </span>
                                    </div>
                                    <p className="text-xs text-white/60 leading-relaxed">
                                        {c.earnYoutubeDesc}
                                    </p>
                                </div>
                                <div className="pt-3">
                                    {youtubeTaskClaimed ? (
                                        <div className="flex items-center gap-2">
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-white/10 bg-white/5 text-white/40 text-xs">
                                                <Icon icon="pixelarticons:check" className="text-xs text-[#a6df7a]" />
                                                <span>{c.earnYoutubeClaimed}</span>
                                            </span>
                                            <a
                                                href="https://www.youtube.com/@EntropyDrop"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-white/40 hover:text-white transition-colors"
                                                title="YouTube: @EntropyDrop"
                                            >
                                                <Icon icon="pixelarticons:external-link" />
                                            </a>
                                        </div>
                                    ) : hasVisitedYoutube ? (
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <button
                                                type="button"
                                                onClick={handleClaimYoutube}
                                                disabled={isClaimingYoutube}
                                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 border border-[#a6df7a]/50 bg-[#a6df7a]/15 hover:bg-[#a6df7a]/25 text-[#a6df7a] text-xs font-bold transition-all shadow-[0_0_12px_rgba(166,223,122,0.15)] cursor-pointer disabled:opacity-50"
                                            >
                                                {isClaimingYoutube ? (
                                                    <>
                                                        <Icon icon="pixelarticons:reload" className="animate-spin text-xs" />
                                                        <span>{c.earnYoutubeBtnClaiming}</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Icon icon="pixelarticons:gift" className="text-xs" />
                                                        <span>{c.earnYoutubeBtnClaim}</span>
                                                    </>
                                                )}
                                            </button>
                                            <a
                                                href="https://www.youtube.com/@EntropyDrop?sub_confirmation=1"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-white/50 hover:text-white transition-colors"
                                            >
                                                <Icon icon="fa6-brands:youtube" className="text-xs text-red-400" />
                                                <span>{c.earnYoutubeBtnGo}</span>
                                            </a>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <button
                                                type="button"
                                                onClick={handleOpenYoutube}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 text-xs transition-colors cursor-pointer"
                                            >
                                                <Icon icon="fa6-brands:youtube" className="text-xs" />
                                                <span>{c.earnYoutubeBtnGo}</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Method 3: Pro Subscription */}
                            <div className="border border-white/10 bg-white/5 p-4 flex flex-col justify-between hover:border-white/20 transition-colors">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-[#a6df7a]">
                                            <Icon icon="pixelarticons:zap" className="text-xl" />
                                            <h3 className="text-base font-bold text-white">
                                                {c.earnProTitle}
                                            </h3>
                                        </div>
                                        <span className="border border-purple-400/30 bg-purple-400/10 text-purple-300 px-2 py-0.5 text-[10px] font-bold">
                                            {c.earnProReward}
                                        </span>
                                    </div>
                                    <p className="text-xs text-white/60 leading-relaxed">
                                        {c.earnProDesc}
                                    </p>
                                </div>
                                <div className="pt-3">
                                    <Link
                                        to="/pro"
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-white/15 bg-white/5 hover:bg-white/10 text-white/80 text-xs transition-colors cursor-pointer"
                                    >
                                        <span>{c.earnProBtn}</span>
                                        <Icon icon="pixelarticons:arrow-right" />
                                    </Link>
                                </div>
                            </div>

                            {/* Method 4: Video Creator Incentive */}
                            <div className="border border-white/10 bg-white/5 p-4 flex flex-col justify-between hover:border-white/20 transition-colors">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-[#a6df7a]">
                                            <Icon icon="pixelarticons:video" className="text-xl" />
                                            <h3 className="text-base font-bold text-white">
                                                {c.earnVideoTitle}
                                            </h3>
                                        </div>
                                        <span className="border border-[#a6df7a]/30 bg-[#a6df7a]/10 text-[#a6df7a] px-2 py-0.5 text-[10px] font-bold">
                                            {c.earnVideoReward}
                                        </span>
                                    </div>
                                    <p className="text-xs text-white/60 leading-relaxed">
                                        {c.earnVideoDesc}
                                    </p>
                                </div>
                                <div className="pt-3 flex items-center gap-2 flex-wrap">
                                    <a
                                        href="mailto:support@entropydrop.com?subject=EntropyDrop%20Video%20Creator%20Submission"
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-white/15 bg-white/5 hover:bg-white/10 text-white/80 text-xs transition-colors cursor-pointer"
                                    >
                                        <Icon icon="pixelarticons:mail" className="text-xs" />
                                        <span>{c.earnVideoBtn}</span>
                                    </a>
                                    <a
                                        href="https://discord.gg/zxd8RjUyYt"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-[#5865F2]/40 bg-[#5865F2]/10 hover:bg-[#5865F2]/20 text-[#7983f5] hover:text-[#9ba2ff] text-xs transition-colors cursor-pointer"
                                    >
                                        <Icon icon="ic:baseline-discord" className="text-sm" />
                                        <span>{c.earnFeedbackDiscordBtn}</span>
                                    </a>
                                </div>
                            </div>

                            {/* Method 5: Bug Report */}
                            <div className="border border-white/10 bg-white/5 p-4 flex flex-col justify-between hover:border-white/20 transition-colors">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-[#a6df7a]">
                                            <Icon icon="pixelarticons:bug" className="text-xl" />
                                            <h3 className="text-base font-bold text-white">
                                                {c.earnBugTitle}
                                            </h3>
                                        </div>
                                        <span className="border border-[#a6df7a]/30 bg-[#a6df7a]/10 text-[#a6df7a] px-2 py-0.5 text-[10px] font-bold">
                                            {c.earnBugReward}
                                        </span>
                                    </div>
                                    <p className="text-xs text-white/60 leading-relaxed">
                                        {c.earnBugDesc}
                                    </p>
                                </div>
                                <div className="pt-3">
                                    <a
                                        href="mailto:support@entropydrop.com?subject=EntropyDrop%20Bug%20Report"
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-white/15 bg-white/5 hover:bg-white/10 text-white/80 text-xs transition-colors cursor-pointer"
                                    >
                                        <Icon icon="pixelarticons:mail" className="text-xs" />
                                        <span>{c.earnBugBtn}</span>
                                    </a>
                                </div>
                            </div>

                            {/* Method 6: Feedback & Suggestions */}
                            <div className="border border-white/10 bg-white/5 p-4 flex flex-col justify-between hover:border-white/20 transition-colors">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-[#a6df7a]">
                                            <Icon icon="pixelarticons:message-text" className="text-xl" />
                                            <h3 className="text-base font-bold text-white">
                                                {c.earnFeedbackTitle}
                                            </h3>
                                        </div>
                                        <span className="border border-[#a6df7a]/30 bg-[#a6df7a]/10 text-[#a6df7a] px-2 py-0.5 text-[10px] font-bold">
                                            {c.earnFeedbackReward}
                                        </span>
                                    </div>
                                    <p className="text-xs text-white/60 leading-relaxed">
                                        {c.earnFeedbackDesc}
                                    </p>
                                </div>
                                <div className="pt-3 flex items-center gap-2 flex-wrap">
                                    <a
                                        href="mailto:support@entropydrop.com?subject=EntropyDrop%20Feedback%20Suggestion"
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-white/15 bg-white/5 hover:bg-white/10 text-white/80 text-xs transition-colors cursor-pointer"
                                    >
                                        <Icon icon="pixelarticons:mail" className="text-xs" />
                                        <span>{c.earnFeedbackBtn}</span>
                                    </a>
                                    <a
                                        href="https://discord.gg/zxd8RjUyYt"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-[#5865F2]/40 bg-[#5865F2]/10 hover:bg-[#5865F2]/20 text-[#7983f5] hover:text-[#9ba2ff] text-xs transition-colors cursor-pointer"
                                    >
                                        <Icon icon="ic:baseline-discord" className="text-sm" />
                                        <span>{c.earnFeedbackDiscordBtn}</span>
                                    </a>
                                </div>
                            </div>

                            {/* Method 7: Creator & Community (Coming Soon) */}
                            <div className="border border-white/10 bg-white/5 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-white/20 transition-colors md:col-span-2 lg:col-span-3">
                                <div className="space-y-1.5">
                                    <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-2 text-[#a6df7a]">
                                            <Icon icon="pixelarticons:trophy" className="text-xl" />
                                            <h3 className="text-base font-bold text-white">
                                                {c.earnCreatorTitle}
                                            </h3>
                                        </div>
                                        <span className="border border-amber-500/40 bg-amber-500/10 text-amber-300 px-2 py-0.5 text-[10px] font-bold flex items-center gap-1">
                                            <Icon icon="pixelarticons:lock" className="text-xs" />
                                            {c.comingSoonBadge}
                                        </span>
                                    </div>
                                    <p className="text-xs text-white/60 leading-relaxed max-w-3xl">
                                        {c.earnCreatorDesc}
                                    </p>
                                </div>
                                <div className="shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => triggerComingSoonToast(`${c.earnCreatorTitle} - ${c.comingSoonNotice}`)}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs transition-colors cursor-pointer"
                                    >
                                        <Icon icon="pixelarticons:lock" className="text-xs" />
                                        <span>{c.comingSoon} · {c.comingSoonBadge}</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}

            </AnimatePresence>

            {/* ===================== FOOTER ===================== */}
            <Footer current={current} />

            {/* PIXEL TOAST: COMING SOON ALERT */}
            {createPortal(
                <AnimatePresence>
                    {showComingSoonToast && (
                        <motion.div
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 16 }}
                            className={`fixed bottom-6 right-6 z-[9999] max-w-sm p-4 bg-black/95 border border-amber-500/50 shadow-2xl text-white flex items-start gap-3 ${current.fontClass || 'font-pixel-hans'} font-pixel-hans`}
                        >
                            <Icon icon="pixelarticons:gift" className="text-xl text-amber-400 shrink-0 mt-0.5" />
                            <div className="flex-1 space-y-1">
                                <div className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                                    {c.comingSoon} · {c.comingSoonBadge}
                                </div>
                                <p className="text-xs text-white/70 leading-relaxed">
                                    {showComingSoonToast}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowComingSoonToast(null)}
                                className="text-white/40 hover:text-white cursor-pointer"
                            >
                                <Icon icon="pixelarticons:close" className="text-base" />
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* PIXEL TOAST: TASK FEEDBACK ALERT */}
            {createPortal(
                <AnimatePresence>
                    {taskToast && (
                        <motion.div
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 16 }}
                            className={`fixed bottom-6 right-6 z-[9999] max-w-sm p-4 bg-black/95 border ${
                                taskToast.type === 'success' ? 'border-[#a6df7a]/50' : 'border-red-500/50'
                            } shadow-2xl text-white flex items-start gap-3 ${current.fontClass || 'font-pixel-hans'} font-pixel-hans`}
                        >
                            <Icon
                                icon={taskToast.type === 'success' ? 'pixelarticons:check' : 'pixelarticons:alert'}
                                className={`text-xl shrink-0 mt-0.5 ${
                                    taskToast.type === 'success' ? 'text-[#a6df7a]' : 'text-red-400'
                                }`}
                            />
                            <div className="flex-1 space-y-1">
                                <div
                                    className={`text-xs font-bold uppercase tracking-wider ${
                                        taskToast.type === 'success' ? 'text-[#a6df7a]' : 'text-red-400'
                                    }`}
                                >
                                    {taskToast.type === 'success' ? c.earnYoutubeReward : 'Notice'}
                                </div>
                                <p className="text-xs text-white/80 leading-relaxed">
                                    {taskToast.message}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setTaskToast(null)}
                                className="text-white/40 hover:text-white cursor-pointer"
                            >
                                <Icon icon="pixelarticons:close" className="text-base" />
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </PageContainer>
    )
}
