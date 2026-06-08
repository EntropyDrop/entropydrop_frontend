import { Icon } from '@iconify/react'
import { useState, useEffect, lazy, Suspense, type ReactNode } from 'react'

import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { UserMenu } from './UserMenu'
import { ErrorModal } from './ErrorModal'

import { LoadingPlaceholder } from './LoadingPlaceholder'
import { type LangKey, type LangData } from '../constants/lang'
import type { GenerationLogItem, GenerationLogItemBrief } from '../types/log'

import { SKIN_NAV_ITEMS, FIGURE_NAV_ITEMS, TOP_NAV_ITEMS } from '../constants/nav'

// Lazy load heavy components
const DiscoveryScene = lazy(() => import('./DiscoveryScene').then(m => ({ default: m.DiscoveryScene })))
const DiscoverySearch = lazy(() => import('./DiscoverySearch').then(m => ({ default: m.DiscoverySearch })))
const MCModal = lazy(() => import('./MCModal').then(m => ({ default: m.MCModal })))

interface LayoutProps {
    children: ReactNode
    lang: LangKey
    setLang: (l: LangKey) => void
    isAuto: boolean
    setIsAuto: (a: boolean) => void
    current: LangData
}

export function Layout({ children, lang, setLang, isAuto, setIsAuto, current }: LayoutProps) {
    const location = useLocation()
    const navigate = useNavigate()
    const [selectedDiscoveryItem, setSelectedDiscoveryItem] = useState<GenerationLogItemBrief | null>(null)
    const [errorModal, setErrorModal] = useState({ isOpen: false, title: '', message: '' })
    const [isDiscoveryLoading, setIsDiscoveryLoading] = useState(false)
    const [searchParams] = useSearchParams()
    const is3DMode = searchParams.get('view') !== 'list'

    const isFigureSection = location.pathname.startsWith('/figure')
    const isSkinSection = location.pathname.startsWith('/skin') || location.pathname === '/'

    const activeSubNavItems = isFigureSection
        ? FIGURE_NAV_ITEMS
        : isSkinSection
            ? SKIN_NAV_ITEMS
            : []

    const isDiscoveryPage = location.pathname === '/skin/' || location.pathname === '/skin' || location.pathname === '/'


    useEffect(() => {
        const handleGlobalError = (e: Event) => {
            const { title, message } = (e as CustomEvent<{ title: string; message: string }>).detail
            setErrorModal({
                isOpen: true,
                title,
                message
            });
        };
        window.addEventListener('global-error', handleGlobalError);
        return () => window.removeEventListener('global-error', handleGlobalError);
    }, []);



    return (
        <div className="relative w-screen h-screen bg-[#111] overflow-x-hidden overflow-y-auto overscroll-y-none">
            {/* Top Navigation */}
            <div className="absolute top-0 left-0 right-0 z-30 py-3 sm:py-5 pointer-events-none">
                <div className="max-w-7xl mx-auto px-4 sm:px-8 flex flex-row justify-between items-center gap-4">
                    <div
                        className={`text-white text-left ${current.fontClass} flex flex-col justify-center`}
                        style={{ textShadow: '2px 2px 0px #000' }}
                    >
                        <h1 className="m-0 text-3xl sm:text-5xl leading-tight hidden sm:block">{current.title}</h1>
                        <h1 className="m-0 text-xl leading-tight sm:hidden">{current.title}</h1>
                        <h2 className="m-0 text-base sm:text-2xl text-gray-400 hidden sm:block">{current.subtitle}</h2>
                    </div>

                    <div className="flex items-center gap-4 sm:gap-6 min-w-0">
                        {/* Stacked Navigation Container */}
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                            {/* Top Row: Switcher and UserMenu */}
                            <div className="flex items-center gap-3 sm:gap-4 shrink-0 pointer-events-auto">
                                {/* First-Level Navigation Switcher */}
                                <div className="hidden lg:flex border border-white/10 p-0.5 bg-black/40 backdrop-blur-md gap-0.5">
                                    {TOP_NAV_ITEMS.map((item) => {
                                        const isCurrentSection = item.key === 'skin'
                                            ? isSkinSection
                                            : location.pathname.startsWith(item.path)
                                        return (
                                            <Link
                                                key={item.key}
                                                to={item.path}
                                                className={`px-3 py-1.5 text-[11px] sm:text-sm font-semibold cursor-pointer transition-colors flex items-center gap-1.5 sm:gap-2 no-underline border-none ${isCurrentSection
                                                    ? 'bg-[#3c8527] text-white shadow-sm'
                                                    : 'text-white/60 hover:text-white hover:bg-white/5'
                                                    } ${current.fontClass}`}
                                            >
                                                <Icon icon={item.icon} className="text-sm sm:text-base" />
                                                <span>{current.nav[item.key as keyof typeof current.nav]}</span>
                                            </Link>
                                        )
                                    })}
                                </div>

                                <UserMenu
                                    current={current}
                                    lang={lang}
                                    setLang={setLang}
                                    isAuto={isAuto}
                                    setIsAuto={setIsAuto}
                                />
                            </div>

                            {/* Second-Level Sub-Navigation */}
                            <div className="hidden lg:flex gap-5 sm:gap-7 shrink-0 pointer-events-auto items-center h-8">
                                {activeSubNavItems.map((item) => {
                                    const isActive = item.path === '/skin/'
                                        ? (location.pathname === '/skin/' || location.pathname === '/skin')
                                        : location.pathname === item.path
                                    const label = current.nav[item.key as keyof typeof current.nav]
                                    return (
                                        <Link
                                            key={item.key}
                                            to={item.path}
                                            className={`group flex items-center gap-2 text-white transition-all no-underline transform hover:scale-105 active:scale-95 ${isActive ? 'opacity-100' : 'opacity-65 hover:opacity-100'
                                                }`}
                                        >
                                            <Icon
                                                icon={item.icon}
                                                className="text-base sm:text-xl"
                                                style={{ imageRendering: 'pixelated' }}
                                            />
                                            <span className={`text-xs sm:text-base ${current.fontClass}`}>{label}</span>
                                            {isActive && (
                                                <div className="w-1.5 h-1.5 bg-green-500 animate-pulse ml-0.5" />
                                            )}
                                        </Link>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {children}
            {isDiscoveryLoading && !(isDiscoveryPage && is3DMode) && <LoadingPlaceholder current={current} className="top-24 sm:top-28 z-20" />}

            {/* Background scene */}
            <div className="absolute inset-0 z-0">
                {isDiscoveryPage && is3DMode ? (
                    <Suspense fallback={<LightweightBackground />}>
                        <DiscoveryScene
                            selected={selectedDiscoveryItem}
                            onSelect={setSelectedDiscoveryItem}
                            onLoading={setIsDiscoveryLoading}
                        />
                    </Suspense>
                ) : (
                    <LightweightBackground />
                )}
            </div>

            {isDiscoveryPage && is3DMode && (
                <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 z-30 pointer-events-auto shadow-2xl">
                    <Suspense fallback={null}>
                        <DiscoverySearch current={current} onSelect={setSelectedDiscoveryItem} selectedItem={selectedDiscoveryItem} />
                    </Suspense>
                </div>
            )}

            {selectedDiscoveryItem && (
                <Suspense fallback={null}>
                    <MCModal
                        item={selectedDiscoveryItem as GenerationLogItem}
                        closeModal={() => setSelectedDiscoveryItem(null)}
                        textureUrl={selectedDiscoveryItem.result}
                        current={current}
                        onEdit={(isPublic: boolean) => {
                            setSelectedDiscoveryItem(null);
                            navigate('/skin/edit', { state: { textureUrl: selectedDiscoveryItem.result, passedLogId: selectedDiscoveryItem.id, isPublic } });
                        }}
                        onAiEdit={(source: string, id: string, isPublic: boolean, sourceType?: 'source' | 'intermediate') => {
                            setSelectedDiscoveryItem(null);
                            navigate('/skin/generate', { state: { sourceImage: source, sourceId: id, mode: 'aigc_image_edit_to_skin', isPublic, sourceType } });
                        }}
                    />
                </Suspense>
            )}

            <ErrorModal
                isOpen={errorModal.isOpen}
                title={errorModal.title}
                message={errorModal.message}
                onClose={() => setErrorModal({ ...errorModal, isOpen: false })}
                current={current}
            />


        </div>

    )
}

function LightweightBackground() {
    return (
        <div className="absolute inset-0 bg-[#111]">
            <div className="absolute inset-0 opacity-25 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.7)_1px,transparent_1.5px)] bg-[length:32px_32px]" />
        </div>
    )
}
