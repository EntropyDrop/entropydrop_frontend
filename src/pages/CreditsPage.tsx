import { PageContainer } from '../components/PageContainer';
import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { type LangData } from '../constants/lang'
import { motion } from 'framer-motion'
import { apiFetch } from '../utils/api'

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

    // Load user profile & credits balance
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

    // Load credit logs
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
        fetchUser()
        fetchHistory(page)
    }, [page])

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
    const formatActionName = (action: string) => {
        if (current.lang === 'zh-hans') {
            if (action === 'daily_login') return '每日登录奖励'
            if (action === 'monthly_login') return '每月登录奖励'
            if (action === 'generation') return '皮肤生成'
            if (action === 'refund') return '失败退款'
            return action
        } else {
            if (action === 'daily_login') return 'Daily Login'
            if (action === 'monthly_login') return 'Monthly Login'
            if (action === 'generation') return 'Generation'
            if (action === 'refund') return 'Refund'
            return action
        }
    }

    const totalPages = Math.ceil(total / pageSize)

    return (
        <PageContainer
            bg="bg-black/60 backdrop-blur-xl"
            animate="animate-in fade-in slide-in-from-bottom-4 duration-500"
            className={current.fontClass}
        >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mt-2">
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3 text-[#a6df7a]">
                        <Icon icon="pixelarticons:zap" className="text-3xl animate-pulse" />
                        <h1 className="text-2xl sm:text-3xl font-bold">
                            {current.lang === 'zh-hans' ? 'Credit 额度详情' : 'Credit Balance Details'}
                        </h1>
                    </div>
                    <p className="text-white/60 text-sm max-w-xl">
                        {current.lang === 'zh-hans' 
                            ? '查看您的 Credit 额度增加和消费记录。额度用于生成独一无二的皮肤模型。' 
                            : 'View your credit logs, including balance increases and generation consumption.'}
                    </p>
                </div>

                {/* Balance Card */}
                <div className="border border-white/10 bg-white/5 p-4 flex flex-col justify-between min-w-[200px] shrink-0">
                    <span className="text-[10px] text-white/40 uppercase tracking-wider">
                        {current.lang === 'zh-hans' ? '当前余额' : 'Current Balance'}
                    </span>
                    <span className="text-3xl font-bold text-[#a6df7a] tabular-nums mt-1 flex items-center gap-2">
                        <Icon icon="pixelarticons:zap" className="text-2xl" />
                        {user?.credits ?? 0}
                    </span>
                </div>
            </div>

            <div className="flex-1 overflow-hidden border border-white/10 bg-white/5 flex flex-col min-h-[450px] mt-4">
                <div className="grid grid-cols-12 gap-3 p-4 border-b border-white/10 bg-white/5 text-[10px] text-white/40 uppercase tracking-widest">
                    <span className="col-span-3">{current.lang === 'zh-hans' ? '时间' : 'Time'}</span>
                    <span className="col-span-3">{current.lang === 'zh-hans' ? '类型' : 'Type'}</span>
                    <span className="col-span-4">{current.lang === 'zh-hans' ? '来源 / 详情' : 'Source / Description'}</span>
                    <span className="col-span-2 text-right">{current.lang === 'zh-hans' ? '变动额度' : 'Amount'}</span>
                </div>

                {isLoading ? (
                    <div className="flex-1 flex flex-col justify-center items-center gap-3 min-h-[300px]">
                        <Icon icon="pixelarticons:reload" className="text-4xl text-[#a6df7a] animate-spin" />
                        <span className="text-xs tracking-widest text-[#a6df7a]/80 animate-pulse uppercase">
                            {current.lang === 'zh-hans' ? '正在读取记录...' : 'Loading transactions...'}
                        </span>
                    </div>
                ) : items.length === 0 ? (
                    <div className="flex-1 flex flex-col justify-center items-center gap-3 min-h-[300px] text-white/35">
                        <Icon icon="pixelarticons:info-box" className="text-3xl" />
                        <span className="text-xs tracking-widest uppercase">
                            {current.lang === 'zh-hans' ? '暂无额度变动记录' : 'No credit logs found'}
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

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="p-2 flex justify-between items-center text-[10px] font-pixel-hans text-white/60">
                    <button
                        type="button"
                        disabled={page === 1}
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        className="px-3 py-1 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none border border-white/10 cursor-pointer text-white hover:text-white transition-colors flex items-center gap-1.5"
                    >
                        <Icon icon="pixelarticons:chevron-left" />
                        <span>{current.lang === 'zh-hans' ? '上一页' : 'PREV'}</span>
                    </button>
                    <span className="select-none">
                        {current.lang === 'zh-hans' 
                            ? `第 ${page} 页 / 共 ${totalPages} 页` 
                            : `PAGE ${page} OF ${totalPages}`}
                    </span>
                    <button
                        type="button"
                        disabled={page >= totalPages}
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        className="px-3 py-1 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none border border-white/10 cursor-pointer text-white hover:text-white transition-colors flex items-center gap-1.5"
                    >
                        <span>{current.lang === 'zh-hans' ? '下一页' : 'NEXT'}</span>
                        <Icon icon="pixelarticons:chevron-right" />
                    </button>
                </div>
            )}
        </PageContainer>
    )
}
