import { useNavigate } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { type LangData } from '../constants/lang'

interface FixedAssetsPageProps {
    current: LangData
}

interface AssetRecord {
    id: string
    name: string
    type: 'compute' | 'hardware' | 'infrastructure'
    status: string
    value: string
}

const assets: AssetRecord[] = []

export function FixedAssetsPage({ current }: FixedAssetsPageProps) {
    const navigate = useNavigate()
    const pageData = current.public_page.assets_pages?.fixed_assets || {}

    const categoryCounts = assets.reduce<Record<string, number>>((acc, asset) => {
        acc[asset.type] = (acc[asset.type] || 0) + 1
        return acc
    }, {})

    const categories = [
        { key: 'compute', label: pageData.categories?.compute, icon: 'pixelarticons:device-laptop', color: 'text-blue-400' },
        { key: 'hardware', label: pageData.categories?.hardware, icon: 'pixelarticons:device-phone', color: 'text-green-400' },
        { key: 'infrastructure', label: pageData.categories?.infrastructure, icon: 'pixelarticons:buildings', color: 'text-purple-400' },
    ]

    return (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-4 sm:p-8 lg:p-12 pt-28 lg:pt-32 box-border overflow-y-auto pointer-events-none">
            <div className="w-full max-w-5xl h-full flex flex-col gap-6 bg-black/60 backdrop-blur-xl p-6 sm:p-10 border border-white/10 overflow-y-auto custom-scrollbar pointer-events-auto text-white animate-in fade-in slide-in-from-bottom-4 duration-500">
                <button
                    onClick={() => navigate('/skin/public')}
                    className="flex items-center gap-2 text-white/50 hover:text-green-500 transition-colors self-start group"
                >
                    <Icon icon="pixelarticons:arrow-left" className="text-xl transform group-hover:-translate-x-1 transition-transform" />
                    <span className="text-xs font-mono uppercase tracking-widest">Back to Mission</span>
                </button>

                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3 text-blue-400">
                        <Icon icon="pixelarticons:briefcase" className="text-3xl" />
                        <h1 className={`text-2xl sm:text-3xl font-bold ${current.fontClass}`}>{pageData.title}</h1>
                    </div>
                    <p className={`text-white/60 text-sm sm:text-base max-w-2xl ${current.fontClass}`}>
                        {pageData.desc}
                    </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {categories.map((cat) => (
                        <div key={cat.key} className="bg-white/5 border border-white/10 p-4 flex items-center gap-4">
                            <div className={`w-10 h-10 flex items-center justify-center bg-white/5 border border-white/10 ${cat.color}`}>
                                <Icon icon={cat.icon} className="text-xl" />
                            </div>
                            <div className="flex flex-col min-w-0">
                                <span className="text-[10px] text-white/40 uppercase tracking-widest font-mono truncate">{cat.label}</span>
                                <span className="text-sm font-bold text-white">{categoryCounts[cat.key] || 0} {pageData.records}</span>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex-1 overflow-hidden border border-white/10 bg-white/5 flex flex-col min-h-[400px]">
                    <div className="grid grid-cols-4 p-4 border-b border-white/10 bg-white/5 text-[10px] font-mono text-white/40 uppercase tracking-widest">
                        <span>{pageData.list_headers?.item}</span>
                        <span>{pageData.list_headers?.type}</span>
                        <span>{pageData.list_headers?.status}</span>
                        <span className="text-right">{pageData.list_headers?.value}</span>
                    </div>
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 min-h-[320px] text-white/35">
                        <Icon icon="pixelarticons:info-box" className="text-3xl" />
                        <span className={`text-xs font-mono uppercase tracking-widest text-center ${current.fontClass}`}>
                            {pageData.empty}
                        </span>
                    </div>
                </div>

                <div className="text-[10px] text-white/20 font-mono flex items-center gap-2">
                    <Icon icon="pixelarticons:info-box" />
                    <span>{pageData.source}</span>
                </div>
            </div>
        </div>
    )
}
