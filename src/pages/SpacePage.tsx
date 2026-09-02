import { useState } from 'react'
import { Icon } from '@iconify/react'

import { PageContainer } from '../components/PageContainer'
import { SEO } from '../components/SEO'
import { type LangData } from '../constants/lang'

interface SpacePageProps {
    current: LangData
}

function isMobileOrTabletDevice(): boolean {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
    const ua = navigator.userAgent || ''
    const isMobileUa = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS|Windows Phone/i.test(ua)
    const isIPadOS = (navigator.platform === 'MacIntel' || ua.includes('Macintosh')) && navigator.maxTouchPoints > 1
    const isTouchScreen = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
    const isSmallScreen = window.innerWidth < 1024 || window.innerHeight < 550

    return isMobileUa || isIPadOS || Boolean(isTouchScreen && isSmallScreen)
}

interface SpaceImageSlotProps {
    src?: string
    alt: string
    title: string
    recommendSize: string
    aspectRatio?: string
    className?: string
    slotId?: string
    icon?: string
}

/**
 * Reusable visual placeholder slot for Space assets/screenshots.
 * When `src` is provided in the future, it seamlessly displays the image.
 * Otherwise, it displays a sleek cyberpunk HUD placeholder frame with size and slot recommendations.
 */
function SpaceImageSlot({
    src,
    alt,
    title,
    recommendSize,
    aspectRatio = 'aspect-video',
    className = '',
    slotId,
    icon = 'pixelarticons:image'
}: SpaceImageSlotProps) {
    if (src) {
        return (
            <div className={`relative overflow-hidden border border-white/10 bg-black/50 ${aspectRatio} ${className}`}>
                <img
                    src={src}
                    alt={alt}
                    className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                    loading="lazy"
                />
            </div>
        )
    }

    return (
        <div
            className={`group relative flex flex-col items-center justify-center overflow-hidden border border-dashed border-white/20 bg-gradient-to-b from-white/[0.04] to-black/70 p-4 transition-all duration-300 hover:border-green-500/50 hover:bg-white/[0.06] ${aspectRatio} ${className}`}
        >
            {/* Subtle background radar grid */}
            <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#3c8527_1px,transparent_1px)] bg-[size:14px_14px] pointer-events-none" />

            {/* Slot Identifier Badge */}
            {slotId && (
                <div className="absolute top-2.5 left-2.5 font-mono text-[9px] uppercase tracking-wider text-green-400/80 border border-green-500/30 bg-black/80 px-2 py-0.5 z-10">
                    SLOT // {slotId}
                </div>
            )}

            {/* Corner crosshairs */}
            <div className="absolute top-2 right-2 text-white/20 font-mono text-xs select-none pointer-events-none">+</div>
            <div className="absolute bottom-2 left-2 text-white/20 font-mono text-xs select-none pointer-events-none">+</div>
            <div className="absolute bottom-2 right-2 text-white/20 font-mono text-xs select-none pointer-events-none">+</div>

            <div className="relative z-10 flex flex-col items-center gap-2 text-center max-w-[90%]">
                <div className="flex h-10 w-10 items-center justify-center border border-green-500/30 bg-green-500/10 text-green-300 shadow-[0_0_15px_rgba(74,222,128,0.15)] transition-transform group-hover:scale-110">
                    <Icon icon={icon} className="text-xl" />
                </div>
                <div className="flex flex-col gap-0.5">
                    <span className="font-mono text-xs font-bold text-white/90 group-hover:text-green-300 transition-colors">
                        {title}
                    </span>
                    <span className="font-mono text-[10px] text-white/40">
                        待替换图片 · 建议尺寸 {recommendSize}
                    </span>
                </div>
            </div>
        </div>
    )
}

