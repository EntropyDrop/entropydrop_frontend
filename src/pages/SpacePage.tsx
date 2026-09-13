import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import { Link } from 'react-router-dom'

import { PageContainer } from '../components/PageContainer'
import { SEO } from '../components/SEO'
import { type LangData } from '../constants/lang'
import { API_BASE_URL, apiFetch } from '../utils/api'

interface SpacePageProps {
    current: LangData
}

interface SpacePopulation {
    onlinePlayers: number
    maxOnlinePlayers: number
}

type SpacePopulationStatus = 'loading' | 'ready' | 'unavailable'

const SPACE_POPULATION_REFRESH_MS = 30_000
const SPACE_STATUS_PATH = '/space/api/v2/status'

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
    const spaceStatusUrl = new URL(
        SPACE_STATUS_PATH,
        new URL(API_BASE_URL, window.location.href),
    ).toString()
    const agentOrigin = new URL(import.meta.env.VITE_SPACE_API_BASE_URL || API_BASE_URL, window.location.href).origin
    const agentGuideUrl = `${agentOrigin}/space/agent/SKILL.md`
    const spaceApiGuideUrl = `${agentOrigin}/space/agent/spaceAPI.md`
    const entityApiGuideUrl = `${agentOrigin}/space/agent/entityAPI.md`
    const apiKeysUrl = new URL('/space/apikeys', window.location.href).toString()
    const agentPrompt = data.agentSetup.prompt
        .replaceAll('{guide}', agentGuideUrl)
        .replaceAll('{backend}', agentOrigin)
        .replaceAll('{keys_url}', apiKeysUrl)
    const [agentCopyMessage, setAgentCopyMessage] = useState('')
    const [population, setPopulation] = useState<SpacePopulation | null>(null)
    const [populationStatus, setPopulationStatus] = useState<SpacePopulationStatus>('loading')

    useEffect(() => {
        const controller = new AbortController()
        let requestInFlight = false
        let hasPopulation = false

        const refreshPopulation = async () => {
            if (requestInFlight) return
            requestInFlight = true
            try {
                const response = await apiFetch(
                    spaceStatusUrl,
                    {
                        headers: { Accept: 'application/json' },
                        signal: controller.signal,
                        skipGlobalError: true,
                    },
                )
                if (!response.ok) throw new Error(`Space status request failed: ${response.status}`)
                const payload = await response.json() as Record<string, unknown>
                const onlinePlayers = Number(payload.online_players)
                const maxOnlinePlayers = Number(payload.max_online_players)
                if (
                    !Number.isSafeInteger(onlinePlayers)
                    || !Number.isSafeInteger(maxOnlinePlayers)
                    || onlinePlayers < 0
                    || maxOnlinePlayers < 1
                    || maxOnlinePlayers > 32
                    || onlinePlayers > maxOnlinePlayers
                ) {
                    throw new Error('Space status response is invalid')
                }
                setPopulation({ onlinePlayers, maxOnlinePlayers })
                hasPopulation = true
                setPopulationStatus('ready')
            } catch (error) {
                if (!controller.signal.aborted) {
                    if (!hasPopulation) setPopulationStatus('unavailable')
                    console.warn('Could not refresh the Space online-player count.', error)
                }
            } finally {
                requestInFlight = false
            }
        }

        const refreshWhenVisible = () => {
            if (document.visibilityState === 'visible') void refreshPopulation()
        }
        void refreshPopulation()
        const refreshTimer = window.setInterval(() => void refreshPopulation(), SPACE_POPULATION_REFRESH_MS)
        document.addEventListener('visibilitychange', refreshWhenVisible)
        return () => {
            controller.abort()
            window.clearInterval(refreshTimer)
            document.removeEventListener('visibilitychange', refreshWhenVisible)
        }
    }, [spaceStatusUrl])

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
            <SEO title={data.title} description={data.description} canonicalUrl="https://entropydrop.com/space/intro" />

            {/* ===================== HERO SECTION ===================== */}
            <section className="flex flex-col gap-6 border-b border-white/10 pb-10 sm:pb-14 shrink-0 w-full">
                {/* Eyebrow */}
                <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="inline-flex items-center gap-2 border border-green-500/40 bg-green-500/10 px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider text-green-400">
                        <span className="h-2 w-2 bg-green-400 animate-pulse" />
                        {data.eyebrow}
                    </span>
                    <span
                        className="inline-flex items-center gap-2 border border-white/15 bg-black/40 px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider text-white/75"
                        role="status"
                        aria-live="polite"
                        title={populationStatus === 'unavailable' ? data.onlineUnavailable : undefined}
                    >
                        <span className={`h-2 w-2 ${population ? 'bg-green-400 animate-pulse' : 'bg-white/30'}`} />
                        <Icon icon="pixelarticons:users" className="text-sm text-green-400" />
                        {population
                            ? `${population.onlinePlayers} / ${population.maxOnlinePlayers} ${data.onlinePlayers}`
                            : populationStatus === 'loading'
                                ? data.onlineLoading
                                : data.onlineUnavailable}
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
                        className={`group inline-flex min-h-12 items-center justify-center gap-2.5 border-2 border-black bg-[#3c8527] px-7 py-3 text-base font-bold text-white shadow-[4px_4px_0_rgba(0,0,0,0.55)] transition-all hover:bg-[#4ea632] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none no-underline ${current.fontClass}`}
                    >
                        <Icon icon="pixelarticons:play" className="text-xl" />
                        <span>{data.primaryCta}</span>
                        <Icon icon="pixelarticons:arrow-right" className="text-lg transition-transform group-hover:translate-x-1.5" />
                    </a>
                    <a href={spaceApiGuideUrl} target="_blank" rel="noopener noreferrer"
                        className={`inline-flex min-h-12 items-center justify-center gap-2 border border-purple-400/35 bg-purple-500/10 px-5 py-3 text-sm text-purple-200 hover:bg-purple-500/20 no-underline ${current.fontClass}`}>
                        <Icon icon="pixelarticons:script" className="text-lg" />
                        <span>{data.agentSetup.guide}</span>
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


            {/* ===================== CREATOR TOOLS & SHORTCUTS ===================== */}
            {data.toolsGuide && (
                <section id="space-tools" className="scroll-mt-8 flex flex-col gap-6 shrink-0 w-full border-t border-white/10 pt-10">
                    <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2 text-green-400">
                            <Icon icon="pixelarticons:sliders" className="text-xl" />
                            <span className="font-mono text-xs uppercase tracking-widest text-green-400 font-bold">
                                {data.toolsGuide.eyebrow}
                            </span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
                            <h2 className={`m-0 text-2xl sm:text-3xl font-bold text-white ${current.fontClass}`}>
                                {data.toolsGuide.title}
                            </h2>
                            <span className={`text-xs text-white/50 ${current.fontClass}`}>
                                {data.toolsGuide.subtitle}
                            </span>
                        </div>
                    </div>

                    {/* 6 Core Tool Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {data.toolsGuide.tools.map((tool) => (
                            <div
                                key={tool.name}
                                className="group relative flex flex-col gap-3 border border-white/10 bg-black/40 p-4 sm:p-5 transition-all duration-300 hover:border-green-500/40 hover:bg-white/[0.04]"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2.5">
                                        <div className="flex h-9 w-9 items-center justify-center border border-green-500/30 bg-green-500/10 text-green-300 group-hover:scale-105 transition-transform">
                                            <Icon icon={tool.icon} className="text-xl" />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="font-mono text-sm font-bold text-white group-hover:text-green-300 transition-colors">
                                                {tool.name}
                                            </span>
                                            <span className="font-mono text-[10px] text-white/40">
                                                SLOT // {tool.slot}
                                            </span>
                                        </div>
                                    </div>
                                    <span className="font-mono text-[10px] uppercase tracking-wider text-green-400 border border-green-500/20 bg-green-500/5 px-2 py-0.5">
                                        {tool.badge}
                                    </span>
                                </div>
                                <p className={`m-0 text-xs leading-relaxed text-white/70 ${current.fontClass}`}>
                                    {tool.desc}
                                </p>
                            </div>
                        ))}
                    </div>

                    {/* Shortcuts Reference Bar */}
                    <div className="border border-white/10 bg-black/50 p-4 sm:p-6 flex flex-col gap-3">
                        <div className="flex items-center justify-between border-b border-white/10 pb-2">
                            <span className="font-mono text-xs font-bold uppercase tracking-wider text-green-400 flex items-center gap-2">
                                <Icon icon="pixelarticons:command" className="text-base" />
                                {data.toolsGuide.shortcutsTitle}
                            </span>
                            <span className="font-mono text-[10px] text-white/40 uppercase">
                                QUICK REFERENCE
                            </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
                            {data.toolsGuide.shortcuts.map((shortcut) => (
                                <div
                                    key={shortcut.key}
                                    className="flex items-start gap-2.5 bg-white/[0.03] border border-white/5 p-2.5 hover:border-white/20 transition-colors"
                                >
                                    <kbd className="shrink-0 font-mono text-[11px] font-bold text-green-300 border border-green-500/40 bg-black/80 px-2 py-0.5 shadow-[0_0_8px_rgba(74,222,128,0.15)]">
                                        {shortcut.key}
                                    </kbd>
                                    <div className="flex flex-col gap-0.5 min-w-0">
                                        <span className={`text-xs font-bold text-white/90 truncate ${current.fontClass}`}>
                                            {shortcut.label}
                                        </span>
                                        <span className={`text-[11px] text-white/50 leading-tight line-clamp-2 ${current.fontClass}`}>
                                            {shortcut.desc}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            )}


            {/* ===================== AI AGENT & DEVELOPER PROTOCOL ===================== */}
            <section id="space-agents" className="flex flex-col gap-6 shrink-0 w-full border-t border-white/10 pt-10 scroll-mt-24">
                <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 text-purple-400">
                        <Icon icon="pixelarticons:script" className="text-xl" />
                        <span className="font-mono text-xs uppercase tracking-widest text-purple-400 font-bold">
                            AGENT INTEGRATION & PROTOCOL
                        </span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
                        <h2 className={`m-0 text-2xl sm:text-3xl font-bold text-white ${current.fontClass}`}>
                            {data.agentModes.title}
                        </h2>
                        <span className={`text-xs text-white/50 ${current.fontClass}`}>
                            {data.agentModes.subtitle}
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {data.agentModes.cards.map((card, index) => {
                        const isExternal = card.id === 'external'
                        return (
                            <article
                                key={card.id}
                                id={`space-agent-${card.id}`}
                                className={`min-w-0 flex flex-col gap-4 border p-5 sm:p-6 ${
                                    isExternal
                                        ? 'border-purple-400/40 bg-purple-950/20 shadow-[0_0_20px_rgba(168,85,247,0.1)]'
                                        : 'border-purple-400/25 bg-black/40'
                                }`}
                            >
                                <div className="flex items-center justify-between gap-3 text-purple-300">
                                    <Icon icon={card.icon} className="text-2xl" />
                                    <span className="font-mono text-xs text-white/40">0{index + 1}</span>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <h3 className={`m-0 text-xl font-bold text-white ${current.fontClass}`}>{card.title}</h3>
                                    <span className="self-start border border-green-400/25 bg-green-400/5 px-2 py-1 text-xs leading-relaxed text-green-300">{card.status}</span>
                                </div>
                                <p className={`m-0 text-sm leading-relaxed text-white/80 ${current.fontClass}`}>{card.description}</p>

                                {isExternal ? (
                                    <div className="flex flex-col gap-3 my-1">
                                        <button
                                            type="button"
                                            className="w-full inline-flex min-h-11 items-center justify-center gap-2 border-2 border-black bg-[#3c8527] px-4 py-2.5 text-sm font-bold text-white shadow-[2px_2px_0_rgba(0,0,0,0.55)] hover:bg-[#4ea632] active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
                                            onClick={() => {
                                                if (!navigator.clipboard?.writeText) {
                                                    setAgentCopyMessage(data.agentSetup.copyFailed)
                                                    return
                                                }
                                                void navigator.clipboard.writeText(agentPrompt).then(
                                                    () => setAgentCopyMessage(data.agentSetup.copied),
                                                    () => setAgentCopyMessage(data.agentSetup.copyFailed),
                                                )
                                            }}
                                        >
                                            <Icon icon="pixelarticons:copy" className="text-lg" />
                                            <span>{data.agentSetup.copy}</span>
                                        </button>
                                        {agentCopyMessage ? (
                                            <div role="status" className="text-xs font-mono text-green-300 bg-green-500/10 border border-green-500/30 p-2 text-center">
                                                {agentCopyMessage}
                                            </div>
                                        ) : null}

                                        <div className="text-xs text-white/75 break-all bg-black/50 p-2.5 border border-purple-400/20">
                                            <span className="text-purple-300 font-mono">{data.agentSetup.backend}: </span>
                                            <code className="text-purple-200">{agentOrigin}</code>
                                        </div>

                                        <details className="text-xs text-white/80 group">
                                            <summary className="cursor-pointer text-purple-300 font-mono text-xs uppercase tracking-wider flex items-center gap-1.5 hover:text-purple-200 select-none py-1">
                                                <Icon icon="pixelarticons:script" className="text-sm" />
                                                <span>{data.agentSetup.example}</span>
                                            </summary>
                                            <div className="relative mt-2">
                                                <pre className="m-0 whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed border border-purple-400/20 bg-black/70 p-3 max-h-48 overflow-y-auto text-purple-100/90">{agentPrompt}</pre>
                                            </div>
                                        </details>

                                        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                                            <a href={spaceApiGuideUrl} target="_blank" rel="noopener noreferrer"
                                                className="inline-flex items-center border border-purple-400/40 bg-purple-950/30 px-2.5 py-1.5 text-purple-200 hover:bg-purple-500/20 no-underline">
                                                {data.agentSetup.guide}
                                            </a>
                                            <a href={entityApiGuideUrl} target="_blank" rel="noopener noreferrer"
                                                className="inline-flex items-center border border-purple-400/40 bg-purple-950/30 px-2.5 py-1.5 text-purple-200 hover:bg-purple-500/20 no-underline">
                                                {data.agentSetup.entityGuide}
                                            </a>
                                            <Link to="/space/apikeys"
                                                className="inline-flex items-center border border-white/20 bg-white/5 px-2.5 py-1.5 text-white/80 hover:bg-white/10 no-underline">
                                                {current.nav.apiKeys}
                                            </Link>
                                        </div>

                                        <div className="text-xs leading-relaxed text-white/70">
                                            <span className="text-purple-300 font-medium">{data.agentModes.scopeLabel}: </span>
                                            <span>{card.scope}</span>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <dl className="m-0 flex flex-col gap-3 text-sm leading-relaxed">
                                            <div><dt className="text-purple-300">{data.agentModes.scopeLabel}</dt><dd className="m-0 mt-1 text-white/80">{card.scope}</dd></div>
                                            <div><dt className="text-purple-300">{data.agentModes.entryLabel}</dt><dd className="m-0 mt-1 text-white/80">{card.entry}</dd></div>
                                        </dl>
                                        <div className="border-l-2 border-purple-400/40 bg-purple-950/20 p-3 text-sm leading-relaxed">
                                            <p className="m-0 mb-1 text-purple-300">{data.agentModes.exampleLabel}</p>
                                            <p className="m-0 text-white/85">{card.example}</p>
                                        </div>
                                    </>
                                )}

                                <div className="mt-auto border-t border-white/10 pt-4 text-sm leading-relaxed">
                                    <p className="m-0 mb-1 font-semibold text-white/85">{data.agentModes.availabilityLabel}</p>
                                    <p className="m-0 text-white/65">{card.availability}</p>
                                </div>
                            </article>
                        )
                    })}
                </div>

                <div className="border-l-2 border-purple-400/40 pl-4 sm:pl-5 flex flex-col gap-2">
                    <h3 className={`m-0 text-lg font-bold text-white ${current.fontClass}`}>{data.agentModes.sharedTitle}</h3>
                    <p className={`m-0 max-w-5xl text-sm leading-relaxed text-white/75 ${current.fontClass}`}>{data.agentModes.sharedDescription}</p>
                    <p className={`m-0 max-w-5xl text-sm leading-relaxed text-white/60 ${current.fontClass}`}>{data.agentModes.authNote}</p>
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
        </PageContainer>
    )
}
