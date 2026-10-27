import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon } from '@iconify/react'
import type { LangData } from '../constants/lang'

export interface HomeHeroCarouselProps {
    data: LangData['home']['carousels']['hero']
    fontClass: string
}

interface SlideItem {
    id: 'space' | 'skin' | 'figure'
    badge: string
    title: string
    desc: string
    image: string
    imageAlt: string
    ctaText: string
    ctaLink: string
    accentColor: 'sky' | 'emerald' | 'amber'
}

export function HomeHeroCarousel({ data, fontClass }: HomeHeroCarouselProps) {
    const navigate = useNavigate()

    const slides: SlideItem[] = [
        {
            id: 'skin',
            badge: data.skin.badge,
            title: data.skin.title,
            desc: data.skin.desc,
            image: '/images/home_carousel_skin.webp',
            imageAlt: data.skin.imageAlt,
            ctaText: data.skin.ctaText,
            ctaLink: '/skin/generate',
            accentColor: 'emerald'
        },
        {
            id: 'space',
            badge: data.space.badge,
            title: data.space.title,
            desc: data.space.desc,
            image: '/images/home_carousel_space.webp',
            imageAlt: data.space.imageAlt,
            ctaText: data.space.ctaText,
            ctaLink: '/space/intro',
            accentColor: 'sky'
        },
        {
            id: 'figure',
            badge: data.figure.badge,
            title: data.figure.title,
            desc: data.figure.desc,
            image: '/images/home_carousel_figure.webp',
            imageAlt: data.figure.imageAlt,
            ctaText: data.figure.ctaText,
            ctaLink: '/figure/3dprint',
            accentColor: 'amber'
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
    const animationTimeoutRef = useRef<number | null>(null)

    const SLIDE_DURATION = 5000 // 5 seconds per slide
    const slideWidthPercent = 82 // Active slide occupies 82% width; 9% peek on each side (~110px peeking)
    const gapPx = 20 // 20px gap between slides

    const nextSlide = useCallback(() => {
        if (isAnimating || !enableTransition) return
        setIsAnimating(true)
        setEnableTransition(true)
        setCurrentIndex(prev => prev + 1)
    }, [isAnimating, enableTransition])

    const prevSlide = useCallback(() => {
        if (isAnimating || !enableTransition) return
        setIsAnimating(true)
        setEnableTransition(true)
        setCurrentIndex(prev => prev - 1)
    }, [isAnimating, enableTransition])

    const goToSlide = (targetModIndex: number) => {
        if (isAnimating || !enableTransition) return
        const currentMod = currentIndex % slides.length
        const diff = targetModIndex - currentMod
        if (diff === 0) return
        setIsAnimating(true)
        setEnableTransition(true)
        setCurrentIndex(prev => prev + diff)
    }

    // Safety timeout in case transitionEnd event is dropped
    useEffect(() => {
        if (isAnimating) {
            animationTimeoutRef.current = window.setTimeout(() => {
                setIsAnimating(false)
            }, 800)
        }
        return () => {
            if (animationTimeoutRef.current) {
                clearTimeout(animationTimeoutRef.current)
                animationTimeoutRef.current = null
            }
        }
    }, [isAnimating])

    // Pause timer when browser tab is hidden to prevent pile-up
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden) {
                setIsPaused(true)
            } else {
                setIsPaused(false)
            }
        }
        document.addEventListener('visibilitychange', handleVisibilityChange)
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
    }, [])

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
            // Force synchronous layout reflow so the transform jump is committed with transition: none
            if (trackRef.current) {
                void trackRef.current.offsetWidth
            }
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

    const handleSlideClick = (index: number, link: string) => {
        if (isAnimating || !enableTransition) return
        const isCycleActive = index === currentIndex || (currentIndex >= 6 && index === currentIndex - 3) || (currentIndex < 3 && index === currentIndex + 3)
        const isCyclePrev = index === currentIndex - 1 || (currentIndex >= 6 && index === currentIndex - 4) || (currentIndex < 3 && index === currentIndex + 2)
        const isCycleNext = index === currentIndex + 1 || (currentIndex >= 6 && index === currentIndex - 2) || (currentIndex < 3 && index === currentIndex + 4)

        if (isCycleActive) {
            navigate(link)
        } else if (isCyclePrev) {
            prevSlide()
        } else if (isCycleNext) {
            nextSlide()
        } else {
            goToSlide(index % slides.length)
        }
    }

    const activeModIndex = currentIndex % slides.length

    const getAccentClasses = (color: SlideItem['accentColor']) => {
        switch (color) {
            case 'sky':
                return {
                    badge: 'border-sky-500/40 bg-sky-500/15 text-sky-300',
                    cta: 'bg-sky-500 hover:bg-sky-400 text-black border-sky-300 shadow-lg shadow-sky-950/50',
                    glow: 'rgba(14, 165, 233, 0.3)'
                }
            case 'amber':
                return {
                    badge: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
                    cta: 'bg-amber-500 hover:bg-amber-400 text-black border-amber-300 shadow-lg shadow-amber-950/50',
                    glow: 'rgba(245, 158, 11, 0.3)'
                }
            case 'emerald':
            default:
                return {
                    badge: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
                    cta: 'bg-[#3c8527] hover:bg-[#4ea632] text-white border-black shadow-lg shadow-emerald-950/50',
                    glow: 'rgba(16, 185, 129, 0.3)'
                }
        }
    }

    return (
        <div
            className={`relative w-full max-w-7xl mx-auto overflow-visible select-none group/carousel ${fontClass}`}
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
                    const isCycleActive = index === currentIndex || (currentIndex >= 6 && index === currentIndex - 3) || (currentIndex < 3 && index === currentIndex + 3)
                    const isCyclePrev = index === currentIndex - 1 || (currentIndex >= 6 && index === currentIndex - 4) || (currentIndex < 3 && index === currentIndex + 2)
                    const isCycleNext = index === currentIndex + 1 || (currentIndex >= 6 && index === currentIndex - 2) || (currentIndex < 3 && index === currentIndex + 4)
                    const isFar = !isCycleActive && !isCyclePrev && !isCycleNext
                    const slideAccent = getAccentClasses(slide.accentColor)

                    return (
                        <div
                            key={`${slide.id}-${index}`}
                            onClick={() => handleSlideClick(index, slide.ctaLink)}
                            aria-hidden={isFar}
                            className={`flex-none w-[82%] aspect-video relative select-none overflow-hidden cursor-pointer ${
                                isFar
                                    ? 'opacity-0 pointer-events-none invisible z-0'
                                    : isCycleActive
                                        ? 'opacity-100 z-20 border border-white/20'
                                        : 'opacity-70 hover:opacity-95 z-10 border border-white/10 hover:border-white/20'
                            }`}
                            style={{
                                transition: enableTransition
                                    ? 'transform 700ms ease-out, opacity 700ms ease-out, filter 700ms ease-out, border-color 700ms ease-out, box-shadow 700ms ease-out'
                                    : 'none',
                                transform: isCycleActive
                                    ? 'scale(1) perspective(1200px) rotateY(0deg)'
                                    : isCyclePrev
                                        ? 'scale(0.92) perspective(1200px) rotateY(3.5deg)'
                                        : 'scale(0.92) perspective(1200px) rotateY(-3.5deg)',
                                transformOrigin: isCyclePrev ? 'right center' : isCycleNext ? 'left center' : 'center center',
                                maskImage: isCyclePrev
                                    ? 'linear-gradient(to left, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 15%, rgba(0,0,0,0.45) 30%, rgba(0,0,0,0.08) 44%, transparent 50%, transparent 100%)'
                                    : isCycleNext
                                        ? 'linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 15%, rgba(0,0,0,0.45) 30%, rgba(0,0,0,0.08) 44%, transparent 50%, transparent 100%)'
                                        : 'none',
                                WebkitMaskImage: isCyclePrev
                                    ? 'linear-gradient(to left, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 15%, rgba(0,0,0,0.45) 30%, rgba(0,0,0,0.08) 44%, transparent 50%, transparent 100%)'
                                    : isCycleNext
                                        ? 'linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 15%, rgba(0,0,0,0.45) 30%, rgba(0,0,0,0.08) 44%, transparent 50%, transparent 100%)'
                                        : 'none',
                                boxShadow: isCycleActive
                                    ? `0 25px 60px -12px rgba(0, 0, 0, 0.95), 0 0 45px -5px ${slideAccent.glow}, 0 0 0 1px rgba(255, 255, 255, 0.15)`
                                    : '0 10px 30px -10px rgba(0, 0, 0, 0.7)',
                                filter: isCycleActive ? 'brightness(1) saturate(1)' : 'brightness(0.65) saturate(0.85)'
                            }}
                            title={`${slide.badge} - ${slide.title}`}
                        >
                            <img
                                src={slide.image}
                                alt={slide.imageAlt}
                                loading="eager"
                                decoding="async"
                                className={`w-full h-full object-cover object-center ${
                                    isCycleActive ? 'group-hover/carousel:scale-[1.015]' : ''
                                }`}
                                style={{
                                    transition: enableTransition ? 'transform 700ms ease-out' : 'none'
                                }}
                            />

                            {/* Cinema Depth Vignette for peeking slides */}
                            <div
                                className={`absolute inset-0 pointer-events-none ${
                                    isCycleActive
                                        ? 'opacity-0'
                                        : isCyclePrev
                                            ? 'opacity-100 bg-gradient-to-r from-black/80 via-black/30 to-transparent'
                                            : 'opacity-100 bg-gradient-to-l from-black/80 via-black/30 to-transparent'
                                }`}
                                style={{
                                    transition: enableTransition ? 'opacity 500ms ease-out' : 'none'
                                }}
                            />

                            {/* Slide Bottom Dock */}
                            <div
                                className={`absolute bottom-3 sm:bottom-4 inset-x-3 sm:inset-x-4 z-30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 sm:p-4 bg-black/80 backdrop-blur-md border border-white/10 shadow-2xl ${
                                    isCycleActive
                                        ? 'opacity-100 translate-y-0 pointer-events-auto'
                                        : 'opacity-0 translate-y-4 pointer-events-none'
                                }`}
                                style={{
                                    transition: enableTransition ? 'opacity 500ms ease-out, transform 500ms ease-out' : 'none'
                                }}
                            >
                                <div className="flex flex-col gap-1 sm:gap-1.5 max-w-xl text-left">
                                    <div className="flex items-center gap-2">
                                        <span className={`inline-block px-2 py-0.5 text-[10px] sm:text-xs font-mono uppercase tracking-wider border backdrop-blur-md ${slideAccent.badge}`}>
                                            {slide.badge}
                                        </span>
                                        {/* Slide Indicators */}
                                        <div className="flex items-center gap-1.5 ml-2">
                                            {slides.map((_, idx) => (
                                                <button
                                                    key={idx}
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        goToSlide(idx)
                                                    }}
                                                    className={`h-1.5 transition-all cursor-pointer border-none p-0 ${
                                                        idx === activeModIndex
                                                            ? 'w-5 bg-white'
                                                            : 'w-2 bg-white/30 hover:bg-white/60'
                                                    }`}
                                                    aria-label={`Slide ${idx + 1}`}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    <h2 className={`m-0 text-base sm:text-xl lg:text-2xl font-bold text-white tracking-wide leading-tight ${fontClass}`}>
                                        {slide.title}
                                    </h2>

                                    <p className={`m-0 text-xs sm:text-sm text-white/75 line-clamp-1 leading-normal ${fontClass}`}>
                                        {slide.desc}
                                    </p>
                                </div>

                                <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                                    <Link
                                        to={slide.ctaLink}
                                        onClick={(e) => e.stopPropagation()}
                                        className={`inline-flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 font-bold text-xs sm:text-sm border backdrop-blur-md transition-all active:scale-95 no-underline shadow-lg ${slideAccent.cta} ${fontClass}`}
                                    >
                                        <span>{slide.ctaText}</span>
                                        <Icon icon="pixelarticons:chevron-right" className="text-sm sm:text-base" />
                                    </Link>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
