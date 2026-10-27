import { useState, useEffect, useRef, type ReactNode, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { PageContainer } from '../components/PageContainer'
import { SEO } from '../components/SEO'
import { HomeHeroCarousel } from '../components/HomeHeroCarousel'
import { SkinShowcaseCarousel } from '../components/SkinShowcaseCarousel'
import { SpaceShowcaseCarousel } from '../components/SpaceShowcaseCarousel'
import { FigureShowcaseCarousel } from '../components/FigureShowcaseCarousel'
import type { LangData } from '../constants/lang'

interface HomePageProps {
    current: LangData
}

/**
 * Apple-style progressive scroll reveal container with smooth spring damping.
 * Elements glide up with weighted inertia as the user scrolls down the page.
 */
function ScrollReveal({
    children,
    delay = 0,
    y = 28,
    duration = 800,
    className = '',
    style = {},
    scale = 0.99
}: {
    children: ReactNode
    delay?: number
    y?: number
    duration?: number
    className?: string
    style?: CSSProperties
    scale?: number
}) {
    const [isVisible, setIsVisible] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const el = ref.current
        if (!el) return

        if (typeof IntersectionObserver === 'undefined') {
            setIsVisible(true)
            return
        }

        const checkInView = () => {
            if (!el) return
            const rect = el.getBoundingClientRect()
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight
            if (rect.top <= viewportHeight * 0.93 && rect.bottom >= 0) {
                setIsVisible(true)
            }
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true)
                    observer.unobserve(entry.target)
                }
            },
            {
                root: null,
                threshold: 0.08,
                rootMargin: '0px 0px -40px 0px'
            }
        )

        observer.observe(el)
        checkInView()

        const scrollParent = el.closest('.overflow-y-auto') || window
        const handleScroll = () => {
            if (!isVisible) checkInView()
        }
        scrollParent.addEventListener('scroll', handleScroll, { passive: true })

        return () => {
            observer.disconnect()
            scrollParent.removeEventListener('scroll', handleScroll)
        }
    }, [isVisible])

    return (
        <div
            ref={ref}
            className={className}
            style={{
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? 'translateY(0) scale(1)' : `translateY(${y}px) scale(${scale})`,
                transition: `opacity ${duration}ms cubic-bezier(0.16, 1, 0.3, 1), transform ${duration}ms cubic-bezier(0.16, 1, 0.3, 1)`,
                transitionDelay: `${delay}ms`,
                willChange: 'opacity, transform',
                ...style
            }}
        >
            {children}
        </div>
    )
}

