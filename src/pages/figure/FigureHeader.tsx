import { Icon } from '@iconify/react'
import type { LangData } from '../../constants/lang'

interface FigureHeaderProps {
    activeCategory: string
    selectedPost: any
    isCreateFormOpen: boolean
    currentUser: any
    searchInput: string
    setSearchInput: (val: string) => void
    setSearchQuery: (val: string) => void
    sortBy: 'latest' | 'popular'
    setSortBy: (val: 'latest' | 'popular') => void
    setIsCreateFormOpen: (open: boolean) => void
    setIsAddVideoFormOpen: (open: boolean) => void
    current: LangData
    isZh: boolean
}

export function FigureHeader({
    activeCategory,
    selectedPost,
    isCreateFormOpen,
    currentUser,
    searchInput,
    setSearchInput,
    setSearchQuery,
    sortBy,
    setSortBy,
    setIsCreateFormOpen,
    setIsAddVideoFormOpen,
    current,
    isZh
}: FigureHeaderProps) {
    if (selectedPost || isCreateFormOpen) return null;

    return (
        <div className="relative overflow-hidden border border-white/10 bg-gradient-to-r from-black/60 to-zinc-900/60 p-4 sm:p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 shrink-0">
            <div className="z-10 flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    <span className={`bg-[#3c8527] text-white text-[9px] px-2 py-0.5 font-bold uppercase tracking-wider ${current.fontClass}`}>3D Print</span>
                    <span className={`text-white/40 text-[10px] ${current.fontClass}`}>v1.2.0-beta</span>
                </div>
                <h2 className={`text-lg sm:text-2xl font-extrabold text-white leading-tight ${current.fontClass}`} style={{ textShadow: '1px 1px 0px #000' }}>
                    {current.figureForum.title}
                </h2>
                <p className={`text-xs text-white/50 mt-1 max-w-2xl ${current.fontClass}`}>
                    {current.figureForum.subtitle}
                </p>
            </div>

            <div className="z-10 flex flex-wrap items-center gap-3 shrink-0 w-full lg:w-auto justify-start lg:justify-end">
                {/* Search container */}
                <div className="flex items-center gap-1.5 w-full sm:w-auto flex-1 sm:flex-initial">
                    <div className="flex items-center bg-black/40 border border-white/10 focus-within:border-white/30 transition-all p-1 w-full sm:w-48 md:w-52">
                        <input
                            type="text"
                            placeholder={activeCategory === 'videos' ? "Search videos..." : "Search discussions..."}
                            className="bg-transparent text-white px-2 py-0.5 text-xs outline-none flex-1 placeholder:text-white/30 font-pixel-hans"
                            value={searchInput}
                            onChange={e => setSearchInput(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') {
                                    setSearchQuery(searchInput);
                                }
                            }}
                        />
                        {searchInput && (
                            <button
                                onClick={() => {
                                    setSearchInput('');
                                    setSearchQuery('');
                                }}
                                className="text-white/30 hover:text-white px-1 cursor-pointer border-none bg-transparent"
                            >
                                <Icon icon="pixelarticons:close" />
                            </button>
                        )}
                    </div>
                    <button
                        onClick={() => setSearchQuery(searchInput)}
                        className={`px-3 py-1 bg-[#3c8527] hover:bg-[#4ea632] text-white border border-white/10 transition-colors font-semibold flex items-center gap-1 cursor-pointer text-xs shrink-0 ${current.fontClass}`}
                    >
                        <Icon icon="pixelarticons:search" />
                        <span>{isZh ? '搜索' : 'Search'}</span>
                    </button>
                </div>

                {/* Sorting Selector */}
                {activeCategory !== 'videos' && (
                    <div className="flex items-center">
                        <div className="flex border border-white/10 p-0.5 bg-black/20">
                            <button
                                onClick={() => setSortBy('latest')}
                                className={`px-2.5 py-1 text-[10px] font-semibold cursor-pointer transition-colors flex items-center gap-1 border-none ${sortBy === 'latest' ? 'bg-[#3c8527] text-white' : 'text-white/60 hover:text-white hover:bg-white/5'} ${current.fontClass}`}
                            >
                                <Icon icon="pixelarticons:clock" className="text-xs" />
                                <span>Latest</span>
                            </button>
                            <button
                                onClick={() => setSortBy('popular')}
                                className={`px-2.5 py-1 text-[10px] font-semibold cursor-pointer transition-colors flex items-center gap-1 border-none ${sortBy === 'popular' ? 'bg-[#3c8527] text-white' : 'text-white/60 hover:text-white hover:bg-white/5'} ${current.fontClass}`}
                            >
                                <Icon icon="pixelarticons:heart" className="text-xs" />
                                <span>Popular</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* Publish Post button */}
                {activeCategory !== 'videos' && (
                    <button
                        onClick={() => {
                            setIsCreateFormOpen(true);
                            if (activeCategory === 'showcase' || activeCategory === 'discussions') {
                                // Default new post category to active category
                                // We'll trigger category select callback if needed
                            }
                        }}
                        className={`px-3 py-1.5 bg-[#3c8527] hover:bg-[#4ea632] text-white border border-white/20 transition-all font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-md hover:scale-105 active:scale-95 text-xs ${current.fontClass}`}
                    >
                        <Icon icon="pixelarticons:plus" className="text-sm" />
                        <span>{current.figureForum.publishPost}</span>
                    </button>
                )}

                {/* Add Video button (Admin only) */}
                {activeCategory === 'videos' && currentUser?.is_admin && (
                    <button
                        onClick={() => {
                            setIsAddVideoFormOpen(true);
                        }}
                        className={`px-3 py-1.5 bg-[#3c8527] hover:bg-[#4ea632] text-white border border-white/20 transition-all font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-md hover:scale-105 active:scale-95 text-xs ${current.fontClass}`}
                    >
                        <Icon icon="pixelarticons:plus" className="text-sm" />
                        <span>{isZh ? '添加视频' : 'Add Video'}</span>
                    </button>
                )}
            </div>

            {/* Decorative cyber grid */}
            <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none w-1/3 h-full bg-[linear-gradient(to_right,rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[size:16px_16px]" />
        </div>
    )
}
