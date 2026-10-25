import { useState, type ReactNode } from 'react'
import { Icon } from '@iconify/react'

export interface AppleMediaPlaceholderProps {
    title: string
    subtitle?: string
    badge?: string
    slotId?: string
    suggestedPath?: string
    aspectRatio?: 'aspect-video' | 'aspect-[21/9]' | 'aspect-[16/10]' | 'aspect-[4/3]' | 'aspect-square' | string
    icon?: string
    imageSrc?: string
    imageAlt?: string
    accentColor?: 'emerald' | 'sky' | 'amber' | 'purple' | 'neutral'
    className?: string
    children?: ReactNode
    forcePlaceholder?: boolean
    fontClass?: string
}

const ACCENT_STYLES = {
    emerald: {
        glow: 'rgba(16, 185, 129, 0.15)',
        border: 'hover:border-emerald-500/40',
        badgeBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
        icon: 'text-emerald-400',
        radar: 'border-emerald-500/20'
    },
    sky: {
        glow: 'rgba(14, 165, 233, 0.15)',
        border: 'hover:border-sky-500/40',
        badgeBg: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
        icon: 'text-sky-400',
        radar: 'border-sky-500/20'
    },
    amber: {
        glow: 'rgba(245, 158, 11, 0.15)',
        border: 'hover:border-amber-500/40',
        badgeBg: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
        icon: 'text-amber-400',
        radar: 'border-amber-500/20'
    },
    purple: {
        glow: 'rgba(168, 85, 247, 0.15)',
        border: 'hover:border-purple-500/40',
        badgeBg: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
        icon: 'text-purple-400',
        radar: 'border-purple-500/20'
    },
    neutral: {
        glow: 'rgba(255, 255, 255, 0.08)',
        border: 'hover:border-white/30',
        badgeBg: 'bg-white/10 text-white/80 border-white/20',
        icon: 'text-white/70',
        radar: 'border-white/15'
    }
}

/**
 * Apple-grade hardware / product showcase media container.
 * Seamlessly handles both real images and ultra-sleek blueprint placeholders
 * with clear dimensions, aspect ratios, and file slot guides in unified pixel font.
 */