export function SpacePage({ current }: SpacePageProps) {
    const data = current.space_page
    const spaceAppUrl = import.meta.env.VITE_SPACE_URL || '/space/app/'
    const offlineSpaceAppUrl = `${spaceAppUrl}${spaceAppUrl.includes('?') ? '&' : '?'}mode=offline`

    const [showMobileModal, setShowMobileModal] = useState(false)
    const [pendingUrl, setPendingUrl] = useState('')
    const [copied, setCopied] = useState(false)

    const handleLaunchClick = (e: React.MouseEvent, targetUrl: string) => {
        if (isMobileOrTabletDevice()) {
            e.preventDefault()
            setPendingUrl(targetUrl)
            setShowMobileModal(true)
        }
    }

    const handleCopyLink = async () => {
        const fullUrl = window.location.origin + spaceAppUrl
        try {
            await navigator.clipboard.writeText(fullUrl)
            setCopied(true)
            setTimeout(() => setCopied(false), 2500)
        } catch {
            setCopied(true)
        }
    }

    // Pre-allocated image slots:
    const IMAGE_SLOTS = {
        FEATURE_VOXEL: '/images/space_feature_drone.png',
        FEATURE_PHYSICS: '/images/space_feature_vehicle.png',
        FEATURE_AI: '/images/space_feature_entity_editor.png',
        FEATURE_TORUS: '/images/space_feature_torus.png',
    }

    const featureIcons = [
        'pixelarticons:box',
        'pixelarticons:zap',
        'pixelarticons:code',
        'pixelarticons:globe'
    ]

    const featureSlotKeys: (keyof typeof IMAGE_SLOTS)[] = [
        'FEATURE_VOXEL',
        'FEATURE_PHYSICS',
        'FEATURE_AI',
        'FEATURE_TORUS'
    ]

    const featureSizes = [
        '1200×675 (16:9)',
        '1200×675 (16:9)',
        '1200×675 (16:9)',
        '1200×675 (16:9)'
    ]

    return (
        <PageContainer
            alignItems="items-start"
            height="h-full"
            gap="gap-10 sm:gap-14"
            className="relative"
        >
            <SEO title={data.title} description={data.description} />

            {/* ===================== HERO SECTION ===================== */}
            <section className="flex flex-col gap-6 border-b border-white/10 pb-10 sm:pb-14 shrink-0 w-full">
                {/* Eyebrow */}
                <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="inline-flex items-center gap-2 border border-green-500/40 bg-green-500/10 px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider text-green-400">
                        <span className="h-2 w-2 bg-green-400 animate-pulse" />
                        {data.eyebrow}
                    </span>
                    <span className="inline-flex items-center gap-1.5 border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-mono text-white/70">
                        <Icon icon="pixelarticons:device-laptop" className="text-sm text-green-400" />
                        {data.desktopOnlyBadge || '仅限 PC 电脑端'}
                    </span>
                </div>

                {/* Title & Tagline */}
                <div className="flex flex-col gap-2.5">
                    <div className="flex items-start gap-3 flex-wrap">
                        <h1 className={`m-0 text-3xl sm:text-5xl lg:text-6xl font-bold leading-[1.08] text-white ${current.fontClass}`}>
                            {data.title}
                        </h1>
                        <span className="inline-block border border-green-400/40 bg-green-400/15 text-green-400 text-xs sm:text-sm font-mono px-2 py-0.5 uppercase tracking-widest font-bold self-start mt-1">
                            BETA
                        </span>
                    </div>
                    <p className={`m-0 text-lg sm:text-2xl font-semibold text-green-400 leading-snug ${current.fontClass}`}>
                        {data.tagline}
                    </p>
                    <p className={`m-0 max-w-3xl text-sm sm:text-base leading-relaxed text-white/70 ${current.fontClass}`}>
                        {data.description}
                    </p>
                </div>

                {/* Quick Specs Badges */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 py-1 max-w-4xl">
                    <div className="border border-white/10 bg-black/40 p-3 flex flex-col gap-1">
                        <span className="text-[10px] font-mono text-green-400 font-bold uppercase tracking-wider">SCALE</span>
                        <span className={`text-xs font-bold text-white ${current.fontClass}`}>{data.stats.scale}</span>
                    </div>
                    <div className="border border-white/10 bg-black/40 p-3 flex flex-col gap-1">
                        <span className="text-[10px] font-mono text-green-400 font-bold uppercase tracking-wider">PHYSICS</span>
                        <span className={`text-xs font-bold text-white ${current.fontClass}`}>{data.stats.physics}</span>
                    </div>
                    <div className="border border-white/10 bg-black/40 p-3 flex flex-col gap-1">
                        <span className="text-[10px] font-mono text-blue-400 font-bold uppercase tracking-wider">AI AGENT</span>
                        <span className={`text-xs font-bold text-blue-300 ${current.fontClass}`}>{data.stats.programmable}</span>
                    </div>
                    <div className="border border-white/10 bg-black/40 p-3 flex flex-col gap-1">
                        <span className="text-[10px] font-mono text-yellow-400 font-bold uppercase tracking-wider">TORUS</span>
                        <span className={`text-xs font-bold text-yellow-300 ${current.fontClass}`}>{data.stats.torus}</span>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <a
                        href={spaceAppUrl}
                        onClick={e => handleLaunchClick(e, spaceAppUrl)}
                        className={`group inline-flex min-h-12 items-center justify-center gap-2.5 border-2 border-black bg-[#3c8527] px-7 py-3 text-base font-bold text-white shadow-[4px_4px_0_rgba(0,0,0,0.55)] transition-all hover:bg-[#4ea632] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none no-underline ${current.fontClass}`}
                    >
                        <Icon icon="pixelarticons:play" className="text-xl" />
                        <span>{data.primaryCta}</span>
                        <Icon icon="pixelarticons:arrow-right" className="text-lg transition-transform group-hover:translate-x-1.5" />
                    </a>
                    <a
                        href={offlineSpaceAppUrl}
                        onClick={e => handleLaunchClick(e, offlineSpaceAppUrl)}
                        className={`inline-flex min-h-12 items-center justify-center gap-2 border border-green-500/35 bg-green-500/10 px-6 py-3 text-sm font-bold text-green-200 transition-all hover:border-green-400/60 hover:bg-green-500/20 hover:text-white no-underline ${current.fontClass}`}
                    >
                        <Icon icon="pixelarticons:cloud-off" className="text-lg" />
                        <span>{data.offlineCta}</span>
                    </a>
                    <a
                        href="#space-features"
                        className={`inline-flex min-h-12 items-center justify-center gap-2 border border-white/20 bg-white/5 px-5 py-3 text-sm text-white/80 transition-all hover:border-white/40 hover:bg-white/10 hover:text-white no-underline ${current.fontClass}`}
                    >
                        <Icon icon="pixelarticons:sliders" className="text-lg text-green-400" />
                        <span>{data.secondaryCta}</span>
                    </a>
                </div>
            </section>


            {/* ===================== CORE MECHANICS & SYSTEMS ===================== */}
            <section id="space-features" className="scroll-mt-8 flex flex-col gap-6 shrink-0 w-full">
                <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 text-green-400">
                        <Icon icon="pixelarticons:sparkles" className="text-xl" />
                        <span className="font-mono text-xs uppercase tracking-widest text-green-400 font-bold">
                            GAMEPLAY & SYSTEMS
                        </span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
                        <h2 className={`m-0 text-2xl sm:text-3xl font-bold text-white ${current.fontClass}`}>
                            {data.featuresTitle}
                        </h2>
                        <span className={`text-xs text-white/50 ${current.fontClass}`}>
                            {data.featuresSubtitle}
                        </span>
                    </div>
                </div>

                {/* 2x2 Visual Feature Cards with Image Placeholders */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {data.features.map((feature, index) => {
                        const slotKey = featureSlotKeys[index]
                        const imgSrc = slotKey ? IMAGE_SLOTS[slotKey] : undefined

                        return (
                            <article
                                key={feature.title}
                                className="group flex flex-col border border-white/10 bg-black/40 transition-all duration-300 hover:border-green-500/40 hover:bg-white/[0.04] overflow-hidden"
                            >
                                {/* Feature Image Placeholder */}
                                <SpaceImageSlot
                                    src={imgSrc}
                                    alt={feature.title}
                                    title={feature.placeholderTitle || feature.title}
                                    recommendSize={featureSizes[index] || '1200×675 (16:9)'}
                                    aspectRatio="aspect-[16/9]"
                                    slotId={slotKey}
                                    icon={featureIcons[index]}
                                />

                                {/* Feature Content */}
                                <div className="flex flex-col gap-3 p-5 sm:p-6 flex-1 justify-between">
                                    <div className="flex flex-col gap-2.5">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <div className="flex h-8 w-8 items-center justify-center border border-green-500/30 bg-green-500/10 text-green-300">
                                                    <Icon icon={featureIcons[index] || 'pixelarticons:zap'} className="text-lg" />
                                                </div>
                                                <span className="font-mono text-xs uppercase text-green-400/80 font-bold tracking-wider">
                                                    {feature.tag}
                                                </span>
                                            </div>
                                            <span className="font-mono text-[10px] uppercase tracking-wider text-green-400 border border-green-500/20 bg-green-500/5 px-2 py-0.5">
                                                {feature.badge}
                                            </span>
                                        </div>

                                        <h3 className={`m-0 text-lg font-bold text-white group-hover:text-green-300 transition-colors ${current.fontClass}`}>
                                            {feature.title}
                                        </h3>
                                        <p className={`m-0 text-xs sm:text-sm leading-relaxed text-white/65 ${current.fontClass}`}>
                                            {feature.description}
                                        </p>
                                    </div>

                                    <div className="flex items-center justify-between border-t border-white/5 pt-3 font-mono text-[10px] text-white/30">
                                        <span>FEATURE // 0{index + 1}</span>
                                        <span className="text-green-400/50 group-hover:text-green-400 transition-colors">ACTIVE</span>
                                    </div>
                                </div>
                            </article>
                        )
                    })}
                </div>
            </section>


            {/* ===================== AI AGENT & DEVELOPER PROTOCOL ===================== */}
            <section className="flex flex-col gap-6 shrink-0 w-full border-t border-white/10 pt-10">
                <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 text-purple-400">
                        <Icon icon="pixelarticons:script" className="text-xl" />
                        <span className="font-mono text-xs uppercase tracking-widest text-purple-400 font-bold">
                            AGENT INTEGRATION & PROTOCOL
                        </span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
                        <h2 className={`m-0 text-2xl sm:text-3xl font-bold text-white ${current.fontClass}`}>
                            {data.agentDevTitle}
                        </h2>
                        <span className={`text-xs text-white/50 ${current.fontClass}`}>
                            {data.agentDevSubtitle}
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {data.agentDevCards.map((card) => (
                        <div
                            key={card.title}
                            className="border border-white/10 bg-black/40 p-5 flex flex-col gap-3 hover:border-purple-400/40 transition-all group"
                        >
                            <div className="flex h-10 w-10 items-center justify-center border border-purple-400/30 bg-purple-500/10 text-purple-300 group-hover:scale-110 transition-transform">
                                <Icon icon={card.icon} className="text-xl" />
                            </div>
                            <h3 className={`text-base font-bold text-white m-0 group-hover:text-purple-300 transition-colors ${current.fontClass}`}>
                                {card.title}
                            </h3>
                            <p className={`text-xs sm:text-sm text-white/60 leading-relaxed m-0 ${current.fontClass}`}>
                                {card.desc}
                            </p>
                        </div>
                    ))}
                </div>
            </section>


            {/* ===================== CLOSING CTA BANNER ===================== */}
            <section className="relative overflow-hidden border border-green-500/30 bg-gradient-to-r from-green-950/40 via-black/60 to-blue-950/30 p-6 sm:p-10 shrink-0 w-full mt-2">
                <div className="absolute -right-16 -top-16 h-56 w-56 bg-green-500/15 blur-3xl pointer-events-none" />
                <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div className="flex max-w-2xl flex-col gap-2">
                        <div className="flex items-center gap-2">
                            <span className="h-2 w-2 bg-green-400 animate-pulse" />
                            <span className="font-mono text-xs uppercase tracking-widest text-green-400 font-bold">
                                LAUNCH PROTOTYPE
                            </span>
                        </div>
                        <h2 className={`m-0 text-2xl sm:text-4xl font-bold text-white ${current.fontClass}`}>
                            {data.closingTitle}
                        </h2>
                        <p className={`m-0 text-sm sm:text-base leading-relaxed text-white/70 ${current.fontClass}`}>
                            {data.closingSubtitle}
                        </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
                        <a
                            href={spaceAppUrl}
                            onClick={e => handleLaunchClick(e, spaceAppUrl)}
                            className={`group inline-flex min-h-12 items-center justify-center gap-2.5 border-2 border-black bg-[#3c8527] px-7 py-3 text-base font-bold text-white shadow-[4px_4px_0_rgba(0,0,0,0.55)] transition-all hover:bg-[#4ea632] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none no-underline ${current.fontClass}`}
                        >
                            <Icon icon="pixelarticons:play" className="text-xl" />
                            <span>{data.primaryCta}</span>
                            <Icon icon="pixelarticons:chevron-right" className="text-lg transition-transform group-hover:translate-x-1" />
                        </a>
                    </div>
                </div>

                {/* Footer Community Links */}
                <div className="relative z-10 border-t border-white/10 mt-6 pt-4 flex flex-wrap items-center gap-4 text-xs font-mono text-white/50">
                    <a
                        href="https://github.com/EntropyDrop"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 hover:text-white transition-colors no-underline text-white/60"
                    >
                        <Icon icon="mdi:github" className="text-sm" />
                        <span>{data.communityLinks.github}</span>
                    </a>
                    <span className="text-white/20">/</span>
                    <a
                        href="https://discord.gg/zxd8RjUyYt"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 hover:text-white transition-colors no-underline text-white/60"
                    >
                        <Icon icon="ic:baseline-discord" className="text-sm" />
                        <span>{data.communityLinks.discord}</span>
                    </a>
                </div>
            </section>

            {/* ===================== PC ONLY WARNING MODAL ===================== */}
            {showMobileModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fade-in">
                    <div className="relative w-full max-w-md border-2 border-green-500/60 bg-[#0d140e] p-6 shadow-[0_0_50px_rgba(0,0,0,0.9)] text-white">
                        {/* Corner Accents */}
                        <div className="absolute top-1 left-1 h-2 w-2 border-t-2 border-l-2 border-green-400" />
                        <div className="absolute top-1 right-1 h-2 w-2 border-t-2 border-r-2 border-green-400" />
                        <div className="absolute bottom-1 left-1 h-2 w-2 border-b-2 border-l-2 border-green-400" />
                        <div className="absolute bottom-1 right-1 h-2 w-2 border-b-2 border-r-2 border-green-400" />

                        {/* Modal Header */}
                        <div className="flex items-center gap-3 mb-4">
                            <div className="flex h-10 w-10 items-center justify-center border border-yellow-500/40 bg-yellow-500/10 text-yellow-400">
                                <Icon icon="pixelarticons:device-laptop" className="text-2xl" />
                            </div>
                            <div>
                                <h3 className={`m-0 text-base font-bold text-white ${current.fontClass}`}>
                                    {data.pcOnly?.title || 'Space 仅支持 PC 桌面端运行'}
                                </h3>
                                <span className="font-mono text-[10px] text-yellow-400 font-bold uppercase tracking-wider">
                                    DESKTOP PC REQUIRED
                                </span>
                            </div>
                        </div>

                        {/* Modal Description */}
                        <p className={`text-xs leading-relaxed text-white/80 mb-6 ${current.fontClass}`}>
                            {data.pcOnly?.description || 'Space 包含完整的 3D 体素物理引擎、0.2m 微体素精细雕刻与键鼠自主飞行控制系统，需要电脑桌面级 GPU 渲染与键盘鼠标操作，请使用 PC 电脑浏览器体验。'}
                        </p>

                        {/* Modal Action Buttons */}
                        <div className="flex flex-col gap-2.5">
                            <button
                                type="button"
                                onClick={handleCopyLink}
                                className={`flex items-center justify-center gap-2 border-2 border-black bg-[#3c8527] py-2.5 px-4 text-sm font-bold text-white shadow-[3px_3px_0_rgba(0,0,0,0.5)] transition-all hover:bg-[#4ea632] active:translate-y-0.5 active:shadow-none cursor-pointer ${current.fontClass}`}
                            >
                                <Icon icon={copied ? "pixelarticons:check" : "pixelarticons:copy"} className="text-base" />
                                <span>{copied ? (data.pcOnly?.copied || '已复制链接') : (data.pcOnly?.copyLink || '复制链接')}</span>
                            </button>

                            <div className="flex gap-2">
                                <a
                                    href={`${pendingUrl || spaceAppUrl}${pendingUrl?.includes('?') ? '&' : '?'}force_pc=1`}
                                    className={`flex-1 flex items-center justify-center gap-1.5 border border-white/20 bg-white/5 py-2 px-3 text-xs text-white/70 hover:bg-white/10 hover:text-white no-underline cursor-pointer ${current.fontClass}`}
                                >
                                    <span>{data.pcOnly?.tryAnyway || '仍然进入 (开发者)'}</span>
                                </a>
                                <button
                                    type="button"
                                    onClick={() => setShowMobileModal(false)}
                                    className={`flex-1 border border-white/20 bg-white/10 py-2 px-3 text-xs text-white/90 hover:bg-white/20 cursor-pointer ${current.fontClass}`}
                                >
                                    {data.pcOnly?.close || '我知道了'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </PageContainer>
    )
}
