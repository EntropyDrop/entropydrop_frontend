import { PageContainer } from '../components/PageContainer';
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { type LangData } from '../constants/lang'
import { motion } from 'framer-motion'
import { apiFetch } from '../utils/api'

interface LedgerPageProps {
    current: LangData
}

type LedgerProvider = 'all' | 'paypal' | 'aws'

interface LedgerEntry {
    id: string
    date: string
    type: 'revenue' | 'expense'
    provider?: string
    source?: string
    desc: string
    amount: string
    amount_value?: number
    status?: string
}

interface LedgerSummary {
    count: number
    total: string
    total_value: number
    revenue?: string
    expense?: string
    last_entry_at?: string | null
}

interface LedgerResponse {
    entries: LedgerEntry[]
    summaries: {
        all: LedgerSummary
        paypal: LedgerSummary
        aws: LedgerSummary
    }
    sync?: {
        mode?: string
        interval_seconds?: number
        generated_at?: string
        paypal?: { status?: string; last_synced_at?: string | null; records?: number }
        aws?: { status?: string; last_synced_at?: string | null; records?: number }
    }
}

const emptySummary: LedgerSummary = {
    count: 0,
    total: '$0.00',
    total_value: 0,
    revenue: '$0.00',
    expense: '$0.00',
    last_entry_at: null,
}

function parseAmount(value: unknown) {
    if (typeof value === 'number') return value
    if (!value) return 0
    const cleaned = String(value).replace('$', '').replace(',', '').replace('+', '').trim()
    const parsed = Number.parseFloat(cleaned)
    return Number.isFinite(parsed) ? parsed : 0
}

function formatMoney(value: number) {
    const sign = value >= 0 ? '+' : '-'
    return `${sign}$${Math.abs(value).toFixed(2)}`
}

function buildSummary(entries: LedgerEntry[], provider?: string): LedgerSummary {
    const scoped = provider ? entries.filter((entry) => entry.provider === provider) : entries
    const totalValue = scoped.reduce((sum, entry) => sum + parseAmount(entry.amount_value ?? entry.amount), 0)
    const revenueValue = scoped.reduce((sum, entry) => sum + Math.max(parseAmount(entry.amount_value ?? entry.amount), 0), 0)
    const expenseValue = scoped.reduce((sum, entry) => sum + Math.min(parseAmount(entry.amount_value ?? entry.amount), 0), 0)

    return {
        count: scoped.length,
        total: formatMoney(totalValue),
        total_value: totalValue,
        revenue: formatMoney(revenueValue),
        expense: formatMoney(expenseValue),
        last_entry_at: scoped[0]?.date || null,
    }
}

function normalizePayload(payload: unknown): LedgerResponse {
    if (Array.isArray(payload)) {
        const entries = payload as LedgerEntry[]
        return {
            entries,
            summaries: {
                all: buildSummary(entries),
                paypal: buildSummary(entries, 'paypal'),
                aws: buildSummary(entries, 'aws'),
            },
        }
    }

    const data = payload as Partial<LedgerResponse>
    const entries = data.entries || []
    return {
        entries,
        summaries: {
            all: data.summaries?.all || buildSummary(entries),
            paypal: data.summaries?.paypal || buildSummary(entries, 'paypal'),
            aws: data.summaries?.aws || buildSummary(entries, 'aws'),
        },
        sync: data.sync,
    }
}