export function AppleMediaPlaceholder({
    title,
    subtitle = '建议规格: 1920 × 1080 (16:9)',
    badge = '图片占位符 · 待替换',
    slotId,
    suggestedPath,
    aspectRatio = 'aspect-video',
    icon = 'pixelarticons:image',
    imageSrc,
    imageAlt = 'Product Preview',
    accentColor = 'neutral',
    className = '',
    children,
    forcePlaceholder = false,
    fontClass = 'font-pixel-hans'
}: AppleMediaPlaceholderProps) {
    const [isHovered, setIsHovered] = useState(false)
    const [viewMode, setViewMode] = useState<'auto' | 'placeholder'>('auto')
    const [imageError, setImageError] = useState(false)

    const accent = ACCENT_STYLES[accentColor] || ACCENT_STYLES.neutral
    const hasLiveImage = Boolean(imageSrc) && !imageError && !forcePlaceholder && viewMode === 'auto'

    return (
        <div
            data-slot-id={slotId}
            className={`group relative w-full ${aspectRatio} overflow-hidden border border-white/10 bg-[#0d0d0f]/90 backdrop-blur-xl transition-all duration-500 ${accent.border} shadow-2xl ${fontClass} ${className}`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                boxShadow: isHovered
                    ? `0 20px 50px -15px ${accent.glow}, 0 0 0 1px rgba(255,255,255,0.15)`
                    : '0 10px 30px -10px rgba(0,0,0,0.8)'
            }}
        >
            {/* Ambient Radial Spotlight inside container */}
            <div
                className="absolute inset-0 pointer-events-none transition-opacity duration-700"
                style={{
                    background: `radial-gradient(circle at 50% 45%, ${accent.glow} 0%, transparent 70%)`,
                    opacity: isHovered ? 1 : 0.6
                }}
            />

            {/* Apple Subtle Blueprint Engineering Grid Background */}
            <div
                className="absolute inset-0 pointer-events-none opacity-[0.04] transition-opacity duration-500 group-hover:opacity-[0.07]"
                style={{
                    backgroundImage: `
                        linear-gradient(to right, #ffffff 1px, transparent 1px),
                        linear-gradient(to bottom, #ffffff 1px, transparent 1px)
                    `,
                    backgroundSize: '40px 40px'
                }}
            />

            {/* Live Image Layer (if provided and valid) */}
            {hasLiveImage ? (
                <div className="relative w-full h-full">
                    <img
                        src={imageSrc}
                        alt={imageAlt}
                        onError={() => setImageError(true)}
                        className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.025]"
                    />
                    {/* Cinematic Apple Vignette */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />
                </div>
            ) : (
                /* Ultra-sleek Apple Blueprint Wireframe Placeholder */
                <div className="relative w-full h-full flex flex-col items-center justify-center p-6 text-center select-none">
                    {/* Center Radar / Glowing Aperture */}
                    <div className="relative mb-4 flex items-center justify-center">
                        <div
                            className={`w-20 h-20 sm:w-24 sm:h-24 border border-dashed ${accent.radar} flex items-center justify-center transition-transform duration-700 group-hover:scale-105`}
                        >
                            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-white/[0.03] border border-white/10 flex items-center justify-center backdrop-blur-md">
                                <Icon
                                    icon={icon}
                                    className={`text-2xl sm:text-3xl ${accent.icon} transition-transform duration-500 group-hover:scale-110`}
                                />
                            </div>
                        </div>

                        {/* Subtle square pixel beacon */}
                        <span className="absolute -top-1 -right-1 flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full bg-white/40 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 bg-white/80" />
                        </span>
                    </div>

                    {/* Title & Dimension info */}
                    <h4 className={`m-0 text-base sm:text-xl font-bold text-white leading-snug ${fontClass}`}>
                        {title}
                    </h4>

                    {subtitle && (
                        <p className={`mt-1.5 mb-0 text-xs sm:text-sm text-white/50 ${fontClass}`}>
                            {subtitle}
                        </p>
                    )}

                    {suggestedPath && (
                        <div className={`mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/[0.04] border border-white/10 text-[11px] text-white/60 ${fontClass}`}>
                            <Icon icon="pixelarticons:folder" className="text-xs text-white/40" />
                            <span>{suggestedPath}</span>
                        </div>
                    )}
                </div>
            )}

            {/* Apple Corner Badge: Spec Pill */}
            <div className="absolute top-3 left-3 sm:top-5 sm:left-5 z-20 flex items-center gap-2 pointer-events-none">
                <span className={`px-2.5 py-1 text-[10px] sm:text-xs font-medium uppercase border backdrop-blur-md ${accent.badgeBg} ${fontClass}`}>
                    {badge}
                </span>
            </div>

            {/* Image / Wireframe Mode Toggle (if image exists) */}
            {imageSrc && !imageError && (
                <div className="absolute top-3 right-3 sm:top-5 sm:right-5 z-20 flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={() => setViewMode(v => v === 'auto' ? 'placeholder' : 'auto')}
                        className={`px-2.5 py-1 text-[10px] sm:text-xs bg-black/60 hover:bg-black/80 text-white/70 hover:text-white border border-white/15 backdrop-blur-md transition-all cursor-pointer flex items-center gap-1.5 shadow-lg ${fontClass}`}
                        title="切换实图预览 / 占位符规格说明"
                    >
                        <Icon icon={viewMode === 'auto' ? 'pixelarticons:eye' : 'pixelarticons:code'} className="text-xs" />
                        <span>{viewMode === 'auto' ? '实图预览' : '查看占位规格'}</span>
                    </button>
                </div>
            )}

            {/* Inset Top Glass Rim Highlight */}
            <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />

            {/* Overlaid children (e.g. controls, subtabs, floating HUD) */}
            {children && (
                <div className={`absolute inset-0 z-10 pointer-events-auto ${fontClass}`}>
                    {children}
                </div>
            )}
        </div>
    )
}
