import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { type LangData } from '../constants/lang'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { apiFetch } from '../utils/api'

interface FinancialsPageProps {
    current: LangData
}

interface LedgerEntry {
    date: string
    type: 'revenue' | 'expense'
    provider?: string
    category?: string
    amount?: string
    amount_value?: number
}

interface LedgerResponse {
    entries?: LedgerEntry[]
    sync?: {
        generated_at?: string
        paypal?: { last_synced_at?: string | null }
        aws?: { last_synced_at?: string | null }
    }
}

function parseAmount(value: unknown) {
    if (typeof value === 'number') return value
    if (!value) return 0
    const cleaned = String(value).replace('$', '').replace(',', '').replace('+', '').trim()
    const parsed = Number.parseFloat(cleaned)
    return Number.isFinite(parsed) ? parsed : 0
}

function formatMoney(value: number) {
    const sign = value < 0 ? '-' : ''
    return `${sign}$${Math.abs(value).toFixed(2)}`
}

function monthKey(date: string) {
    return date?.slice(0, 7) || 'unknown'
}

function displayName(value?: string) {
    if (!value) return 'Other'
    if (value === 'paypal') return 'PayPal'
    if (value === 'aws') return 'AWS'
    return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

const pieColors = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#a855f7', '#14b8a6']

export function FinancialsPage({ current }: FinancialsPageProps) {
    const navigate = useNavigate()
    const pageData = current.open_page.assets_pages?.financials || {}
    const [entries, setEntries] = useState<LedgerEntry[]>([])
    const [lastUpdate, setLastUpdate] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        let active = true
        async function fetchLedger() {
            try {
                const response = await apiFetch('/api/open/ledger')
                if (!response.ok) return
                const data: LedgerResponse = await response.json()
                if (!active) return
                setEntries(data.entries || [])
                setLastUpdate(
                    data.sync?.paypal?.last_synced_at
                    || data.sync?.aws?.last_synced_at
                    || data.sync?.generated_at
                    || null
                )
            } catch (err) {
                console.error('Failed to load financial ledger:', err)
            } finally {
                if (active) setIsLoading(false)
            }
        }
        fetchLedger()
        return () => { active = false }
    }, [])

    const financials = useMemo(() => {
        const trendMap = new Map<string, { name: string; revenue: number; expenditure: number }>()
        const revenueMap = new Map<string, number>()
        const expenseMap = new Map<string, number>()

        let revenue = 0
        let expenditure = 0

        entries.forEach((entry) => {
            const amount = parseAmount(entry.amount_value ?? entry.amount)
            const key = monthKey(entry.date)
            const trendRow = trendMap.get(key) || { name: key, revenue: 0, expenditure: 0 }

            if (amount >= 0) {
                revenue += amount
                trendRow.revenue += amount
                const source = displayName(entry.provider || entry.category)
                revenueMap.set(source, (revenueMap.get(source) || 0) + amount)
            } else {
                const abs = Math.abs(amount)
                expenditure += abs
                trendRow.expenditure += abs
                const source = displayName(entry.provider || entry.category)
                expenseMap.set(source, (expenseMap.get(source) || 0) + abs)
            }

            trendMap.set(key, trendRow)
        })

        const toPie = (source: Map<string, number>) => Array.from(source.entries())
            .map(([name, value], index) => ({ name, value: Number(value.toFixed(2)), color: pieColors[index % pieColors.length] }))

        return {
            revenue,
            expenditure,
            net: revenue - expenditure,
            trend: Array.from(trendMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
            revenueBreakdown: toPie(revenueMap),
            expenditureBreakdown: toPie(expenseMap),
        }
    }, [entries])

    const hasEntries = entries.length > 0

    const stats = [
        { label: pageData.stats?.net_profit, value: hasEntries ? formatMoney(financials.net) : pageData.empty?.value, icon: 'pixelarticons:trending-up', color: financials.net >= 0 ? 'text-yellow-400' : 'text-red-400' },
        { label: pageData.stats?.revenue, value: hasEntries ? formatMoney(financials.revenue) : pageData.empty?.value, icon: 'pixelarticons:dollar', color: 'text-green-500' },
        { label: pageData.stats?.expenditure, value: hasEntries ? formatMoney(financials.expenditure) : pageData.empty?.value, icon: 'pixelarticons:cart', color: 'text-red-400' },
        { label: pageData.stats?.runway, value: pageData.empty?.value, icon: 'pixelarticons:calendar', color: 'text-white/45' },
    ]

    return (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-4 sm:p-8 lg:p-12 pt-28 lg:pt-32 box-border overflow-y-auto pointer-events-none">
            <div className="w-full max-w-6xl h-full flex flex-col gap-8 bg-black/60 backdrop-blur-xl p-6 sm:p-10 border border-white/10 overflow-y-auto custom-scrollbar pointer-events-auto text-white animate-in fade-in slide-in-from-bottom-4 duration-500">
                <button
                    onClick={() => navigate('/skin/open')}
                    className="flex items-center gap-2 text-white/50 hover:text-green-500 transition-colors self-start group"
                >
                    <Icon icon="pixelarticons:arrow-left" className="text-xl transform group-hover:-translate-x-1 transition-transform" />
                    <span className="text-xs font-mono uppercase tracking-widest">Back to Mission</span>
                </button>

                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3 text-green-500">
                        <Icon icon="pixelarticons:chart-add" className="text-3xl" />
                        <h1 className={`text-2xl sm:text-3xl font-bold ${current.fontClass}`}>{pageData.title}</h1>
                    </div>
                    <p className={`text-white/60 text-sm sm:text-base max-w-2xl ${current.fontClass}`}>
                        {pageData.desc}
                    </p>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {stats.map((stat, i) => (
                        <div key={i} className="bg-white/5 border border-white/10 p-4 flex flex-col gap-1 hover:bg-white/10 transition-all">
                            <div className="flex items-center gap-2 text-white/40 mb-1">
                                <Icon icon={stat.icon} className="text-sm" />
                                <span className="text-[10px] uppercase tracking-wider font-mono truncate">{stat.label}</span>
                            </div>
                            <span className={`text-xl font-bold font-mono ${stat.color}`}>{stat.value || '-'}</span>
                        </div>
                    ))}
                </div>

                <div className="bg-white/5 border border-white/10 p-6 flex flex-col gap-6">
                    <div className="flex justify-between items-center border-b border-white/5 pb-4">
                        <h3 className="text-sm font-mono text-white/40 uppercase tracking-widest">{pageData.charts?.trend}</h3>
                        <span className="text-[10px] text-white/30 font-mono uppercase">{pageData.source}</span>
                    </div>
                    <div className="h-[300px] w-full">
                        {isLoading ? (
                            <div className="h-full flex items-center justify-center text-xs font-mono text-green-500/80 uppercase animate-pulse">
                                Loading verified ledger...
                            </div>
                        ) : !hasEntries ? (
                            <div className="h-full flex flex-col items-center justify-center gap-3 text-white/35">
                                <Icon icon="pixelarticons:info-box" className="text-3xl" />
                                <span className="text-xs font-mono uppercase tracking-widest">{pageData.empty?.financials}</span>
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={financials.trend}>
                                    <defs>
                                        <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2}/>
                                            <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                                        </linearGradient>
                                        <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#f87171" stopOpacity={0.2}/>
                                            <stop offset="95%" stopColor="#f87171" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                                    <XAxis dataKey="name" stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                                    <YAxis stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `$${Number(v) / 1000}k`} />
                                    <Tooltip contentStyle={{ backgroundColor: '#000', border: '1px solid #ffffff20', borderRadius: '0px' }} />
                                    <Area type="monotone" dataKey="revenue" stroke="#22c55e" fill="url(#colorRev)" strokeWidth={2} />
                                    <Area type="monotone" dataKey="expenditure" stroke="#f87171" fill="url(#colorExp)" strokeWidth={2} />
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {[
                        { title: pageData.charts?.revenue_breakdown, data: financials.revenueBreakdown },
                        { title: pageData.charts?.expenditure_breakdown, data: financials.expenditureBreakdown },
                    ].map((chart) => (
                        <div key={chart.title} className="bg-white/5 border border-white/10 p-6 flex flex-col gap-4">
                            <h3 className="text-sm font-mono text-white/40 uppercase tracking-widest">{chart.title}</h3>
                            <div className="h-[250px]">
                                {!hasEntries || chart.data.length === 0 ? (
                                    <div className="h-full flex items-center justify-center text-xs font-mono text-white/35 uppercase tracking-widest">
                                        {pageData.empty?.breakdown}
                                    </div>
                                ) : (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={chart.data} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                                                {chart.data.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                                            </Pie>
                                            <Tooltip contentStyle={{ backgroundColor: '#000', border: '1px solid #ffffff20', borderRadius: '0px' }} />
                                            <Legend verticalAlign="bottom" formatter={(v) => <span className="text-[10px] font-mono text-white/40">{v}</span>} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="text-[10px] text-white/20 font-mono flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Icon icon="pixelarticons:info-box" />
                        <span>{pageData.source}</span>
                    </div>
                    <span>LAST_UPDATE: {lastUpdate || pageData.empty?.value}</span>
                </div>
            </div>
        </div>
    )
}
