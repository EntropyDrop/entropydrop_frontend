import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon } from '@iconify/react'

export interface SpaceShowcaseCarouselProps {
    isZh: boolean
    fontClass: string
    ctaText?: string
}

interface SpaceSlide {
    id: 'aether' | 'nature' | 'copper'
    title: string
    badge: string
    desc: string
    image: string
    imageAlt: string
}

export function SpaceShowcaseCarousel({ isZh, fontClass, ctaText }: SpaceShowcaseCarouselProps) {
    const navigate = useNavigate()

    const slides: SpaceSlide[] = [
        {
            id: 'aether',
            title: isZh ? '以太浮岛' : 'Aether Archipelago',
            badge: isZh ? '云海浮岛 ➔ 滑翔漫游' : 'Cloud Archipelago ➔ Glider Flight',
            desc: isZh
                ? '高空云海浮岛群，刚体滑翔伞与浮空探索'
                : 'Cloud archipelago with glider flight and aerial exploration',
            image: '/images/space_world_aether.webp',
            imageAlt: isZh ? '以太浮岛体素沙盒画卷' : 'Aether Archipelago Voxel World'
        },
        {
            id: 'nature',
            title: isZh ? '原始旷野' : 'Nature Wildlands',
            badge: isZh ? '苍翠山林 ➔ 动态生态' : 'Lush Biomes ➔ Dynamic Ecosystem',
            desc: isZh
                ? '苍翠山林与动态水体光影，物理交互与沙盒建造'
                : 'Lush biomes with dynamic water & lighting, physics building',
            image: '/images/space_world_nature.webp',
            imageAlt: isZh ? '原始旷野体素沙盒画卷' : 'Nature Wildlands Voxel World'
        },
        {
            id: 'copper',
            title: isZh ? '黄铜都会' : 'Copper Metropolis',
            badge: isZh ? '蒸汽工业 ➔ 机械浮城' : 'Steampunk Industrial ➔ Floating City',
            desc: isZh
                ? '蒸汽工业机械浮城，载具驾驶与多人同屏'
                : 'Steampunk industrial floating city with vehicle piloting',
            image: '/images/space_world_copper.webp',
            imageAlt: isZh ? '黄铜都会体素沙盒画卷' : 'Copper Metropolis Voxel World'
        }
    ]

    // 3 complete cycles for seamless infinite horizontal loop
    const extendedSlides = [...slides, ...slides, ...slides]
    const [currentIndex, setCurrentIndex] = useState(3) // starts at index 3 (Slide 0 of middle cycle)
    const [isAnimating, setIsAnimating] = useState(false)
    const [enableTransition, setEnableTransition] = useState(true)
    const [isPaused, setIsPaused] = useState(false)
    const touchStartX = useRef<number | null>(null)
    const trackRef = useRef<HTMLDivElement>(null)

    const SLIDE_DURATION = 5000 // 5 seconds per slide
    const slideWidthPercent = 82 // Active slide occupies 82% width; 9% peek on each side (~110px peeking)
    const gapPx = 20 // 20px gap between slides

    const nextSlide = useCallback(() => {
        if (isAnimating) return
        setIsAnimating(true)
        setEnableTransition(true)
        setCurrentIndex(prev => prev + 1)
    }, [isAnimating])

    const prevSlide = useCallback(() => {
        if (isAnimating) return
        setIsAnimating(true)
        setEnableTransition(true)
        setCurrentIndex(prev => prev - 1)
    }, [isAnimating])

    const goToSlide = (targetModIndex: number) => {
        if (isAnimating) return
        const currentMod = currentIndex % slides.length
        const diff = targetModIndex - currentMod
        if (diff === 0) return
        setIsAnimating(true)
        setEnableTransition(true)
        setCurrentIndex(prev => prev + diff)
    }

    // Auto-advance timer (clean interval, pauses on hover)
    useEffect(() => {
        if (isPaused) return
        const timer = setInterval(nextSlide, SLIDE_DURATION)
        return () => clearInterval(timer)
    }, [isPaused, nextSlide])

    // Reset without transition when reaching boundaries
    const handleTransitionEnd = (e: React.TransitionEvent) => {
        if (e.target !== trackRef.current || e.propertyName !== 'transform') return
        setIsAnimating(false)
        if (currentIndex >= 6) {
            setEnableTransition(false)
            setCurrentIndex(currentIndex - 3)
        } else if (currentIndex < 3) {
            setEnableTransition(false)
            setCurrentIndex(currentIndex + 3)
        }
    }

    // Re-enable transition after boundary snap
    useEffect(() => {
        if (!enableTransition) {
            const raf1 = requestAnimationFrame(() => {
                const raf2 = requestAnimationFrame(() => {
                    setEnableTransition(true)
                })
                return () => cancelAnimationFrame(raf2)
            })
            return () => cancelAnimationFrame(raf1)
        }
    }, [enableTransition])

    // Touch swipe handlers
    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartX.current = e.touches[0].clientX
    }

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (touchStartX.current === null) return
        const touchEndX = e.changedTouches[0].clientX
        const deltaX = touchEndX - touchStartX.current
        if (Math.abs(deltaX) > 40) {
            if (deltaX > 0) {
                prevSlide()
            } else {
                nextSlide()
            }
        }
        touchStartX.current = null
    }

    const handleSlideClick = (index: number) => {
        if (index === currentIndex) {
            navigate('/space/intro')
        } else if (index === currentIndex - 1) {
            prevSlide()
        } else if (index === currentIndex + 1) {
            nextSlide()
        } else {
            goToSlide(index % slides.length)
        }
    }

    return (
        <div
            className={`relative w-full max-w-7xl mx-auto overflow-hidden py-3 select-none group/space-carousel ${fontClass}`}
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
        >
            {/* Sliding Track */}
            <div
                ref={trackRef}
                onTransitionEnd={handleTransitionEnd}
                className="flex items-center"
                style={{
                    gap: `${gapPx}px`,
                    transform: `translateX(calc(${(100 - slideWidthPercent) / 2}% - ${currentIndex} * (${slideWidthPercent}% + ${gapPx}px)))`,
                    transition: enableTransition ? 'transform 650ms cubic-bezier(0.16, 1, 0.3, 1)' : 'none',
                    willChange: 'transform'
                }}
            >
                {extendedSlides.map((slide, index) => {
                    const isActive = index === currentIndex
                    const isPrev = index === currentIndex - 1
                    const isNext = index === currentIndex + 1
                    const isFar = Math.abs(index - currentIndex) > 1

                    // Far slides are hidden to keep viewport clean with overflow-visible
                    if (isFar) {
                        return (
                            <div
                                key={`${slide.id}-${index}`}
                                className="flex-none w-[82%] aspect-video pointer-events-none opacity-0 invisible"
                                aria-hidden="true"
                            />
                        )
                    }

                    return (
                        <div
                            key={`${slide.id}-${index}`}
                            onClick={() => handleSlideClick(index)}
                            className={`flex-none w-[82%] aspect-video relative transition-all duration-700 ease-out select-none overflow-hidden cursor-pointer ${
                                isActive
                                    ? 'opacity-100 z-20 border border-sky-500/40'
                                    : 'opacity-70 hover:opacity-95 z-10 border border-white/10 hover:border-white/20'
                            }`}
                            style={{
                                transform: isActive
                                    ? 'scale(1) perspective(1200px) rotateY(0deg)'
                                    : isPrev
                                        ? 'scale(0.92) perspective(1200px) rotateY(3.5deg)'
                                        : 'scale(0.92) perspective(1200px) rotateY(-3.5deg)',
                                transformOrigin: isPrev ? 'right center' : isNext ? 'left center' : 'center center',
                                maskImage: isPrev
                                    ? 'linear-gradient(to left, rgba(0,0,0,1) 0%, rgba(0,0,0,0.65) 40%, rgba(0,0,0,0.2) 75%, transparent 100%)'
                                    : isNext
                                        ? 'linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,0.65) 40%, rgba(0,0,0,0.2) 75%, transparent 100%)'
                                        : 'none',
                                WebkitMaskImage: isPrev
                                    ? 'linear-gradient(to left, rgba(0,0,0,1) 0%, rgba(0,0,0,0.65) 40%, rgba(0,0,0,0.2) 75%, transparent 100%)'
                                    : isNext
                                        ? 'linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,0.65) 40%, rgba(0,0,0,0.2) 75%, transparent 100%)'
                                        : 'none',
                                boxShadow: isActive
                                    ? '0 25px 60px -12px rgba(0, 0, 0, 0.95), 0 0 45px -5px rgba(14, 165, 233, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.15)'
                                    : '0 10px 30px -10px rgba(0, 0, 0, 0.7)',
                                filter: isActive ? 'brightness(1) saturate(1)' : 'brightness(0.65) saturate(0.85)'
                            }}
                            title={`${slide.badge} - ${slide.title}`}
                        >
                            <img
                                src={slide.image}
                                alt={slide.imageAlt}
                                className={`w-full h-full object-cover object-center transition-transform duration-700 ${
                                    isActive ? 'group-hover/space-carousel:scale-[1.015]' : ''
                                }`}
                                loading={index >= 2 && index <= 4 ? 'eager' : 'lazy'}
                            />

                            {/* Cinema Depth Vignette for peeking slides */}
                            <div
                                className={`absolute inset-0 pointer-events-none transition-opacity duration-500 ${
                                    isActive
                                        ? 'opacity-0'
                                        : isPrev
                                            ? 'opacity-100 bg-gradient-to-r from-black/80 via-black/30 to-transparent'
                                            : 'opacity-100 bg-gradient-to-l from-black/80 via-black/30 to-transparent'
                                }`}
                            />

                            {/* Bottom-Right CTA Button Only */}
                            <div
                                className={`absolute bottom-3 sm:bottom-4 right-3 sm:right-4 z-30 transition-all duration-500 ${
                                    isActive
                                        ? 'opacity-100 translate-y-0 pointer-events-auto'
                                        : 'opacity-0 translate-y-4 pointer-events-none'
                                }`}
                            >
                                <Link
                                    to="/space/intro"
                                    onClick={(e) => e.stopPropagation()}
                                    className={`inline-flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 font-bold text-xs sm:text-sm border border-black backdrop-blur-md transition-all active:scale-95 no-underline shadow-xl bg-sky-500 hover:bg-sky-400 text-black shadow-sky-950/60 ${fontClass}`}
                                >
                                    <span>{ctaText || (isZh ? '进入体素空间' : 'Launch Voxel Space')}</span>
                                    <Icon icon="pixelarticons:chevron-right" className="text-sm sm:text-base" />
                                </Link>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
