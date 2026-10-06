import { PageContainer } from '../../components/PageContainer'
import { Icon } from '@iconify/react'
import { Skin2DImg } from '../../components/Skin2DImg'
import type { LangData } from '../../constants/lang'
import type { ModelSeries } from '../../types/discovery'
import type { GenerationLogItemBrief } from '../../types/log'
import type { DiscoverySearchController } from './useDiscoverySearch'

export function DiscoveryListView({ current, search, selectedItem, onSelect, onView3D }: {
    current: LangData; search: DiscoverySearchController; selectedItem: GenerationLogItemBrief | null
    onSelect: (item: GenerationLogItemBrief) => void; onView3D: () => void
}) {
    const { query: searchQuery, setQuery: setSearchQuery, items, sortBy, setSortBy, modelSeries, setModelSeries, page, totalPages, isLoading, handleSearch, handleLike } = search
    return <PageContainer className="relative">
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
                    <select
                        aria-label={current.discovery.modelSeries}
                        value={modelSeries}
                        onChange={e => setModelSeries(e.target.value as ModelSeries)}
                        className={`bg-black/40 border border-white/10 px-3 py-2 text-white text-xs outline-none focus:border-[#3c8527] transition-colors cursor-pointer ${current.fontClass}`}
                    >
                        <option value="">{current.discovery.allModelSeries}</option>
                        <option value="SKING_DDJ">SKING_DDJ</option>
                        <option value="sking">sking</option>
                    </select>
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
                        onClick={() => onView3D()}
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
                                onClick={() => onSelect(item)}
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

    </PageContainer>
}