export function LedgerPage({ current }: LedgerPageProps) {
    const navigate = useNavigate()
    const pageData = current.public_page.assets_pages.ledger
    const [ledger, setLedger] = useState<LedgerResponse>({
        entries: [],
        summaries: { all: emptySummary, paypal: emptySummary, aws: emptySummary },
    })
    const [selectedProvider, setSelectedProvider] = useState<LedgerProvider>('all')
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        let active = true
        async function fetchLedger() {
            try {
                const response = await apiFetch('/api/public/ledger')
                if (response.ok && active) {
                    const data = await response.json()
                    setLedger(normalizePayload(data))
                }
            } catch (err) {
                console.error('Failed to load live ledger:', err)
            } finally {
                if (active) setIsLoading(false)
            }
        }
        fetchLedger()
        return () => { active = false }
    }, [])

    const providerStyles = (provider?: string, type?: string) => {
        if (provider === 'paypal') return { icon: 'pixelarticons:dollar', color: 'text-green-500', bg: 'bg-green-500/10', border: 'border-green-500/20' }
        if (provider === 'aws') return { icon: 'pixelarticons:device-laptop', color: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/20' }
        if (type === 'expense') return { icon: 'pixelarticons:arrow-down', color: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-400/20' }
        return { icon: 'pixelarticons:briefcase', color: 'text-white/50', bg: 'bg-white/5', border: 'border-white/10' }
    }

    const typeColor = (type: string) => type === 'revenue' ? 'text-green-500' : 'text-red-400'
    const entries = ledger.entries
    const visibleEntries = selectedProvider === 'all'
        ? entries
        : entries.filter((tx) => tx.provider === selectedProvider)
    const syncLastUpdate = ledger.sync?.paypal?.last_synced_at
        || ledger.sync?.aws?.last_synced_at
        || ledger.sync?.generated_at
        || pageData.sync.empty

    const filters: { id: LedgerProvider; label: string; count: number }[] = [
        { id: 'all', label: pageData.filters.all, count: ledger.summaries.all.count },
        { id: 'paypal', label: pageData.filters.paypal, count: ledger.summaries.paypal.count },
        { id: 'aws', label: pageData.filters.aws, count: ledger.summaries.aws.count },
    ]

    const stats = [
        {
            label: pageData.stats.paypal,
            value: ledger.summaries.paypal.total,
            sub: `${pageData.sync.records}: ${ledger.summaries.paypal.count}`,
            icon: 'pixelarticons:dollar',
            color: 'text-green-500',
        },
        {
            label: pageData.stats.aws,
            value: ledger.summaries.aws.total,
            sub: `${pageData.sync.records}: ${ledger.summaries.aws.count}`,
            icon: 'pixelarticons:device-laptop',
            color: 'text-yellow-400',
        },
    ]

    return (
        <PageContainer
            bg="bg-black/60 backdrop-blur-xl"
            animate="animate-in fade-in slide-in-from-bottom-4 duration-500"
            className={current.fontClass}
        >

            <button
                onClick={() => navigate('/public/about')}
                className="flex items-center gap-2 text-white/50 hover:text-green-500 transition-colors self-start group"
            >
                <Icon icon="pixelarticons:arrow-left" className="text-xl transform group-hover:-translate-x-1 transition-transform" />
                <span className="text-xs uppercase tracking-widest">Back to Mission</span>
            </button>

            <div className="flex flex-col lg:flex-row gap-4 lg:items-end lg:justify-between">
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3 text-yellow-500">
                        <Icon icon="pixelarticons:script" className="text-3xl" />
                        <h1 className={`text-2xl sm:text-3xl font-bold ${current.fontClass}`}>{pageData.title}</h1>
                    </div>
                    <p className={`text-white/60 text-sm sm:text-base max-w-3xl ${current.fontClass}`}>
                        {pageData.desc}
                    </p>
                    <a
                        href={pageData.fullDataUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-white/35 hover:text-yellow-400 transition-colors self-start"
                    >
                        <Icon icon="simple-icons:github" className="text-sm" />
                        <span>{pageData.fullData}</span>
                    </a>
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-white/35">
                        <Icon icon="pixelarticons:building" className="text-sm text-blue-400" />
                        <span>{pageData.bankLedger}</span>
                    </div>
                </div>
                <div className="flex max-w-sm items-start gap-2 text-[10px] uppercase tracking-widest text-white/40">
                    <Icon icon="pixelarticons:calendar" className="mt-0.5 text-sm text-blue-400" />
                    <div className="flex flex-col gap-1">
                        <span>
                            {pageData.sync.lastUpdate}: {syncLastUpdate || '-'}
                        </span>
                        <span className="normal-case tracking-normal leading-relaxed text-white/35">
                            {pageData.sync.rateLimit}
                        </span>
                    </div>
                </div>
            </div>

            {/* Beta Alert Banner */}
            <div className="flex items-center gap-3 bg-yellow-500/10 border border-yellow-500/20 px-4 py-3 text-xs text-yellow-500/90 backdrop-blur-md relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/0 via-yellow-500/5 to-yellow-500/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out" />
                <Icon icon="pixelarticons:info-box" className="text-lg flex-shrink-0 animate-pulse text-yellow-500" />
                <span className="leading-normal font-medium">{pageData.betaNotice}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {stats.map((stat) => (
                    <div key={stat.label} className="border border-white/10 bg-white/5 p-4 min-h-[112px] flex flex-col justify-between">
                        <div className="flex items-center gap-2 text-white/40">
                            <Icon icon={stat.icon} className="text-base" />
                            <span className="text-[10px] uppercase tracking-wider truncate">{stat.label}</span>
                        </div>
                        <div className="flex flex-col gap-1 min-w-0">
                            <span className={`text-xl sm:text-2xl font-bold tabular-nums truncate ${stat.color}`}>{stat.value}</span>
                            <span className="text-[10px] text-white/35 truncate">{stat.sub}</span>
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex flex-wrap gap-2">
                {filters.map((filter) => {
                    const active = selectedProvider === filter.id
                    return (
                        <button
                            key={filter.id}
                            type="button"
                            onClick={() => setSelectedProvider(filter.id)}
                            className={`h-9 px-3 border text-[10px] uppercase tracking-widest transition-colors flex items-center gap-2 ${active ? 'border-green-500/50 bg-green-500/10 text-green-500' : 'border-white/10 bg-white/5 text-white/45 hover:text-white/80 hover:bg-white/10'}`}
                        >
                            <span>{filter.label}</span>
                            <span className="text-white/30 tabular-nums">{filter.count}</span>
                        </button>
                    )
                })}
            </div>

            <div className="flex-1 overflow-hidden border border-white/10 bg-white/5 flex flex-col min-h-[500px]">
                <div className="grid grid-cols-12 gap-3 p-4 border-b border-white/10 bg-white/5 text-[10px] text-white/40 uppercase tracking-widest">
                    <span className="col-span-3">{pageData.headers.date}</span>
                    <span className="col-span-2">{pageData.headers.source}</span>
                    <span className="col-span-5">{pageData.headers.desc}</span>
                    <span className="col-span-2 text-right">{pageData.headers.amount}</span>
                </div>

                {isLoading ? (
                    <div className="flex-1 flex flex-col justify-center items-center gap-3 min-h-[400px]">
                        <Icon icon="pixelarticons:script" className="text-4xl text-green-500 animate-pulse" />
                        <span className="text-xs tracking-widest text-green-500/80 animate-pulse uppercase">Connecting to ledger stream...</span>
                    </div>
                ) : visibleEntries.length === 0 ? (
                    <div className="flex-1 flex flex-col justify-center items-center gap-3 min-h-[400px] text-white/35">
                        <Icon icon="pixelarticons:info-box" className="text-3xl" />
                        <span className="text-xs tracking-widest uppercase">{pageData.sync.empty}</span>
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {visibleEntries.map((tx, i) => {
                            const styles = providerStyles(tx.provider, tx.type)
                            return (
                                <motion.div
                                    key={tx.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.02 }}
                                    className="grid grid-cols-12 gap-3 p-4 border-b border-white/5 hover:bg-white/5 transition-colors items-center group"
                                >
                                    <div className="col-span-3 flex flex-col min-w-0">
                                        <span className="text-[11px] text-white/60 tabular-nums truncate">{tx.date}</span>
                                        <span className="text-[9px] text-white/20 uppercase tabular-nums truncate">{tx.id}</span>
                                    </div>
                                    <div className="col-span-2 flex items-center gap-2 min-w-0">
                                        <div className={`p-1.5 border ${styles.bg} ${styles.color} ${styles.border}`}>
                                            <Icon icon={styles.icon} className="text-xs" />
                                        </div>
                                        <span className={`text-[10px] uppercase truncate ${styles.color}`}>
                                            {tx.provider || tx.type}
                                        </span>
                                    </div>
                                    <div className="col-span-5 flex flex-col min-w-0">
                                        <span className="text-xs text-white/80 group-hover:text-white transition-colors truncate">{tx.desc}</span>
                                        <span className="text-[9px] text-white/25 uppercase truncate">{tx.source || pageData.headers.source} / {tx.status || 'posted'}</span>
                                    </div>
                                    <span className={`col-span-2 text-xs text-right font-bold tabular-nums truncate ${typeColor(tx.type)}`}>
                                        {tx.amount}
                                    </span>
                                </motion.div>
                            )
                        })}
                    </div>
                )}
            </div>

            <div className="text-[10px] text-white/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <span>TOTAL_RECORDS: <span className="tabular-nums">{entries.length}</span></span>
                <span>FILTER: {selectedProvider.toUpperCase()}</span>
                <span>LAST_UPDATE: {syncLastUpdate || '-'}</span>
            </div>

        </PageContainer>
    )
}
