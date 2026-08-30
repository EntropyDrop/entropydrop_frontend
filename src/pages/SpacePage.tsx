import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Link } from 'react-router-dom'

import { PageContainer } from '../components/PageContainer'
import { SEO } from '../components/SEO'
import { type LangData } from '../constants/lang'

interface SpacePageProps {
    current: LangData
}

export function SpacePage({ current }: SpacePageProps) {
    const data = current.space_page
    const spaceAppUrl = import.meta.env.VITE_SPACE_URL || '/space/app/'

    const [activeTab, setActiveTab] = useState<'compiler' | 'voxel' | 'workflow'>('compiler')
    const [selectedPresetId, setSelectedPresetId] = useState<string>('hover')
    const [voxelMode, setVoxelMode] = useState<'standard' | 'micro'>('micro')
    const [copiedCode, setCopiedCode] = useState(false)

    const activePreset = data.compilerDemo.presets.find(p => p.id === selectedPresetId) || data.compilerDemo.presets[0]

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text)
        setCopiedCode(true)
        setTimeout(() => setCopiedCode(false), 2000)
    }

    return (
        <PageContainer
            alignItems="items-start"
            height="h-full"
            gap="gap-8 sm:gap-12"
            className="relative"
        >
            <SEO title={data.title} description={data.description} />

            {/* ===================== HERO SECTION ===================== */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 border-b border-white/10 pb-10 sm:pb-12 shrink-0 w-full">
                {/* Left Col: Hero Information */}
                <div className="lg:col-span-7 flex flex-col justify-center gap-5 py-2">
                    {/* Badge row */}
                    <div className="flex flex-wrap items-center gap-2.5">
                        <span className="inline-flex items-center gap-2 border border-green-500/40 bg-green-500/10 px-2.5 py-1 text-[11px] sm:text-xs font-mono uppercase tracking-wider text-green-400">
                            <span className="h-2 w-2 rounded-none bg-green-400 animate-pulse" />
                            {data.eyebrow}
                        </span>
                        <span className="inline-flex items-center gap-1.5 border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] sm:text-xs font-mono uppercase tracking-wider text-white/70">
                            <Icon icon="pixelarticons:zap" className="text-green-400" />
                            {data.platform}
                        </span>
                    </div>

                    {/* Main Title & Tagline */}
                    <div className="flex flex-col gap-3">
                        <h1 className={`m-0 text-3xl sm:text-5xl lg:text-6xl font-bold leading-[1.08] bg-gradient-to-r from-white via-white/95 to-green-300/70 bg-clip-text text-transparent ${current.fontClass}`}>
                            {data.title}
                        </h1>
                        <p className={`m-0 text-lg sm:text-2xl font-semibold text-green-400/90 leading-snug ${current.fontClass}`}>
                            {data.tagline}
                        </p>
                        <p className={`m-0 max-w-2xl text-sm sm:text-base leading-relaxed text-white/70 ${current.fontClass}`}>
                            {data.description}
                        </p>
                    </div>

                    {/* Stat Badges Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 py-2">
                        <div className="border border-white/10 bg-black/30 p-2.5 flex flex-col gap-1">
                            <span className="text-[10px] font-mono uppercase tracking-wider text-white/40">GEOMETRY</span>
                            <span className={`text-xs font-bold text-white ${current.fontClass}`}>{data.stats.scale}</span>
                        </div>
                        <div className="border border-white/10 bg-black/30 p-2.5 flex flex-col gap-1">
                            <span className="text-[10px] font-mono uppercase tracking-wider text-white/40">SIMULATION</span>
                            <span className={`text-xs font-bold text-green-400 ${current.fontClass}`}>{data.stats.physics}</span>
                        </div>
                        <div className="border border-white/10 bg-black/30 p-2.5 flex flex-col gap-1">
                            <span className="text-[10px] font-mono uppercase tracking-wider text-white/40">ENGINE</span>
                            <span className={`text-xs font-bold text-white ${current.fontClass}`}>{data.stats.runtime}</span>
                        </div>
                        <div className="border border-white/10 bg-black/30 p-2.5 flex flex-col gap-1">
                            <span className="text-[10px] font-mono uppercase tracking-wider text-white/40">INTELLIGENCE</span>
                            <span className={`text-xs font-bold text-blue-400 ${current.fontClass}`}>{data.stats.agents}</span>
                        </div>
                    </div>

                    {/* CTA Buttons */}
                    <div className="flex flex-col sm:flex-row gap-3 pt-2">
                        <a
                            href={spaceAppUrl}
                            className={`group inline-flex min-h-12 items-center justify-center gap-2.5 border-2 border-black bg-[#3c8527] px-7 py-3 text-base font-bold text-white shadow-[4px_4px_0_rgba(0,0,0,0.55)] transition-all hover:bg-[#4ea632] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none no-underline ${current.fontClass}`}
                        >
                            <Icon icon="pixelarticons:play" className="text-xl" />
                            <span>{data.primaryCta}</span>
                            <Icon icon="pixelarticons:arrow-right" className="text-lg transition-transform group-hover:translate-x-1.5" />
                        </a>
                        <a
                            href="#space-sandbox"
                            className={`inline-flex min-h-12 items-center justify-center gap-2 border border-white/20 bg-white/5 px-6 py-3 text-sm text-white/80 transition-all hover:border-white/40 hover:bg-white/10 hover:text-white no-underline ${current.fontClass}`}
                        >
                            <Icon icon="pixelarticons:sliders" className="text-lg text-green-400" />
                            <span>{data.secondaryCta}</span>
                        </a>
                    </div>

                    {/* Skin Prerequisite Alert */}
                    <div className="flex items-center justify-between gap-3 border border-yellow-500/25 bg-yellow-500/5 p-3 sm:p-3.5 mt-1">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <Icon icon="pixelarticons:avatar" className="text-lg text-yellow-400 shrink-0" />
                            <div className="flex flex-col min-w-0">
                                <span className={`text-xs font-bold text-yellow-200 ${current.fontClass}`}>
                                    {data.skinNotice.title}
                                </span>
                                <span className={`text-[11px] text-white/60 truncate ${current.fontClass}`}>
                                    {data.skinNotice.description}
                                </span>
                            </div>
                        </div>
                        <Link
                            to="/skin/edit"
                            className={`shrink-0 border border-yellow-500/30 bg-yellow-500/10 hover:bg-yellow-500/20 px-3 py-1.5 text-xs font-bold text-yellow-300 hover:text-yellow-200 transition-all no-underline ${current.fontClass}`}
                        >
                            {data.skinNotice.action}
                        </Link>
                    </div>
                </div>

                {/* Right Col: Interactive 3D Voxel Telemetry HUD */}
                <div className="lg:col-span-5 flex flex-col">
                    <div className="relative h-full min-h-[380px] overflow-hidden border border-green-500/30 bg-black/50 p-5 shadow-2xl flex flex-col justify-between group">
                        {/* Background Grid & Scanline */}
                        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,rgba(74,222,128,0.8)_1px,transparent_1.5px)] bg-[size:24px_24px] pointer-events-none" />
                        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-green-400 to-transparent opacity-50" />

                        {/* Top HUD Header */}
                        <div className="relative z-10 flex items-center justify-between border-b border-white/10 pb-3">
                            <div className="flex items-center gap-2">
                                <div className="h-2 w-2 bg-green-400 animate-ping" />
                                <span className="font-mono text-xs font-bold text-green-400 tracking-widest">
                                    LIVE ENTITY // #0x7F2B
                                </span>
                            </div>
                            <span className="font-mono text-[10px] text-white/40 uppercase tracking-widest">
                                TORUS WORLD
                            </span>
                        </div>

                        {/* Middle: 3D Hologram Wireframe Representation */}
                        <div className="relative z-10 my-auto py-6 flex flex-col items-center justify-center">
                            {/* Animated Isometric Voxel Cube Mockup */}
                            <div className="relative w-36 h-36 flex items-center justify-center">
                                {/* Outer radar rings */}
                                <div className="absolute inset-0 border border-green-500/20 rounded-full animate-spin [animation-duration:15s]" />
                                <div className="absolute inset-3 border border-dashed border-green-400/30 rounded-full animate-spin [animation-duration:25s] [animation-direction:reverse]" />

                                {/* 3D Voxel Cluster Graphic */}
                                <div className="relative z-20 flex flex-col items-center">
                                    <div className="grid grid-cols-3 gap-1 p-2 border border-green-400/40 bg-green-500/10 shadow-[0_0_30px_rgba(74,222,128,0.2)]">
                                        <div className="w-5 h-5 bg-[#3c8527] border border-green-300/40 shadow-sm" />
                                        <div className="w-5 h-5 bg-[#4ea632] border border-green-300/40 shadow-sm animate-pulse" />
                                        <div className="w-5 h-5 bg-[#a6df7a] border border-green-300/40 shadow-sm" />
                                        <div className="w-5 h-5 bg-[#255418] border border-green-300/40 shadow-sm" />
                                        <div className="w-5 h-5 bg-[#3c8527] border border-green-300/40 shadow-sm" />
                                        <div className="w-5 h-5 bg-[#4ea632] border border-green-300/40 shadow-sm" />
                                        <div className="w-5 h-5 bg-[#17380f] border border-green-300/40 shadow-sm" />
                                        <div className="w-5 h-5 bg-[#255418] border border-green-300/40 shadow-sm" />
                                        <div className="w-5 h-5 bg-[#3c8527] border border-green-300/40 shadow-sm" />
                                    </div>
                                    <div className="mt-2 font-mono text-[10px] text-green-300 font-bold tracking-wider">
                                        RIGIDBODY · KINEMATICS ACTIVE
                                    </div>
                                </div>
                            </div>

                            {/* Center Tag */}
                            <div className="mt-3 inline-flex items-center gap-2 border border-green-500/30 bg-green-500/10 px-3 py-1 font-mono text-xs text-green-300">
                                <Icon icon="pixelarticons:code" className="text-sm" />
                                <span>AI CONTROLLER: PD_HOVER_AUTOPILOT</span>
                            </div>
                        </div>

                        {/* Bottom HUD Telemetry Data */}
                        <div className="relative z-10 border-t border-white/10 pt-3 grid grid-cols-3 gap-2 font-mono text-[10px]">
                            <div className="flex flex-col">
                                <span className="text-white/40">ALTITUDE</span>
                                <span className="text-green-300 font-bold">2.50 m (±0.01)</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-white/40">LIFT THRUST</span>
                                <span className="text-white font-bold">476.2 N</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-white/40">MASS</span>
                                <span className="text-white font-bold">48.0 kg</span>
                            </div>
                        </div>

                        {/* Corner Accents */}
                        <div className="absolute top-2 left-2 font-mono text-[9px] text-green-400/40">SYS // 0x24</div>
                        <div className="absolute bottom-2 right-2 font-mono text-[9px] text-white/20">60 FPS // WebGL 2</div>
                    </div>
                </div>
            </section>


            {/* ===================== CORE PILLARS MATRIX ===================== */}
            <section className="flex flex-col gap-6 shrink-0 w-full">
                <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 text-green-400">
                        <Icon icon="pixelarticons:sparkles" className="text-xl" />
                        <span className="font-mono text-xs uppercase tracking-widest text-green-400 font-bold">
                            CORE ARCHITECTURE
                        </span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
                        <h2 className={`m-0 text-2xl sm:text-3xl font-bold text-white ${current.fontClass}`}>
                            {data.pillarsTitle}
                        </h2>
                        <span className={`text-xs text-white/50 ${current.fontClass}`}>
                            {data.pillarsSubtitle}
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {data.pillars.map((pillar, index) => {
                        const pillarIcons = [
                            'pixelarticons:buildings',
                            'pixelarticons:box',
                            'pixelarticons:code',
                            'pixelarticons:users',
                        ]

                        return (
                            <article
                                key={pillar.title}
                                className="group relative flex flex-col justify-between gap-5 border border-white/10 bg-white/5 p-5 transition-all duration-300 hover:border-green-500/40 hover:bg-white/[0.08] hover:-translate-y-1"
                            >
                                <div className="flex flex-col gap-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex h-10 w-10 items-center justify-center border border-green-500/30 bg-green-500/10 text-green-300 transition-transform group-hover:scale-110">
                                            <Icon icon={pillarIcons[index] || 'pixelarticons:zap'} className="text-xl" />
                                        </div>
                                        <span className="font-mono text-[10px] uppercase tracking-wider text-green-400/80 border border-green-500/20 bg-green-500/5 px-2 py-0.5">
                                            {pillar.badge}
                                        </span>
                                    </div>
                                    <h3 className={`m-0 text-base font-bold text-white group-hover:text-green-300 transition-colors ${current.fontClass}`}>
                                        {pillar.title}
                                    </h3>
                                    <p className={`m-0 text-xs sm:text-sm leading-relaxed text-white/60 ${current.fontClass}`}>
                                        {pillar.description}
                                    </p>
                                </div>
                                <div className="flex items-center justify-between border-t border-white/5 pt-3 font-mono text-[10px] text-white/30">
                                    <span>PILLAR // 0{index + 1}</span>
                                    <span className="text-green-400/50 group-hover:text-green-400 transition-colors">READY</span>
                                </div>
                            </article>
                        )
                    })}
                </div>
            </section>


            {/* ===================== INTERACTIVE ENGINE SANDBOX HUB ===================== */}
            <section id="space-sandbox" className="scroll-mt-6 flex flex-col gap-6 shrink-0 w-full border-y border-white/10 py-10">
                {/* Header & Tabs */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2 text-blue-400">
                            <Icon icon="pixelarticons:sliders" className="text-xl" />
                            <span className="font-mono text-xs uppercase tracking-widest text-blue-400 font-bold">
                                INTERACTIVE DEMO
                            </span>
                        </div>
                        <h2 className={`m-0 text-2xl sm:text-3xl font-bold text-white ${current.fontClass}`}>
                            {data.interactiveTitle}
                        </h2>
                        <p className={`m-0 text-xs sm:text-sm text-white/60 ${current.fontClass}`}>
                            {data.interactiveSubtitle}
                        </p>
                    </div>

                    {/* Tab Navigation Buttons */}
                    <div className="flex flex-wrap border border-white/15 bg-black/40 p-1 gap-1">
                        <button
                            type="button"
                            onClick={() => setActiveTab('compiler')}
                            className={`flex items-center gap-2 px-3 py-2 text-xs font-bold transition-all cursor-pointer border-none ${activeTab === 'compiler'
                                ? 'bg-[#3c8527] text-white shadow-sm'
                                : 'bg-transparent text-white/60 hover:text-white hover:bg-white/5'
                                } ${current.fontClass}`}
                        >
                            <Icon icon="pixelarticons:code" className="text-base" />
                            <span>{data.tabs.agentCompiler}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('voxel')}
                            className={`flex items-center gap-2 px-3 py-2 text-xs font-bold transition-all cursor-pointer border-none ${activeTab === 'voxel'
                                ? 'bg-[#3c8527] text-white shadow-sm'
                                : 'bg-transparent text-white/60 hover:text-white hover:bg-white/5'
                                } ${current.fontClass}`}
                        >
                            <Icon icon="pixelarticons:box" className="text-base" />
                            <span>{data.tabs.voxelScale}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('workflow')}
                            className={`flex items-center gap-2 px-3 py-2 text-xs font-bold transition-all cursor-pointer border-none ${activeTab === 'workflow'
                                ? 'bg-[#3c8527] text-white shadow-sm'
                                : 'bg-transparent text-white/60 hover:text-white hover:bg-white/5'
                                } ${current.fontClass}`}
                        >
                            <Icon icon="pixelarticons:zap" className="text-base" />
                            <span>{data.tabs.entityWorkflow}</span>
                        </button>
                    </div>
                </div>

                {/* TAB 1: AI BEHAVIOR COMPILER DEMO */}
                {activeTab === 'compiler' && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-black/30 border border-white/10 p-4 sm:p-6 animate-in fade-in duration-300">
                        {/* Left: Preset Selector & Prompt */}
                        <div className="lg:col-span-5 flex flex-col gap-4">
                            <span className="font-mono text-xs text-green-400 font-bold uppercase tracking-wider flex items-center gap-2">
                                <Icon icon="pixelarticons:human-handsup" className="text-base" />
                                {data.compilerDemo.promptLabel}
                            </span>

                            {/* Preset Buttons */}
                            <div className="flex flex-col gap-2">
                                {data.compilerDemo.presets.map((preset) => {
                                    const isSelected = preset.id === selectedPresetId
                                    return (
                                        <button
                                            key={preset.id}
                                            type="button"
                                            onClick={() => setSelectedPresetId(preset.id)}
                                            className={`text-left p-3 border transition-all cursor-pointer flex flex-col gap-1 ${isSelected
                                                ? 'border-green-500 bg-green-500/10 shadow-[0_0_15px_rgba(74,222,128,0.15)]'
                                                : 'border-white/10 bg-white/5 hover:border-white/30 hover:bg-white/10'
                                                }`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className={`text-sm font-bold ${isSelected ? 'text-green-300' : 'text-white'} ${current.fontClass}`}>
                                                    {preset.name}
                                                </span>
                                                {isSelected && (
                                                    <span className="h-1.5 w-1.5 bg-green-400 animate-pulse" />
                                                )}
                                            </div>
                                            <span className={`text-xs text-white/50 leading-relaxed ${current.fontClass}`}>
                                                {preset.desc}
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>

                            {/* Active Prompt Box */}
                            <div className="border border-white/15 bg-black/60 p-3.5 flex flex-col gap-2 mt-auto">
                                <div className="flex items-center justify-between text-[11px] font-mono text-white/40">
                                    <span>NATURAL LANGUAGE INTENT</span>
                                    <span className="text-green-400">READY TO COMPILE</span>
                                </div>
                                <p className={`m-0 text-sm text-green-200/90 italic font-mono bg-white/5 p-2.5 border-l-2 border-green-500`}>
                                    "{activePreset.prompt}"
                                </p>
                            </div>
                        </div>

                        {/* Right: Code Viewer & Console Log Output */}
                        <div className="lg:col-span-7 flex flex-col gap-4 min-w-0">
                            {/* Controller Script Terminal */}
                            <div className="flex flex-col border border-white/15 bg-[#0d1117] overflow-hidden">
                                <div className="flex items-center justify-between bg-black/60 px-4 py-2.5 border-b border-white/10">
                                    <div className="flex items-center gap-2">
                                        <div className="flex gap-1.5">
                                            <div className="w-2.5 h-2.5 bg-red-500/80" />
                                            <div className="w-2.5 h-2.5 bg-yellow-500/80" />
                                            <div className="w-2.5 h-2.5 bg-green-500/80" />
                                        </div>
                                        <span className="font-mono text-xs text-white/60 ml-2">
                                            controller.generated.ts
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleCopy(activePreset.code)}
                                        className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white bg-white/10 hover:bg-white/20 px-2 py-1 transition-colors cursor-pointer border-none font-mono"
                                    >
                                        <Icon icon={copiedCode ? "pixelarticons:check" : "pixelarticons:copy"} />
                                        <span>{copiedCode ? "Copied" : "Copy"}</span>
                                    </button>
                                </div>

                                <pre className="p-4 m-0 font-mono text-xs leading-relaxed text-green-300/90 overflow-x-auto custom-scrollbar max-h-64 select-text">
                                    <code>{activePreset.code}</code>
                                </pre>
                            </div>

                            {/* Simulated Live Console Log */}
                            <div className="flex flex-col border border-white/10 bg-black/70 p-3 font-mono text-xs">
                                <div className="flex items-center justify-between text-white/40 pb-2 border-b border-white/10 text-[10px]">
                                    <span className="flex items-center gap-1.5 text-green-400">
                                        <span className="w-1.5 h-1.5 bg-green-400 animate-ping" />
                                        ENGINE TELEMETRY / AGENT RUNTIME
                                    </span>
                                    <span>60 HZ SIMULATION</span>
                                </div>
                                <div className="pt-2 text-white/70 space-y-1 text-[11px] leading-relaxed select-text">
                                    {activePreset.log.split('\n').map((line, idx) => (
                                        <div key={idx} className={line.includes('Error') ? 'text-red-400' : line.includes('Agent Log') ? 'text-green-300' : 'text-white/60'}>
                                            {line}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB 2: DUAL-SCALE VOXEL INSPECTOR */}
                {activeTab === 'voxel' && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-black/30 border border-white/10 p-4 sm:p-6 animate-in fade-in duration-300">
                        {/* Left: Mode Switcher & Explanation */}
                        <div className="lg:col-span-5 flex flex-col gap-4">
                            <span className="font-mono text-xs text-blue-400 font-bold uppercase tracking-wider flex items-center gap-2">
                                <Icon icon="pixelarticons:box" className="text-base" />
                                {data.voxelDemo.title}
                            </span>
                            <p className={`text-sm text-white/70 leading-relaxed m-0 ${current.fontClass}`}>
                                {data.voxelDemo.desc}
                            </p>

                            {/* Mode Toggle Buttons */}
                            <div className="grid grid-cols-2 gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setVoxelMode('standard')}
                                    className={`p-3.5 border text-left cursor-pointer transition-all flex flex-col gap-1 ${voxelMode === 'standard'
                                        ? 'border-green-500 bg-green-500/10'
                                        : 'border-white/10 bg-white/5 hover:border-white/30'
                                        }`}
                                >
                                    <span className={`text-sm font-bold ${voxelMode === 'standard' ? 'text-green-300' : 'text-white'} ${current.fontClass}`}>
                                        {data.voxelDemo.standardLabel}
                                    </span>
                                    <span className="text-[11px] text-white/50">Shovel Tool (Key 1)</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setVoxelMode('micro')}
                                    className={`p-3.5 border text-left cursor-pointer transition-all flex flex-col gap-1 ${voxelMode === 'micro'
                                        ? 'border-green-500 bg-green-500/10'
                                        : 'border-white/10 bg-white/5 hover:border-white/30'
                                        }`}
                                >
                                    <span className={`text-sm font-bold ${voxelMode === 'micro' ? 'text-green-300' : 'text-white'} ${current.fontClass}`}>
                                        {data.voxelDemo.microLabel}
                                    </span>
                                    <span className="text-[11px] text-white/50">Spoon Tool (Key 2)</span>
                                </button>
                            </div>

                            {/* Description Box */}
                            <div className="border border-white/15 bg-black/50 p-4 flex flex-col gap-2">
                                <span className={`text-sm font-bold text-green-300 ${current.fontClass}`}>
                                    {voxelMode === 'standard' ? data.voxelDemo.standardLabel : data.voxelDemo.microLabel}
                                </span>
                                <p className={`m-0 text-xs sm:text-sm text-white/60 leading-relaxed ${current.fontClass}`}>
                                    {voxelMode === 'standard' ? data.voxelDemo.standardDesc : data.voxelDemo.microDesc}
                                </p>
                            </div>

                            {/* Palette Highlight */}
                            <div className="border border-white/10 bg-white/5 p-3 flex items-center gap-3">
                                <Icon icon="pixelarticons:paint-bucket" className="text-2xl text-yellow-400 shrink-0" />
                                <div className="flex flex-col">
                                    <span className={`text-xs font-bold text-white ${current.fontClass}`}>
                                        {data.voxelDemo.paletteTitle}
                                    </span>
                                    <span className={`text-[11px] text-white/50 ${current.fontClass}`}>
                                        {data.voxelDemo.paletteDesc}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Right: Visual Voxel Grid Breakdown */}
                        <div className="lg:col-span-7 flex flex-col items-center justify-center border border-white/10 bg-black/60 p-6 min-h-[320px] relative overflow-hidden">
                            <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#3c8527_1px,transparent_1px)] bg-[size:16px_16px]" />

                            {voxelMode === 'standard' ? (
                                <div className="relative z-10 flex flex-col items-center gap-4">
                                    <div className="w-28 h-28 border-2 border-green-400 bg-green-500/20 flex items-center justify-center shadow-[0_0_35px_rgba(74,222,128,0.25)]">
                                        <span className="font-mono text-xs font-bold text-green-300 text-center">
                                            1.0m³<br />STANDARD BLOCK
                                        </span>
                                    </div>
                                    <div className="font-mono text-xs text-white/60">
                                        1 Block = 1 Instance · Volume: 1.0 m³
                                    </div>
                                </div>
                            ) : (
                                <div className="relative z-10 flex flex-col items-center gap-4">
                                    <div className="grid grid-cols-5 gap-1 p-2 border-2 border-green-400 bg-green-500/10 shadow-[0_0_40px_rgba(74,222,128,0.3)]">
                                        {Array.from({ length: 25 }).map((_, i) => (
                                            <div
                                                key={i}
                                                className={`w-5 h-5 border border-green-300/30 transition-all ${i % 3 === 0 ? 'bg-[#3c8527]' : i % 2 === 0 ? 'bg-[#4ea632]' : 'bg-[#255418]'
                                                    }`}
                                            />
                                        ))}
                                    </div>
                                    <div className="font-mono text-xs text-green-300 font-bold text-center">
                                        5 × 5 × 5 = 125 Micro Voxels · 0.2m Resolution
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* TAB 3: ENTITYIZATION PIPELINE */}
                {activeTab === 'workflow' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-black/30 border border-white/10 p-4 sm:p-6 animate-in fade-in duration-300">
                        <div className="border border-white/10 bg-white/5 p-5 flex flex-col gap-3">
                            <div className="flex items-center justify-between border-b border-white/10 pb-2">
                                <span className="font-mono text-xs text-green-400 font-bold">STEP 01</span>
                                <Icon icon="pixelarticons:frame-check" className="text-xl text-green-400" />
                            </div>
                            <h4 className={`text-base font-bold text-white m-0 ${current.fontClass}`}>
                                {data.entityDemo.step1Title}
                            </h4>
                            <p className={`text-xs sm:text-sm leading-relaxed text-white/60 m-0 ${current.fontClass}`}>
                                {data.entityDemo.step1Desc}
                            </p>
                        </div>

                        <div className="border border-green-500/30 bg-green-500/10 p-5 flex flex-col gap-3">
                            <div className="flex items-center justify-between border-b border-green-500/20 pb-2">
                                <span className="font-mono text-xs text-green-300 font-bold">STEP 02 // KEY 'G'</span>
                                <Icon icon="pixelarticons:box" className="text-xl text-green-300" />
                            </div>
                            <h4 className={`text-base font-bold text-white m-0 ${current.fontClass}`}>
                                {data.entityDemo.step2Title}
                            </h4>
                            <p className={`text-xs sm:text-sm leading-relaxed text-white/70 m-0 ${current.fontClass}`}>
                                {data.entityDemo.step2Desc}
                            </p>
                        </div>

                        <div className="border border-white/10 bg-white/5 p-5 flex flex-col gap-3">
                            <div className="flex items-center justify-between border-b border-white/10 pb-2">
                                <span className="font-mono text-xs text-blue-400 font-bold">STEP 03 // KEY 'C'</span>
                                <Icon icon="pixelarticons:code" className="text-xl text-blue-400" />
                            </div>
                            <h4 className={`text-base font-bold text-white m-0 ${current.fontClass}`}>
                                {data.entityDemo.step3Title}
                            </h4>
                            <p className={`text-xs sm:text-sm leading-relaxed text-white/60 m-0 ${current.fontClass}`}>
                                {data.entityDemo.step3Desc}
                            </p>
                        </div>
                    </div>
                )}
            </section>


            {/* ===================== KEYBOARD & CONTROLS MATRIX ===================== */}
            <section className="flex flex-col gap-6 shrink-0 w-full">
                <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 text-green-400">
                        <Icon icon="pixelarticons:device-laptop" className="text-xl" />
                        <span className="font-mono text-xs uppercase tracking-widest text-green-400 font-bold">
                            CONTROLS & SHORTCUTS
                        </span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
                        <h2 className={`m-0 text-2xl sm:text-3xl font-bold text-white ${current.fontClass}`}>
                            {data.keybindingsTitle}
                        </h2>
                        <span className={`text-xs text-white/50 ${current.fontClass}`}>
                            {data.keybindingsSubtitle}
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {data.keybindings.map((kb) => (
                        <div
                            key={kb.key}
                            className="border border-white/10 bg-white/5 p-4 flex flex-col justify-between gap-3 hover:border-green-500/30 hover:bg-white/[0.08] transition-all"
                        >
                            <div className="flex items-center justify-between">
                                <span className="font-mono text-xs font-bold text-green-300 border border-green-500/30 bg-green-500/10 px-2 py-0.5 shadow-sm">
                                    {kb.key}
                                </span>
                                <span className={`text-xs font-bold text-white ${current.fontClass}`}>
                                    {kb.action}
                                </span>
                            </div>
                            <span className={`text-xs text-white/50 leading-relaxed ${current.fontClass}`}>
                                {kb.desc}
                            </span>
                        </div>
                    ))}
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


            {/* ===================== QUICKSTART WORKFLOW ===================== */}
            <section className="flex flex-col gap-6 shrink-0 w-full border-t border-white/10 pt-10">
                <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 text-green-400">
                        <Icon icon="pixelarticons:zap" className="text-xl" />
                        <span className="font-mono text-xs uppercase tracking-widest text-green-400 font-bold">
                            QUICKSTART
                        </span>
                    </div>
                    <h2 className={`m-0 text-2xl sm:text-3xl font-bold text-white ${current.fontClass}`}>
                        {data.workflowTitle}
                    </h2>
                    <p className={`m-0 text-xs sm:text-sm text-white/60 ${current.fontClass}`}>
                        {data.workflowSubtitle}
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {data.workflowSteps.map((step) => (
                        <div
                            key={step.number}
                            className="relative border border-white/10 bg-black/30 p-5 flex flex-col gap-3 hover:border-green-500/30 transition-all"
                        >
                            <div className="flex items-center justify-between">
                                <span className="font-mono text-sm font-bold text-green-400 border border-green-500/30 bg-green-500/10 px-2 py-0.5">
                                    STEP {step.number}
                                </span>
                                <span className="font-mono text-[10px] text-white/30">LIFECYCLE</span>
                            </div>
                            <h3 className={`text-base font-bold text-white m-0 ${current.fontClass}`}>
                                {step.title}
                            </h3>
                            <p className={`text-xs sm:text-sm text-white/60 leading-relaxed m-0 ${current.fontClass}`}>
                                {step.desc}
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
