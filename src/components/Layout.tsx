import { Icon } from '@iconify/react'
import { useState, useEffect, lazy, Suspense, type ReactNode } from 'react'

import { Link, useLocation, useNavigate } from 'react-router-dom'
import { UserMenu } from './UserMenu'
import { ErrorModal } from './ErrorModal'

import { LoadingPlaceholder } from './LoadingPlaceholder'
import { type LangKey, type LangData } from '../constants/lang'
import type { GenerationLogItem, GenerationLogItemBrief } from '../types/log'

import { NAV_ITEMS } from '../constants/nav'

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
    const isDiscoveryPage = location.pathname === NAV_ITEMS[0].path


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

                    <div className="flex items-center gap-2 sm:gap-12 min-w-0">
                        <div className="hidden sm:flex gap-2 sm:gap-8 pointer-events-auto bg-black/40 sm:bg-transparent p-1.5 sm:p-0border border-white/10 sm:border-none rounded-sm">
                            {NAV_ITEMS.map((item) => {
                                const isActive = item.path === '/skin/'
                                    ? (location.pathname === '/skin/' || location.pathname === '/skin')
                                    : location.pathname.startsWith(item.path)
                                const label = current.nav[item.key]
                                return (
                                    <Link
                                        key={item.key}
                                        to={item.path}
                                        className={`group flex flex-col items-center gap-0.5 sm:gap-1 text-white transition-all no-underline transform hover:scale-110 active:scale-95 ${isActive ? 'opacity-100 scale-105' : 'opacity-60 hover:opacity-100'
                                            }`}
                                    >
                                        <Icon
                                            icon={item.icon}
                                            className="text-xl sm:text-3xl"
                                            style={{ imageRendering: 'pixelated' }}
                                        />
                                        <span className={`text-[8px] sm:text-sm mt-0 sm:mt-1 ${current.fontClass} hidden sm:block`}>{label}</span>
                                        {isActive && (
                                            <div className="w-1 h-1 bg-green-500 mt-0.5 sm:mt-1 animate-pulse" />
                                        )}
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
                </div>
            </div>

            {children}
            {isDiscoveryLoading && !isDiscoveryPage && <LoadingPlaceholder current={current} className="top-24 sm:top-28 z-20" />}

            {/* Background scene */}
            <div className="absolute inset-0 z-0">
                {isDiscoveryPage ? (
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

            {isDiscoveryPage && (
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
