import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon } from '@iconify/react'

export interface FigureShowcaseCarouselProps {
    isZh: boolean
    fontClass: string
    ctaText?: string
    previewImage?: string
}

export interface FigureSlide {
    id: string
    title: string
    badge: string
    desc: string
    image: string
    imageAlt: string
}

export function FigureShowcaseCarousel({ isZh, fontClass, ctaText }: FigureShowcaseCarouselProps) {
    const navigate = useNavigate()

    const slides: FigureSlide[] = [
        {
            id: 'lineup',
            title: isZh ? '实物合影' : 'Physical Lineup',
            badge: isZh ? '全员集结 ➔ 阻尼可动' : 'Full Lineup ➔ Articulated',
            desc: isZh
                ? '高韧树脂，多姿态悬停定格'
                : 'Tough photopolymer resin, stable posing',
            image: '/images/figure_physical_showcase.jpg',
            imageAlt: isZh ? '四员实物合影' : 'Physical figure squad'
        },
        {
            id: 'trio',
            title: isZh ? '三员特写' : 'Trio Studio',
            badge: isZh ? '分件咬合 ➔ 耐磨贴膜' : 'Snap-Fit ➔ Vinyl Wrap',
            desc: isZh
                ? '立体发丝分件，免胶咬合关节'
                : 'Modular hair parts, snap-fit joints',
            image: '/images/figure_trio_showcase.jpg',
            imageAlt: isZh ? '三员实物特写' : 'Trio figure studio showcase'
        },
        {
            id: 'duo',
            title: isZh ? '双子特写' : 'Duo Focus',
            badge: isZh ? '高韧光固化 ➔ 阻尼关节' : 'Tough Resin ➔ Snap Joints',
            desc: isZh
                ? '暗夜与翠绿对峙，多姿态可动'
                : 'Contrasting colorways with articulation',
            image: '/images/figure_duo_showcase.jpg',
            imageAlt: isZh ? '双子实物特写' : 'Duo figure studio showcase'
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
            navigate('/figure/3dprint')
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
            className={`relative w-full max-w-7xl mx-auto overflow-hidden py-3 select-none group/figure-carousel ${fontClass}`}
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
                                    ? 'opacity-100 z-20 border border-amber-500/40'
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
                                    ? '0 25px 60px -12px rgba(0, 0, 0, 0.95), 0 0 45px -5px rgba(245, 158, 11, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.15)'
                                    : '0 10px 30px -10px rgba(0, 0, 0, 0.7)',
                                filter: isActive ? 'brightness(1) saturate(1)' : 'brightness(0.65) saturate(0.85)'
                            }}
                            title={`${slide.badge} - ${slide.title}`}
                        >
                            <img
                                src={slide.image}
                                alt={slide.imageAlt}
                                className={`w-full h-full object-cover object-center transition-transform duration-700 ${
                                    isActive ? 'group-hover/figure-carousel:scale-[1.015]' : ''
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
                                    to="/figure/3dprint"
                                    onClick={(e) => e.stopPropagation()}
                                    className={`inline-flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 font-bold text-xs sm:text-sm border border-black backdrop-blur-md transition-all active:scale-95 no-underline shadow-xl bg-amber-500 hover:bg-amber-400 text-black shadow-amber-950/60 ${fontClass}`}
                                >
                                    <span>{ctaText || (isZh ? '定制实体手办' : '3D Print Figure')}</span>
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
