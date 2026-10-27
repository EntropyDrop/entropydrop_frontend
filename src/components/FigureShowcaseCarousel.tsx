import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon } from '@iconify/react'
import type { LangData } from '../constants/lang'

export interface FigureShowcaseCarouselProps {
    data: LangData['home']['carousels']['figure']
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

export function FigureShowcaseCarousel({ data, fontClass, ctaText }: FigureShowcaseCarouselProps) {
    const navigate = useNavigate()

    const slides: FigureSlide[] = [
        {
            id: 'lineup',
            title: data.lineup.title,
            badge: data.lineup.badge,
            desc: data.lineup.desc,
            image: '/images/figure_physical_showcase.jpg',
            imageAlt: data.lineup.imageAlt
        },
        {
            id: 'trio',
            title: data.trio.title,
            badge: data.trio.badge,
            desc: data.trio.desc,
            image: '/images/figure_trio_showcase.jpg',
            imageAlt: data.trio.imageAlt
        },
        {
            id: 'duo',
            title: data.duo.title,
            badge: data.duo.badge,
            desc: data.duo.desc,
            image: '/images/figure_duo_showcase.jpg',
            imageAlt: data.duo.imageAlt
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

    const handleSlideClick = (index: number) => {
        if (isAnimating || !enableTransition) return
        const isCycleActive = index === currentIndex || (currentIndex >= 6 && index === currentIndex - 3) || (currentIndex < 3 && index === currentIndex + 3)
        const isCyclePrev = index === currentIndex - 1 || (currentIndex >= 6 && index === currentIndex - 4) || (currentIndex < 3 && index === currentIndex + 2)
        const isCycleNext = index === currentIndex + 1 || (currentIndex >= 6 && index === currentIndex - 2) || (currentIndex < 3 && index === currentIndex + 4)

        if (isCycleActive) {
            navigate('/figure/3dprint')
        } else if (isCyclePrev) {
            prevSlide()
        } else if (isCycleNext) {
            nextSlide()
        } else {
            goToSlide(index % slides.length)
        }
    }

    return (
        <div
            className={`relative w-full max-w-7xl mx-auto overflow-visible select-none group/figure-carousel ${fontClass}`}
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

                    return (
                        <div
                            key={`${slide.id}-${index}`}
                            onClick={() => handleSlideClick(index)}
                            aria-hidden={isFar}
                            className={`flex-none w-[82%] aspect-video relative select-none overflow-hidden cursor-pointer ${
                                isFar
                                    ? 'opacity-0 pointer-events-none invisible z-0'
                                    : isCycleActive
                                        ? 'opacity-100 z-20 border border-amber-500/40'
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
                                    ? '0 25px 60px -12px rgba(0, 0, 0, 0.95), 0 0 45px -5px rgba(245, 158, 11, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.15)'
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
                                    isCycleActive ? 'group-hover/figure-carousel:scale-[1.015]' : ''
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

                            {/* Bottom-Right CTA Button Only */}
                            <div
                                className={`absolute bottom-3 sm:bottom-4 right-3 sm:right-4 z-30 ${
                                    isCycleActive
                                        ? 'opacity-100 translate-y-0 pointer-events-auto'
                                        : 'opacity-0 translate-y-4 pointer-events-none'
                                }`}
                                style={{
                                    transition: enableTransition ? 'opacity 500ms ease-out, transform 500ms ease-out' : 'none'
                                }}
                            >
                                <Link
                                    to="/figure/3dprint"
                                    onClick={(e) => e.stopPropagation()}
                                    className={`inline-flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 font-bold text-xs sm:text-sm border border-black backdrop-blur-md transition-all active:scale-95 no-underline shadow-xl bg-amber-500 hover:bg-amber-400 text-black shadow-amber-950/60 ${fontClass}`}
                                >
                                    <span>{ctaText || data.defaultCta}</span>
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
