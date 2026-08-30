import { Icon } from '@iconify/react'

import { PageContainer } from '../components/PageContainer'
import { SEO } from '../components/SEO'
import { type LangData } from '../constants/lang'

interface SpacePageProps {
    current: LangData
}

const featureIcons = [
    'pixelarticons:buildings',
    'pixelarticons:edit',
    'pixelarticons:code',
    'pixelarticons:users',
] as const

const stepIcons = [
    'pixelarticons:avatar',
    'pixelarticons:buildings',
    'pixelarticons:zap',
] as const

export function SpacePage({ current }: SpacePageProps) {
    const data = current.space_page
    const spaceAppUrl = import.meta.env.VITE_SPACE_URL || '/space/app/'

    return (
        <PageContainer
            alignItems="items-start"
            height="h-full"
            gap="gap-8 sm:gap-10"
            className="relative"
        >
            <SEO title={data.title} description={data.description} />

            <section className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8 border-b border-white/10 pb-8 sm:pb-10 shrink-0">
                <div className="lg:col-span-3 flex flex-col justify-center gap-5 py-2 sm:py-5">
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="inline-flex items-center gap-2 border border-green-500/30 bg-green-500/10 px-2.5 py-1 text-[10px] sm:text-xs font-mono uppercase tracking-[0.18em] text-green-400">
                            <span className="h-1.5 w-1.5 bg-green-400 animate-pulse" />
                            {data.eyebrow}
                        </span>
                        <span className="text-[10px] sm:text-xs font-mono uppercase tracking-[0.16em] text-white/35">
                            {data.platform}
                        </span>
                    </div>

                    <div className="flex flex-col gap-3">
                        <h1 className={`m-0 text-3xl sm:text-5xl lg:text-6xl font-bold leading-[1.08] bg-gradient-to-r from-white via-white/90 to-green-300/60 bg-clip-text text-transparent ${current.fontClass}`}>
                            {data.title}
                        </h1>
                        <p className={`m-0 text-lg sm:text-2xl text-green-300/90 leading-relaxed ${current.fontClass}`}>
                            {data.tagline}
                        </p>
                        <p className={`m-0 max-w-2xl text-sm sm:text-base leading-7 text-white/60 ${current.fontClass}`}>
                            {data.description}
                        </p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 pt-1">
                        <a
                            href={spaceAppUrl}
                            className={`group inline-flex min-h-11 items-center justify-center gap-2 border-2 border-black bg-[#3c8527] px-5 py-2.5 text-sm font-bold text-white shadow-[4px_4px_0_rgba(0,0,0,0.55)] transition-all hover:bg-[#4ea632] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none ${current.fontClass}`}
                        >
                            <Icon icon="pixelarticons:play" className="text-lg" />
                            {data.primaryCta}
                            <Icon icon="pixelarticons:arrow-right" className="text-base transition-transform group-hover:translate-x-1" />
                        </a>
                        <a
                            href="#space-workflow"
                            className={`inline-flex min-h-11 items-center justify-center gap-2 border border-white/15 bg-white/5 px-5 py-2.5 text-sm text-white/70 transition-all hover:border-white/30 hover:bg-white/10 hover:text-white ${current.fontClass}`}
                        >
                            <Icon icon="pixelarticons:book-open" className="text-lg" />
                            {data.secondaryCta}
                        </a>
                    </div>
                </div>

                <div className="lg:col-span-2 min-h-[300px] sm:min-h-[380px]">
                    <div
                        role="img"
                        aria-label={data.heroPlaceholder.label}
                        className="relative h-full min-h-[300px] overflow-hidden border border-white/15 bg-black/30 p-4 shadow-2xl"
                    >
                        <div className="absolute inset-0 opacity-25 bg-[linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:24px_24px]" />
                        <div className="absolute inset-3 border border-dashed border-green-400/25" />
                        <div className="relative z-10 flex h-full min-h-[270px] flex-col items-center justify-center gap-4 text-center">
                            <div className="flex h-20 w-20 items-center justify-center border border-green-400/20 bg-green-500/10 text-green-300 shadow-[0_0_50px_rgba(74,222,128,0.12)]">
                                <Icon icon="pixelarticons:image" className="text-4xl" />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <span className={`text-sm font-bold text-white/75 ${current.fontClass}`}>
                                    {data.heroPlaceholder.label}
                                </span>
                                <span className={`text-xs text-white/35 ${current.fontClass}`}>
                                    {data.heroPlaceholder.hint}
                                </span>
                            </div>
                        </div>
                        <span className="absolute left-5 top-5 z-10 font-mono text-[10px] uppercase tracking-[0.2em] text-green-400/60">
                            SPACE // 01
                        </span>
                        <span className="absolute bottom-5 right-5 z-10 font-mono text-[10px] uppercase tracking-[0.2em] text-white/25">
                            16:9
                        </span>
                    </div>
                </div>
            </section>

            <section className="flex flex-col gap-4 shrink-0">
                <div className="flex items-center gap-3">
                    <Icon icon="pixelarticons:sparkles" className="text-xl text-green-400" />
                    <h2 className={`m-0 text-lg sm:text-xl font-bold text-white ${current.fontClass}`}>
                        {data.featuresTitle}
                    </h2>
                    <div className="h-px flex-1 bg-white/10" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {data.features.map((feature, index) => (
                        <article
                            key={feature.title}
                            className="group flex min-h-48 flex-col gap-4 border border-white/10 bg-white/5 p-5 transition-all hover:border-green-500/30 hover:bg-white/[0.08]"
                        >
                            <div className="flex items-center justify-between">
                                <Icon icon={featureIcons[index] || 'pixelarticons:zap'} className="text-2xl text-green-400/80 transition-transform group-hover:-translate-y-0.5" />
                                <span className="font-mono text-[10px] text-white/20">0{index + 1}</span>
                            </div>
                            <div className="flex flex-col gap-2">
                                <h3 className={`m-0 text-base font-bold text-white ${current.fontClass}`}>
                                    {feature.title}
                                </h3>
                                <p className={`m-0 text-sm leading-6 text-white/50 ${current.fontClass}`}>
                                    {feature.description}
                                </p>
                            </div>
                        </article>
                    ))}
                </div>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-5 gap-6 border-y border-white/10 py-8 sm:py-10 shrink-0">
                <div
                    role="img"
                    aria-label={data.showcase.placeholder}
                    className="relative lg:col-span-3 min-h-[280px] sm:min-h-[360px] overflow-hidden border border-white/15 bg-gradient-to-br from-white/[0.07] to-transparent"
                >
                    <div className="absolute inset-4 border border-dashed border-white/15" />
                    <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,rgba(74,222,128,0.7)_1px,transparent_1.5px)] bg-[size:28px_28px]" />
                    <div className="relative z-10 flex h-full min-h-[280px] flex-col items-center justify-center gap-3 px-6 text-center">
                        <Icon icon="pixelarticons:camera" className="text-4xl text-white/30" />
                        <span className={`text-sm text-white/55 ${current.fontClass}`}>
                            {data.showcase.placeholder}
                        </span>
                    </div>
                </div>

                <div className="lg:col-span-2 flex flex-col justify-center gap-5 lg:px-3">
                    <span className="font-mono text-xs uppercase tracking-[0.2em] text-blue-400/80">
                        {data.showcase.eyebrow}
                    </span>
                    <h2 className={`m-0 text-2xl sm:text-3xl font-bold leading-tight text-white ${current.fontClass}`}>
                        {data.showcase.title}
                    </h2>
                    <p className={`m-0 text-sm leading-7 text-white/55 ${current.fontClass}`}>
                        {data.showcase.description}
                    </p>
                    <div className="flex flex-col gap-3">
                        {data.showcase.bullets.map((bullet) => (
                            <div key={bullet} className="flex items-start gap-3">
                                <Icon icon="pixelarticons:check" className="mt-0.5 shrink-0 text-lg text-green-400" />
                                <span className={`text-sm leading-6 text-white/70 ${current.fontClass}`}>{bullet}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section id="space-workflow" className="scroll-mt-6 flex flex-col gap-5 shrink-0">
                <div className="max-w-2xl flex flex-col gap-2">
                    <h2 className={`m-0 text-xl sm:text-2xl font-bold text-white ${current.fontClass}`}>
                        {data.workflow.title}
                    </h2>
                    <p className={`m-0 text-sm leading-6 text-white/50 ${current.fontClass}`}>
                        {data.workflow.description}
                    </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {data.workflow.steps.map((step, index) => (
                        <article key={step.title} className="relative border border-white/10 bg-black/25 p-5">
                            <div className="mb-5 flex items-center justify-between">
                                <div className="flex h-10 w-10 items-center justify-center border border-green-500/25 bg-green-500/10 text-green-300">
                                    <Icon icon={stepIcons[index] || 'pixelarticons:zap'} className="text-xl" />
                                </div>
                                <span className="font-mono text-xs text-white/25">STEP 0{index + 1}</span>
                            </div>
                            <h3 className={`m-0 text-base font-bold text-white ${current.fontClass}`}>{step.title}</h3>
                            <p className={`mb-0 mt-2 text-sm leading-6 text-white/50 ${current.fontClass}`}>{step.description}</p>
                        </article>
                    ))}
                </div>
            </section>

            <section className="relative overflow-hidden border border-green-500/25 bg-gradient-to-r from-green-500/15 via-white/5 to-blue-500/10 p-6 sm:p-8 shrink-0">
                <div className="absolute -right-12 -top-12 h-40 w-40 bg-green-500/10 blur-3xl" />
                <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                    <div className="flex max-w-3xl flex-col gap-2">
                        <h2 className={`m-0 text-xl sm:text-2xl font-bold text-white ${current.fontClass}`}>
                            {data.closing.title}
                        </h2>
                        <p className={`m-0 text-sm leading-6 text-white/55 ${current.fontClass}`}>
                            {data.closing.description}
                        </p>
                    </div>
                    <a
                        href={spaceAppUrl}
                        className={`group inline-flex min-h-11 shrink-0 items-center justify-center gap-2 border border-green-400/50 bg-green-500/20 px-5 py-2.5 text-sm font-bold text-green-200 transition-all hover:bg-green-500/30 hover:text-white ${current.fontClass}`}
                    >
                        {data.primaryCta}
                        <Icon icon="pixelarticons:chevron-right" className="text-lg transition-transform group-hover:translate-x-1" />
                    </a>
                </div>
            </section>
        </PageContainer>
    )
}