export function HomePage({ current }: HomePageProps) {
    const data = current.home
    const fontClass = current.fontClass || 'font-pixel-hans'

    return (
        <div className={`relative w-full min-h-screen bg-transparent text-white selection:bg-emerald-500/30 selection:text-white overflow-x-hidden ${fontClass}`}>
            <SEO
                title={data.seo.title}
                description={data.seo.description}
                canonicalUrl="https://entropydrop.com/"
            />

            {/* ===================== STATIC BACKGROUND (AETHER ARCHIPELAGO) ===================== */}
            <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-[#1b2420]" aria-hidden="true">
                {/* Static Aether Archipelago Background - Exactly Matching SpacePage Opacity */}
                <img
                    src="/images/space_world_aether.webp"
                    srcSet="/images/space_world_aether_960.webp 960w, /images/space_world_aether.webp 1920w"
                    sizes="100vw"
                    alt=""
                    decoding="async"
                    className="absolute inset-0 w-full h-full object-cover object-[center_56%] opacity-100"
                />

                {/* Exact SpacePage Darkening Overlay: rgba(6, 11, 8, 0.4) (matches .space-world-background::after) */}
                <div className="absolute inset-0 bg-[#060b08]/40" />

                {/* Smooth horizontal gradient: 100% transparent on edges, subtle semi-transparent in center */}
                <div
                    className="absolute inset-0"
                    style={{
                        background: 'linear-gradient(90deg, rgba(6,11,8,0) 0%, rgba(6,11,8,0) 14%, rgba(6,11,8,0.16) 28%, rgba(6,11,8,0.28) 42%, rgba(6,11,8,0.28) 58%, rgba(6,11,8,0.16) 72%, rgba(6,11,8,0) 86%, rgba(6,11,8,0) 100%)'
                    }}
                />
            </div>


            <PageContainer
                alignItems="items-start"
                maxWidth="max-w-6xl"
                height="h-auto"
                overflow="overflow-visible"
                outerSpacing="p-1 sm:p-2 lg:p-3 pt-20 sm:pt-24 lg:pt-24"
                outerClassName="overflow-x-hidden"
                gap="gap-20 sm:gap-32"
                bg="bg-transparent"
                className={`relative z-10 border-none pb-32 pt-0 space-world-page scroll-smooth ${fontClass}`}
            >
                {/* ===================== HERO SECTION ===================== */}
                <section id="section-overview" className={`relative w-full flex flex-col items-center text-center gap-4 sm:gap-6 pt-2 sm:pt-4 scroll-mt-20 ${fontClass}`}>
                    {/* Apple-style Monumental Headline */}
                    <ScrollReveal delay={0} y={16}>
                        <h1 className={`m-0 text-3xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight max-w-4xl bg-gradient-to-b from-white via-white/95 to-white/50 bg-clip-text text-transparent ${fontClass}`}>
                            {data.hero.headlineMain}<br className="hidden sm:inline" />{data.hero.headlineSub}
                        </h1>
                    </ScrollReveal>

                    {/* Hero Product Carousel */}
                    <ScrollReveal delay={120} y={12} className="w-full mt-2 sm:mt-3">
                        <HomeHeroCarousel data={data.carousels.hero} fontClass={fontClass} />
                    </ScrollReveal>
                </section>

                {/* ===================== THE CREATIVE LOOP SECTION ===================== */}
                <section id="section-loop" className={`relative w-full flex flex-col gap-6 scroll-mt-20 ${fontClass}`}>
                    <ScrollReveal delay={0} y={16} className="text-center flex flex-col items-center gap-1.5">
                        <span className={`text-xs uppercase text-emerald-400 font-bold px-2.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 ${fontClass}`}>
                            {data.loop.tag}
                        </span>
                        <h2 className={`m-0 text-2xl sm:text-4xl font-bold text-white ${fontClass}`}>
                            {data.loop.title}
                        </h2>
                        <p className={`m-0 text-xs sm:text-sm text-white/60 max-w-lg ${fontClass}`}>
                            {data.loop.subtitle}
                        </p>
                    </ScrollReveal>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Step 1 */}
                        <ScrollReveal delay={80} y={18}>
                            <Link
                                to="/skin/generate"
                                className={`group relative border border-white/10 bg-[#0d0d0f]/80 hover:bg-[#121215] backdrop-blur-xl p-5 flex flex-col gap-2 h-full transition-all hover:border-emerald-500/40 no-underline ${fontClass}`}
                            >
                                <div className="flex items-center justify-between">
                                    <span className={`text-2xl font-bold text-emerald-400/80 group-hover:text-emerald-300 ${fontClass}`}>01</span>
                                    <Icon icon="pixelarticons:avatar" className="text-emerald-400 text-lg" />
                                </div>
                                <h3 className={`m-0 text-base font-bold text-white ${fontClass}`}>
                                    {data.loop.step1.title}
                                </h3>
                                <p className={`m-0 text-xs text-white/60 ${fontClass}`}>
                                    {data.loop.step1.desc}
                                </p>
                                <span className={`mt-auto pt-2 text-xs font-bold text-emerald-400 flex items-center gap-1 ${fontClass}`}>
                                    <span>{data.services.skin.ctaPrimary}</span>
                                    <span>›</span>
                                </span>
                            </Link>
                        </ScrollReveal>

                        {/* Step 2 */}
                        <ScrollReveal delay={140} y={18}>
                            <Link
                                to="/space/intro"
                                className={`group relative border border-white/10 bg-[#0d0d0f]/80 hover:bg-[#121215] backdrop-blur-xl p-5 flex flex-col gap-2 h-full transition-all hover:border-sky-500/40 no-underline ${fontClass}`}
                            >
                                <div className="flex items-center justify-between">
                                    <span className={`text-2xl font-bold text-sky-400/80 group-hover:text-sky-300 ${fontClass}`}>02</span>
                                    <Icon icon="pixelarticons:planet" className="text-sky-400 text-lg" />
                                </div>
                                <h3 className={`m-0 text-base font-bold text-white ${fontClass}`}>
                                    {data.loop.step2.title}
                                </h3>
                                <p className={`m-0 text-xs text-white/60 ${fontClass}`}>
                                    {data.loop.step2.desc}
                                </p>
                                <span className={`mt-auto pt-2 text-xs font-bold text-sky-400 flex items-center gap-1 ${fontClass}`}>
                                    <span>{data.services.space.ctaPrimary}</span>
                                    <span>›</span>
                                </span>
                            </Link>
                        </ScrollReveal>

                        {/* Step 3 */}
                        <ScrollReveal delay={200} y={18}>
                            <Link
                                to="/figure/3dprint"
                                className={`group relative border border-white/10 bg-[#0d0d0f]/80 hover:bg-[#121215] backdrop-blur-xl p-5 flex flex-col gap-2 h-full transition-all hover:border-amber-500/40 no-underline ${fontClass}`}
                            >
                                <div className="flex items-center justify-between">
                                    <span className={`text-2xl font-bold text-amber-400/80 group-hover:text-amber-300 ${fontClass}`}>03</span>
                                    <Icon icon="pixelarticons:cube" className="text-amber-400 text-lg" />
                                </div>
                                <h3 className={`m-0 text-base font-bold text-white ${fontClass}`}>
                                    {data.loop.step3.title}
                                </h3>
                                <p className={`m-0 text-xs text-white/60 ${fontClass}`}>
                                    {data.loop.step3.desc}
                                </p>
                                <span className={`mt-auto pt-2 text-xs font-bold text-amber-400 flex items-center gap-1 ${fontClass}`}>
                                    <span>{data.services.figure.ctaPrimary}</span>
                                    <span>›</span>
                                </span>
                            </Link>
                        </ScrollReveal>
                    </div>
                </section>

                {/* ===================== PRODUCT 01: AI SKIN STUDIO ===================== */}
                <section id="section-skin" className={`relative w-full flex flex-col gap-6 scroll-mt-20 ${fontClass}`}>
                    <div className="flex flex-col gap-2">
                        <ScrollReveal delay={0} y={14}>
                            <span className={`text-xs uppercase text-emerald-400 font-bold px-2.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 ${fontClass}`}>
                                {data.services.skin.tag}
                            </span>
                        </ScrollReveal>

                        <ScrollReveal delay={80} y={16}>
                            <h2 className={`m-0 text-3xl sm:text-5xl font-bold text-white leading-tight ${fontClass}`}>
                                {data.services.skin.title}
                            </h2>
                        </ScrollReveal>

                        <ScrollReveal delay={140} y={14}>
                            <p className={`m-0 text-sm sm:text-base text-white/70 max-w-xl leading-relaxed ${fontClass}`}>
                                {data.services.skin.desc}
                            </p>
                        </ScrollReveal>
                    </div>

                    {/* Reference to Skin Showcase Carousel */}
                    <ScrollReveal delay={180} y={16}>
                        <SkinShowcaseCarousel
                            data={data.carousels.skin}
                            fontClass={fontClass}
                            ctaText={data.services.skin.ctaPrimary}
                        />
                    </ScrollReveal>

                    {/* Concise 3-Pill Specs Strip */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className={`p-4 bg-[#0d0d0f]/80 border border-white/10 flex items-center justify-between gap-3 ${fontClass}`}>
                            <div>
                                <span className={`text-[10px] text-emerald-400 font-bold block ${fontClass}`}>{data.services.skin.cards.topology.tag}</span>
                                <span className={`text-sm font-bold text-white block ${fontClass}`}>{data.services.skin.cards.topology.title}</span>
                            </div>
                            <span className={`text-xs text-white/50 shrink-0 ${fontClass}`}>{data.services.skin.cards.topology.badge}</span>
                        </div>

                        <div className={`p-4 bg-[#0d0d0f]/80 border border-white/10 flex items-center justify-between gap-3 ${fontClass}`}>
                            <div>
                                <span className={`text-[10px] text-emerald-400 font-bold block ${fontClass}`}>{data.services.skin.cards.capability.tag}</span>
                                <span className={`text-sm font-bold text-white block ${fontClass}`}>{data.services.skin.cards.capability.title}</span>
                            </div>
                            <span className={`text-xs text-emerald-400 font-bold shrink-0 ${fontClass}`}>{data.services.skin.cards.capability.badge}</span>
                        </div>

                        <Link
                            to="/skin/edit"
                            className={`p-4 bg-[#0d0d0f]/80 border border-white/10 hover:border-emerald-500/40 flex items-center justify-between gap-3 no-underline transition-all ${fontClass}`}
                        >
                            <div>
                                <span className={`text-[10px] text-emerald-400 font-bold block ${fontClass}`}>{data.services.skin.cards.editor.tag}</span>
                                <span className={`text-sm font-bold text-white block ${fontClass}`}>{data.services.skin.cards.editor.title}</span>
                            </div>
                            <span className={`text-xs text-emerald-400 font-bold shrink-0 ${fontClass}`}>{data.services.skin.ctaTertiary} ›</span>
                        </Link>
                    </div>

                    <div className={`flex flex-wrap items-center gap-4 pt-1 ${fontClass}`}>
                        <Link to="/skin/generate" className={`text-xs font-bold text-emerald-400 hover:underline no-underline ${fontClass}`}>
                            {data.services.skin.ctaPrimary} ›
                        </Link>
                        <Link to="/skin/" className={`text-xs font-bold text-white/70 hover:text-white no-underline ${fontClass}`}>
                            {data.services.skin.ctaSecondary} ›
                        </Link>
                    </div>
                </section>

                {/* ===================== PRODUCT 02: ENTROPY SPACE ===================== */}
                <section id="section-space" className={`relative w-full flex flex-col gap-6 scroll-mt-20 ${fontClass}`}>
                    <div className="flex flex-col gap-2">
                        <ScrollReveal delay={0} y={14}>
                            <span className={`text-xs uppercase text-sky-400 font-bold px-2.5 py-0.5 bg-sky-500/10 border border-sky-500/20 ${fontClass}`}>
                                {data.services.space.tag}
                            </span>
                        </ScrollReveal>

                        <ScrollReveal delay={80} y={16}>
                            <h2 className={`m-0 text-3xl sm:text-5xl font-bold text-white leading-tight ${fontClass}`}>
                                {data.services.space.title}
                            </h2>
                        </ScrollReveal>

                        <ScrollReveal delay={140} y={14}>
                            <p className={`m-0 text-sm sm:text-base text-white/70 max-w-xl leading-relaxed ${fontClass}`}>
                                {data.services.space.desc}
                            </p>
                        </ScrollReveal>
                    </div>

                    {/* Voxel Multiverse Carousel */}
                    <ScrollReveal delay={180} y={16}>
                        <SpaceShowcaseCarousel
                            data={data.carousels.space}
                            fontClass={fontClass}
                            ctaText={data.services.space.ctaPrimary}
                        />
                    </ScrollReveal>

                    {/* Concise 3-Pill Specs Strip */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className={`p-4 bg-[#0d0d0f]/80 border border-white/10 flex items-center justify-between gap-3 ${fontClass}`}>
                            <div>
                                <span className={`text-[10px] text-sky-400 font-bold block ${fontClass}`}>{data.services.space.cards.graphics.tag}</span>
                                <span className={`text-sm font-bold text-white block ${fontClass}`}>{data.services.space.cards.graphics.title}</span>
                            </div>
                            <span className={`text-xs text-sky-400 font-bold shrink-0 ${fontClass}`}>{data.services.space.cards.graphics.badge}</span>
                        </div>

                        <div className={`p-4 bg-[#0d0d0f]/80 border border-white/10 flex items-center justify-between gap-3 ${fontClass}`}>
                            <div>
                                <span className={`text-[10px] text-sky-400 font-bold block ${fontClass}`}>{data.services.space.cards.physics.tag}</span>
                                <span className={`text-sm font-bold text-white block ${fontClass}`}>{data.services.space.cards.physics.title}</span>
                            </div>
                            <span className={`text-xs text-white/50 shrink-0 ${fontClass}`}>{data.services.space.cards.physics.badge}</span>
                        </div>

                        <div className={`p-4 bg-[#0d0d0f]/80 border border-white/10 flex items-center justify-between gap-3 ${fontClass}`}>
                            <div>
                                <span className={`text-[10px] text-sky-400 font-bold block ${fontClass}`}>{data.services.space.cards.protocol.tag}</span>
                                <span className={`text-sm font-bold text-white block ${fontClass}`}>{data.services.space.cards.protocol.title}</span>
                            </div>
                            <span className={`text-xs text-sky-400 font-bold shrink-0 ${fontClass}`}>{data.services.space.cards.protocol.badge}</span>
                        </div>
                    </div>

                    <div className={`flex flex-wrap items-center gap-4 pt-1 ${fontClass}`}>
                        <Link to="/space/intro" className={`text-xs font-bold text-sky-400 hover:underline no-underline ${fontClass}`}>
                            {data.services.space.ctaPrimary} ›
                        </Link>
                        <Link to="/space/intro" className={`text-xs font-bold text-white/70 hover:text-white no-underline ${fontClass}`}>
                            {data.services.space.ctaSecondary} ›
                        </Link>
                    </div>
                </section>

                {/* ===================== PRODUCT 03: MINEFIGURE 3D ===================== */}
                <section id="section-figure" className={`relative w-full flex flex-col gap-6 scroll-mt-20 ${fontClass}`}>
                    <div className="flex flex-col gap-2">
                        <ScrollReveal delay={0} y={14}>
                            <span className={`text-xs uppercase text-amber-400 font-bold px-2.5 py-0.5 bg-amber-500/10 border border-amber-500/20 ${fontClass}`}>
                                {data.services.figure.tag}
                            </span>
                        </ScrollReveal>

                        <ScrollReveal delay={80} y={16}>
                            <h2 className={`m-0 text-3xl sm:text-5xl font-bold text-white leading-tight ${fontClass}`}>
                                {data.services.figure.title}
                            </h2>
                        </ScrollReveal>

                    </div>

                    {/* Physical Reality Figure Carousel */}
                    <ScrollReveal delay={180} y={16}>
                        <FigureShowcaseCarousel
                            data={data.carousels.figure}
                            fontClass={fontClass}
                            ctaText={data.services.figure.ctaPrimary}
                            previewImage="/images/figure_physical_showcase.jpg"
                        />
                    </ScrollReveal>

                    {/* Articulated Figure Customization Card */}
                    <div className={`p-4 bg-[#0d0d0f]/80 border border-white/10 flex items-center justify-between gap-3 ${fontClass}`}>
                        <div>
                            <span className={`text-[10px] text-amber-300 font-bold block ${fontClass}`}>{data.services.figure.customCraft.tag}</span>
                            <span className={`text-sm font-bold text-white block ${fontClass}`}>{data.services.figure.customCraft.title}</span>
                            <span className={`text-xs text-white/60 block mt-0.5 ${fontClass}`}>{data.services.figure.customCraft.desc}</span>
                        </div>
                        <Link to="/figure/3dprint" className={`text-xs font-bold text-amber-400 hover:underline shrink-0 no-underline ${fontClass}`}>
                            <span>{data.services.figure.customCraft.cta} ›</span>
                        </Link>
                    </div>
                </section>


                {/* ===================== CHAPTER 04: OPEN-SOURCE ===================== */}
                <section id="section-opensource" className={`relative w-full flex flex-col gap-6 scroll-mt-20 ${fontClass}`}>
                    <div className="flex flex-col gap-2">
                        <ScrollReveal delay={0} y={16}>
                            <h2 className={`m-0 text-3xl sm:text-5xl font-bold text-white leading-tight ${fontClass}`}>
                                {data.openSource.title}
                            </h2>
                        </ScrollReveal>

                        <ScrollReveal delay={80} y={14}>
                            <p className={`m-0 text-sm text-white/70 max-w-xl leading-relaxed ${fontClass}`}>
                                {data.openSource.desc}
                            </p>
                        </ScrollReveal>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <a
                            href="https://github.com/EntropyDrop"
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`p-5 bg-[#0d0d0f]/80 border border-white/10 flex flex-col justify-between hover:border-purple-500/40 transition-colors no-underline ${fontClass}`}
                        >
                            <div>
                                <Icon icon="pixelarticons:git-branch" className="text-purple-400 text-xl mb-2" />
                                <h3 className={`m-0 text-base font-bold text-white ${fontClass}`}>{data.openSource.cards.github.title}</h3>
                                <p className={`mt-1.5 text-xs text-white/60 leading-relaxed ${fontClass}`}>{data.openSource.cards.github.desc}</p>
                            </div>
                            <span className={`pt-3 text-xs font-bold text-purple-400 flex items-center gap-1 ${fontClass}`}>
                                <span>{data.openSource.cards.github.cta}</span>
                                <span>›</span>
                            </span>
                        </a>

                        <a
                            href="https://huggingface.co/EntropyDrop"
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`p-5 bg-[#0d0d0f]/80 border border-white/10 flex flex-col justify-between hover:border-amber-400/50 transition-colors no-underline ${fontClass}`}
                        >
                            <div>
                                <Icon icon="simple-icons:huggingface" className="text-amber-400 text-xl mb-2" />
                                <h3 className={`m-0 text-base font-bold text-white ${fontClass}`}>{data.openSource.cards.huggingface.title}</h3>
                                <p className={`mt-1.5 text-xs text-white/60 leading-relaxed ${fontClass}`}>{data.openSource.cards.huggingface.desc}</p>
                            </div>
                            <span className={`pt-3 text-xs font-bold text-amber-400 flex items-center gap-1 ${fontClass}`}>
                                <span>{data.openSource.cards.huggingface.cta}</span>
                                <span>›</span>
                            </span>
                        </a>

                        <Link
                            to="/public/ledger"
                            className={`p-5 bg-[#0d0d0f]/80 border border-white/10 flex flex-col justify-between hover:border-emerald-500/40 transition-colors no-underline ${fontClass}`}
                        >
                            <div>
                                <Icon icon="pixelarticons:coin" className="text-emerald-400 text-xl mb-2" />
                                <h3 className={`m-0 text-base font-bold text-white ${fontClass}`}>{data.openSource.cards.ledger.title}</h3>
                                <p className={`mt-1.5 text-xs text-white/60 leading-relaxed ${fontClass}`}>{data.openSource.cards.ledger.desc}</p>
                            </div>
                            <span className={`pt-3 text-xs font-bold text-emerald-400 flex items-center gap-1 ${fontClass}`}>
                                <span>{data.openSource.ctaLedger}</span>
                                <span>›</span>
                            </span>
                        </Link>
                    </div>
                </section>

                {/* ===================== GRAND FINALE HERO CTA ===================== */}
                <section className={`relative w-full border border-white/10 bg-gradient-to-b from-[#131613] via-[#0d0f0d] to-black p-8 sm:p-14 text-center flex flex-col items-center gap-5 shadow-2xl overflow-hidden ${fontClass}`}>
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(16,185,129,0.12)_0%,transparent_70%)] pointer-events-none" />

                    <ScrollReveal delay={0} y={16}>
                        <h2 className={`m-0 text-2xl sm:text-4xl font-bold text-white leading-tight ${fontClass}`}>
                            {data.footerCta.title}
                        </h2>
                    </ScrollReveal>

                    <ScrollReveal delay={80} y={14}>
                        <p className={`m-0 text-xs sm:text-sm text-white/65 max-w-md ${fontClass}`}>
                            {data.footerCta.subtitle}
                        </p>
                    </ScrollReveal>

                    <ScrollReveal delay={140} y={16}>
                        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                            <Link
                                to="/space/intro"
                                className={`px-6 py-3 bg-[#3c8527] hover:bg-[#4ea632] text-white font-bold text-xs sm:text-sm transition-all border border-black no-underline flex items-center gap-1.5 ${fontClass}`}
                            >
                                <span>{data.hero.quickStartSpace}</span>
                                <Icon icon="pixelarticons:chevron-right" className="text-xs" />
                            </Link>

                            <Link
                                to="/figure/3dprint"
                                className={`px-6 py-3 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 font-bold text-xs sm:text-sm border border-amber-500/30 transition-all no-underline flex items-center gap-1.5 ${fontClass}`}
                            >
                                <span>{data.services.figure.ctaPrimary}</span>
                                <Icon icon="pixelarticons:chevron-right" className="text-xs" />
                            </Link>
                        </div>
                    </ScrollReveal>
                </section>
            </PageContainer>
        </div>
    )
}
