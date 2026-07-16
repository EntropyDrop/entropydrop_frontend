import { type LangData } from '../constants/lang'

interface RouteLoadingSkeletonProps {
    current: LangData
}

const skeletonCards = Array.from({ length: 4 })
const skeletonRows = Array.from({ length: 3 })

export function RouteLoadingSkeleton({ current }: RouteLoadingSkeletonProps) {
    const loadingText = current.lang === 'zh-hans' ? '页面加载中...' : 'Loading page...'

    return (
        <div
            className="absolute inset-0 z-50 bg-[#111]/95 backdrop-blur-sm pointer-events-auto overflow-hidden p-1 sm:p-2 lg:p-3 pt-20 sm:pt-28 lg:pt-32"
            role="status"
            aria-live="polite"
            aria-label={loadingText}
        >
            <span className="sr-only">{loadingText}</span>
            <div className="w-full max-w-7xl mx-auto border border-white/10 bg-black/40 p-4 sm:p-6 flex flex-col gap-6 animate-in fade-in duration-150">
                <div className="flex items-center gap-4">
                    <div className="skeleton-shimmer w-11 h-11 shrink-0" />
                    <div className="flex-1 flex flex-col gap-2.5">
                        <div className="skeleton-shimmer h-5 w-44 max-w-[55%]" />
                        <div className="skeleton-shimmer h-2.5 w-72 max-w-[80%]" />
                    </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    {skeletonCards.map((_, index) => (
                        <div key={index} className="border border-white/5 bg-white/[0.025] p-4 flex flex-col gap-3">
                            <div className="skeleton-shimmer h-2.5 w-16" />
                            <div className="skeleton-shimmer h-7 w-24 max-w-full" />
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">
                    <div className="lg:col-span-2 border border-white/5 bg-white/[0.025] p-4 flex flex-col gap-4 min-h-48 sm:min-h-64">
                        <div className="skeleton-shimmer h-3 w-36" />
                        <div className="skeleton-shimmer flex-1 min-h-36" />
                    </div>
                    <div className="border border-white/5 bg-white/[0.025] p-4 flex flex-col gap-4">
                        <div className="skeleton-shimmer h-3 w-28" />
                        {skeletonRows.map((_, index) => (
                            <div key={index} className="flex items-center gap-3">
                                <div className="skeleton-shimmer w-9 h-9 shrink-0" />
                                <div className="flex-1 flex flex-col gap-2">
                                    <div className="skeleton-shimmer h-2.5 w-4/5" />
                                    <div className="skeleton-shimmer h-2 w-1/2" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
