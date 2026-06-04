import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@iconify/react'
import { apiFetch } from '../utils/api'
import type { LangData } from '../constants/lang'
import { Skin2DImg } from './Skin2DImg'
import type { GenerationLogItemBrief } from '../types/log'

type DiscoverySearchResult = GenerationLogItemBrief & {
    name?: string
    creator?: {
        username?: string
    }
}

function normalizeDiscoverySearchResult(item: unknown): DiscoverySearchResult | null {
    if (!item || typeof item !== 'object') return null

    const raw = item as Record<string, unknown>
    const id = typeof raw.id === 'string' ? raw.id.trim() : ''
    const result = typeof raw.result === 'string' ? raw.result.trim() : ''
    if (!id || !result) return null

    return {
        ...(raw as Partial<DiscoverySearchResult>),
        id,
        result,
        prompt: typeof raw.prompt === 'string' ? raw.prompt : '',
        is_public: raw.is_public !== false,
    }
}

interface DiscoverySearchProps {
    current: LangData
    onSelect: (item: GenerationLogItemBrief) => void
    selectedItem?: GenerationLogItemBrief | null
}

export function DiscoverySearch({ current, onSelect, selectedItem }: DiscoverySearchProps) {
    const [query, setQuery] = useState('')
    const [isSearching, setIsSearching] = useState(false)
    const [results, setResults] = useState<DiscoverySearchResult[]>([])
    const [isOpen, setIsOpen] = useState(false)

    const [page, setPage] = useState(1)
    const [total, setTotal] = useState(0)

    const PAGE_SIZE = 15;

    const handleSearch = async (pageNum: number) => {
        const trimmedQuery = query.trim()
        if (!trimmedQuery) return

        const hasChinese = /[\u4e00-\u9fa5]/.test(trimmedQuery)
        const minLength = hasChinese ? 1 : 3
        if (trimmedQuery.length < minLength) {
            window.dispatchEvent(new CustomEvent('global-error', {
                detail: {
                    title: current.generate.notice || 'Notice',
                    message: current.discovery.searchMinLengthWarning || 'Search query must be at least 3 characters'
                }
            }))
            return
        }

        setIsSearching(true)
        setIsOpen(true)

        try {
            const res = await apiFetch(`/api/discovery/search?q=${encodeURIComponent(trimmedQuery)}&page=${pageNum}&page_size=${PAGE_SIZE}`)
            if (res.status === 429) {
                // Rate limited
                window.dispatchEvent(new CustomEvent('global-error', {
                    detail: {
                        title: current.discovery.rateLimitTitle || 'Rate Limited',
                        message: current.discovery.rateLimitMessage || 'Please wait 1s before retrying'
                    }
                }))
                setIsSearching(false)
                return
            }
            if (res.ok) {
                const data: unknown = await res.json()
                const response = data && typeof data === 'object' ? data as Record<string, unknown> : {}
                const rawItems = Array.isArray(response.items) ? response.items : []
                const safeItems = rawItems
                    .map(normalizeDiscoverySearchResult)
                    .filter((item): item is DiscoverySearchResult => item !== null)

                if (rawItems.length !== safeItems.length) {
                    console.warn(`Discovery search skipped ${rawItems.length - safeItems.length} invalid item(s)`)
                }

                setResults(safeItems)
                setTotal(typeof response.total === 'number' ? response.total : safeItems.length)
                setPage(pageNum)
            }
        } catch (e) {
            console.error('Search failed', e)
        }
        setIsSearching(false)
    }

    const totalPages = Math.ceil(total / PAGE_SIZE)

    const token = localStorage.getItem('token')
    if (!token) return null

    return (
        <>
            <div className={`flex items-center gap-1 sm:gap-2 mr-2 ${current.fontClass}`}>
                <div className="relative flex items-center bg-white border-2 border-black/10 focus-within:border-black/40 transition-all p-1 shadow-2xl">
                    <input
                        type="text"
                        placeholder={current.discovery.searchPlaceholder}
                        className="bg-transparent text-black px-2 sm:px-3 py-1 text-lg outline-none w-28 sm:w-48 focus:w-40 sm:focus:w-64 transition-all placeholder:text-black/40"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSearch(1)}
                    />
                    <button
                        onClick={() => handleSearch(1)}
                        className="text-black/60 hover:text-black cursor-pointer px-1.5 border-l border-black/10 hover:bg-black/5 transition-colors"
                    >
                        <Icon icon="pixelarticons:search" className="text-base sm:text-lg" />
                    </button>
                </div>
            </div>

            {isOpen && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 pointer-events-auto sm:px-8 sm:py-10">
                    <div className="bg-[#121212] sm:border-2 border-white/10 sm:shadow-[0_0_50px_rgba(0,0,0,0.8)] w-full h-full sm:max-w-5xl sm:max-h-[85vh] flex flex-col relative animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <button
                            className="absolute top-4 right-4 text-white/50 hover:text-white p-2 cursor-pointer bg-black/60 backdrop-blur-md border border-white/10 z-20"
                            onClick={() => setIsOpen(false)}
                        >
                            <Icon icon="pixelarticons:close" className="text-2xl" />
                        </button>

                        <div className="flex gap-4 items-center p-4 sm:p-6 pb-4 border-b border-white/10">
                            <h2 className={`text-lg sm:text-2xl text-white m-0 ${current.fontClass}`}>
                                {current.discovery.searchResult}: "{query}"
                            </h2>
                            <span className={`text-white/50 text-xs ${current.fontClass}`}>({total})</span>
                        </div>

                        <div className="flex-1 overflow-y-auto min-h-0 bg-black/20 p-3 sm:p-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4 md:gap-6 content-start custom-scrollbar">
                            {isSearching ? (
                                <div className={`col-span-full text-center text-white/50 py-32 flex flex-col items-center gap-4 ${current.fontClass}`}>
                                    <Icon icon="pixelarticons:loader" className="text-4xl animate-spin" />
                                    <span>{current.discovery.searching}</span>
                                </div>
                            ) : results.length === 0 ? (
                                <div className={`col-span-full text-center text-white/50 py-20 ${current.fontClass}`}>
                                    {current.discovery.noResults}
                                </div>
                            ) : (
                                results.map(item => (
                                    <div
                                        key={item.id}
                                        className={`relative w-full aspect-square border transition-all cursor-pointer group bg-black/40 ${selectedItem?.id === item.id ? 'border-[#4ea632] ring-1 ring-[#4ea632]/50' : 'border-white/5 hover:border-white/20'}`}
                                        onClick={() => {
                                            onSelect(item)
                                        }}
                                    >
                                        <div className="absolute inset-0 flex flex-col overflow-hidden">
                                            <div className="flex-[3] relative min-h-0 flex items-center justify-center p-3 sm:p-4">
                                                <Skin2DImg
                                                    src={item.result}
                                                    scale={5}
                                                    showRawFallback
                                                    className="max-w-full max-h-full object-contain drop-shadow-[0_0_12px_rgba(0,0,0,0.5)]"
                                                />
                                            </div>
                                            <div className={`flex-1 bg-black/40 backdrop-blur-sm border-t border-white/5 flex flex-col justify-center px-2.5 sm:px-3 min-h-0 transition-colors ${selectedItem?.id === item.id ? 'bg-[#4ea632]/20' : 'group-hover:bg-black/60'}`}>
                                                <div className={`text-[10px] sm:text-xs text-white truncate font-medium leading-tight ${current.fontClass}`}>{item.name || 'Untitled'}</div>
                                                <div className={`text-[9px] sm:text-[10px] text-white/40 truncate leading-tight mt-0.5 ${current.fontClass}`}>@{item.creator?.username || 'unknown'}</div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Pagination */}
                        {total > 0 && (
                            <div className={`p-4 bg-black/40 border-t border-white/10 flex items-center justify-between text-white/70 ${current.fontClass}`}>
                                <button
                                    disabled={page <= 1 || isSearching}
                                    onClick={() => handleSearch(page - 1)}
                                    className="px-4 py-2 bg-black border border-white/20 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 cursor-pointer transition-colors text-xs flex items-center gap-2"
                                >
                                    <Icon icon="pixelarticons:chevron-left" />
                                    <span className="hidden sm:inline">{current.discovery.prev}</span>
                                </button>

                                <span className="text-xs tracking-widest bg-black/50 px-4 py-1.5 border border-white/5 rounded-full">
                                    {page} <span className="text-white/40 mx-1">/</span> {Math.max(1, totalPages)}
                                </span>

                                <button
                                    disabled={page >= totalPages || isSearching}
                                    onClick={() => handleSearch(page + 1)}
                                    className="px-4 py-2 bg-black border border-white/20 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 cursor-pointer transition-colors text-xs flex items-center gap-2"
                                >
                                    <span className="hidden sm:inline">{current.discovery.next}</span>
                                    <Icon icon="pixelarticons:chevron-right" />
                                </button>
                            </div>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </>
    )
}
