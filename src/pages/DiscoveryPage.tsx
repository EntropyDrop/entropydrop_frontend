import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { apiFetch } from '../utils/api'
import { Skin2DImg } from '../components/Skin2DImg'
import { MCModal } from '../components/MCModal'
import type { GenerationLogItemBrief, GenerationLogItem } from '../types/log'
import type { LangData } from '../constants/lang'

interface DiscoveryPageProps {
    current: LangData
}

export function DiscoveryPage({ current }: DiscoveryPageProps) {
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()
    const viewMode = searchParams.get('view') === '3d' ? '3d' : 'list'

    // List mode states
    const [items, setItems] = useState<GenerationLogItem[]>([])
    const [searchQuery, setSearchQuery] = useState('')
    const [sortBy, setSortBy] = useState<'created_at' | 'likes'>('created_at')
    const [page, setPage] = useState(1)
    const [total, setTotal] = useState(0)
    const [isLoading, setIsLoading] = useState(false)
    const [selectedItem, setSelectedItem] = useState<GenerationLogItem | GenerationLogItemBrief | null>(null)

    const PAGE_SIZE = 24

    const handleSearch = async (pageNum: number) => {
        const trimmedQuery = searchQuery.trim()
        if (trimmedQuery) {
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
        }

        setIsLoading(true)
        try {
            let url = `/api/discovery/search?page=${pageNum}&page_size=${PAGE_SIZE}&sort_by=${sortBy}`
            if (trimmedQuery) {
                url += `&q=${encodeURIComponent(trimmedQuery)}`
            }
            const res = await apiFetch(url)
            if (res.status === 429) {
                window.dispatchEvent(new CustomEvent('global-error', {
                    detail: {
                        title: current.discovery.rateLimitTitle || 'Rate Limited',
                        message: current.discovery.rateLimitMessage || 'Please wait 1s before retrying'
                    }
                }))
                setIsLoading(false)
                return
            }
            if (res.ok) {
                const data = await res.json()
                setItems(data.items || [])
                setTotal(data.total || 0)
                setPage(pageNum)
            }
        } catch (e) {
            console.error('Fetch discovery failed', e)
        }
        setIsLoading(false)
    }

    // Load initial list, or reload when sorting changes
    useEffect(() => {
        if (viewMode === 'list') {
            handleSearch(1)
        }
    }, [sortBy, viewMode])

    // Deep linking for selection
    useEffect(() => {
        const id = searchParams.get('id')
        if (id && (!selectedItem || selectedItem.id !== id)) {
            setSelectedItem({ id, result: '', is_public: true, prompt: '' })
        }
    }, [searchParams])

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search)
        if (selectedItem) {
            urlParams.set('id', selectedItem.id)
        } else {
            urlParams.delete('id')
        }
        window.history.replaceState({}, '', `${window.location.pathname}?${urlParams.toString()}`)
    }, [selectedItem])

    const handleCloseModal = async () => {
        if (selectedItem) {
            try {
                const res = await apiFetch(`/api/logs/${selectedItem.id}`)
                if (res.ok) {
                    const data = await res.json()
                    setItems(prev => prev.map(x => x.id === selectedItem.id ? {
                        ...x,
                        name: data.name,
                        likes_count: data.likes_count,
                        is_liked: data.is_liked
                    } : x))
                }
            } catch (e) {
                console.error("Failed to sync item stats on close", e)
            }
        }
        setSelectedItem(null)
    }

    const handleLike = async (item: GenerationLogItem) => {
        const token = localStorage.getItem('token')
        if (!token) {
            window.dispatchEvent(new CustomEvent('global-error', {
                detail: {
                    title: current.generate.notice || 'Notice',
                    message: current.common.authRequired || 'Please login'
                }
            }))
            return
        }

        try {
            const response = await apiFetch(`/api/like/${item.id}`, {
                method: 'POST'
            })

            if (response.ok) {
                const data = await response.json()
                const isLikedNow = data.action === 'liked'
                const newCount = data.likes_count
                setItems(prev => prev.map(x => x.id === item.id ? { ...x, is_liked: isLikedNow, likes_count: newCount } : x))
            }
        } catch (e) {
            console.error('Failed to like', e)
        }
    }

    const totalPages = Math.ceil(total / PAGE_SIZE)

    // Render 3D Mode view (only renders switcher overlay since background canvas is in Layout)
    if (viewMode === '3d') {
        return (
            <div className="absolute top-24 right-4 sm:right-8 z-30 pointer-events-auto">
                <button
                    onClick={() => setSearchParams({ view: 'list' })}
                    className={`px-3 py-1.5 bg-black/60 backdrop-blur-md hover:bg-black/85 text-white border border-white/10 rounded-sm flex items-center gap-1.5 text-xs transition-colors cursor-pointer ${current.fontClass}`}
                >
                    <Icon icon="pixelarticons:list" className="text-base" />
                    <span>{current.discovery.modeList}</span>
                </button>
            </div>
        )
    }

    return (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-2 sm:p-8 lg:p-12 pt-20 sm:pt-24 lg:pt-32 box-border overflow-y-auto pointer-events-none">
            <div className="w-full max-w-7xl h-full flex flex-col gap-6 bg-black/40 backdrop-blur-md p-4 sm:p-8 border border-white/10 overflow-y-auto custom-scrollbar pointer-events-auto relative text-white animate-in fade-in duration-300">

                {/* Header Bar with Controls */}
                <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 border-b border-white/10 pb-6 shrink-0">
                    {/* Left: Search input */}
                    <div className="flex flex-1 items-center gap-2">
                        <div className="relative flex-1 max-w-md flex items-center bg-black/40 border border-white/10 focus-within:border-white/30 transition-all p-1">
                            <input
                                type="text"
                                placeholder={current.discovery.searchPlaceholder}
                                className="bg-transparent text-white px-2 py-1 text-xs outline-none flex-1 placeholder:text-white/30 font-pixel-hans"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSearch(1)}
                            />
                            <button
                                onClick={() => handleSearch(1)}
                                className="text-white/50 hover:text-white cursor-pointer px-2 border-l border-white/10 hover:bg-white/5 transition-colors"
                            >
                                <Icon icon="pixelarticons:search" className="text-sm" />
                            </button>
                        </div>
                    </div>

                    {/* Right: Sorting and View Toggle */}
                    <div className="flex flex-wrap items-center gap-3">
                        {/* Sorting Tab Group */}
                        <div className="flex border border-white/10 p-0.5 bg-black/20">
                            <button
                                onClick={() => setSortBy('created_at')}
                                className={`px-3 py-1 text-xs font-medium cursor-pointer transition-colors flex items-center gap-1.5 ${sortBy === 'created_at' ? 'bg-[#3c8527] text-white' : 'text-white/60 hover:text-white hover:bg-white/5'} ${current.fontClass}`}
                            >
                                <Icon icon="pixelarticons:clock" className="text-sm" />
                                {current.discovery.sortByTime}
                            </button>
                            <button
                                onClick={() => setSortBy('likes')}
                                className={`px-3 py-1 text-xs font-medium cursor-pointer transition-colors flex items-center gap-1.5 ${sortBy === 'likes' ? 'bg-[#3c8527] text-white' : 'text-white/60 hover:text-white hover:bg-white/5'} ${current.fontClass}`}
                            >
                                <Icon icon="pixelarticons:heart" className="text-sm" />
                                {current.discovery.sortByLikes}
                            </button>
                        </div>

                        {/* View Switcher Button */}
                        <button
                            onClick={() => setSearchParams({ view: '3d' })}
                            className={`px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white border border-white/10 flex items-center gap-1.5 text-xs transition-colors cursor-pointer ${current.fontClass}`}
                        >
                            <Icon icon="pixelarticons:sun" className="text-base text-yellow-500/80" />
                            <span>{current.discovery.mode3D}</span>
                        </button>
                    </div>
                </div>

                {/* Main Content Grid */}
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 min-h-0">
                    {isLoading ? (
                        <div className={`text-center text-white/50 py-32 flex flex-col items-center gap-4 ${current.fontClass}`}>
                            <Icon icon="pixelarticons:loader" className="text-4xl animate-spin" />
                            <span>{current.discovery.searching}</span>
                        </div>
                    ) : items.length === 0 ? (
                        <div className={`text-center text-white/40 py-32 ${current.fontClass}`}>
                            {current.discovery.noResults}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
                            {items.map(item => (
                                <div
                                    key={item.id}
                                    className={`relative w-full aspect-square border transition-all cursor-pointer group bg-black/40 flex flex-col overflow-hidden ${selectedItem?.id === item.id ? 'border-[#4ea632] ring-1 ring-[#4ea632]/50' : 'border-white/5 hover:border-white/20'}`}
                                    onClick={() => setSelectedItem(item)}
                                >
                                    {/* Skin 2D Preview Container */}
                                    <div className="flex-[3] relative min-h-0 flex items-center justify-center p-3 sm:p-4">
                                        <Skin2DImg
                                            src={item.result}
                                            scale={5}
                                            showRawFallback
                                            className="max-w-full max-h-full object-contain drop-shadow-[0_0_12px_rgba(0,0,0,0.5)] transform group-hover:scale-110 transition-transform duration-200"
                                        />
                                    </div>

                                    {/* Bottom Information Row */}
                                    <div className={`flex-1 bg-black/50 backdrop-blur-sm border-t border-white/5 flex items-center justify-between px-2.5 sm:px-3 py-1.5 min-h-0 transition-colors ${selectedItem?.id === item.id ? 'bg-[#4ea632]/25' : 'group-hover:bg-black/70'}`}>
                                        <div className="min-w-0 flex-1 pr-1.5">
                                            <div className={`text-[10px] sm:text-xs text-white truncate font-medium leading-tight ${current.fontClass}`}>
                                                {item.name || 'Untitled'}
                                            </div>
                                            <div className={`text-[9px] sm:text-[10px] text-white/40 truncate leading-tight mt-0.5 ${current.fontClass}`}>
                                                @{item.creator?.username || 'unknown'}
                                            </div>
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                handleLike(item)
                                            }}
                                            className="flex items-center gap-1.5 text-white/40 hover:text-red-500 transition-colors cursor-pointer select-none"
                                        >
                                            <Icon
                                                icon={item.is_liked ? "pixelarticons:heart" : "pixelarticons:heart"}
                                                className={`text-sm ${item.is_liked ? 'text-red-500' : 'text-white/40 group-hover:text-red-400/60'}`}
                                            />
                                            <span className={`text-[9px] sm:text-[10px] font-mono ${item.is_liked ? 'text-red-500' : 'text-white/40'}`}>
                                                {item.likes_count || 0}
                                            </span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Pagination Controls */}
                {!isLoading && totalPages > 1 && (
                    <div className={`pt-4 border-t border-white/10 flex items-center justify-between text-white/70 shrink-0 ${current.fontClass}`}>
                        <button
                            disabled={page <= 1 || isLoading}
                            onClick={() => handleSearch(page - 1)}
                            className="px-4 py-2 bg-black/60 border border-white/20 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 cursor-pointer transition-colors text-xs flex items-center gap-2 "
                        >
                            <Icon icon="pixelarticons:chevron-left" />
                            <span className="hidden sm:inline">{current.discovery.prev}</span>
                        </button>

                        <span className="text-xs tracking-widest bg-black/50 px-4 py-1.5 border border-white/5">
                            {page} <span className="text-white/40 mx-1">/</span> {Math.max(1, totalPages)}
                        </span>

                        <button
                            disabled={page >= totalPages || isLoading}
                            onClick={() => handleSearch(page + 1)}
                            className="px-4 py-2 bg-black/60 border border-white/20 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 cursor-pointer transition-colors text-xs flex items-center gap-2"
                        >
                            <span className="hidden sm:inline">{current.discovery.next}</span>
                            <Icon icon="pixelarticons:chevron-right" />
                        </button>
                    </div>
                )}
            </div>

            {/* Skin Detail Modal Overlay */}
            {selectedItem && (
                <MCModal
                    item={selectedItem as GenerationLogItem}
                    closeModal={handleCloseModal}
                    textureUrl={selectedItem.result}
                    current={current}
                    onEdit={(isPublic: boolean) => {
                        setSelectedItem(null)
                        navigate('/skin/edit', { state: { textureUrl: selectedItem.result, passedLogId: selectedItem.id, isPublic } })
                    }}
                    onAiEdit={(source: string, id: string, isPublic: boolean, sourceType?: 'source' | 'intermediate') => {
                        setSelectedItem(null)
                        navigate('/skin/generate', { state: { sourceImage: source, sourceId: id, mode: 'aigc_image_edit_to_skin', isPublic, sourceType } })
                    }}
                />
            )}
        </div>
    )
}
