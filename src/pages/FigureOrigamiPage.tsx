import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { PageContainer } from '../components/PageContainer'
import { Footer } from '../components/Footer'
import { SEO } from '../components/SEO'
import type { LangData } from '../constants/lang'
import { request } from '../utils/httpClient'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { FigureDownloadDialog } from './figure/print/FigureDownloadDialog'
import { downloadUrl } from './figure/print/download'
import { figureSourcePath, figureSourceUrl, readFigureSource } from './figure/print/figureSource'
import { useFigureSourceById } from './figure/print/useFigureSourceById'
import {
    DEFAULT_ORIGAMI_LAYER,
    ORIGAMI_LAYERS,
    ORIGAMI_MODELS,
    type OrigamiLayerMode,
    type OrigamiModel,
} from './figure/origami/origamiModels'
import {
    disposeOrigami,
    generateFullOrigamiAssets,
    generateOrigami,
    type OrigamiOutput,
} from './figure/origami/origamiEngine'
import { OrigamiPreview } from './figure/origami/OrigamiPreview'

interface OrigamiSourceState {
    textureUrl?: string
    name?: string
    source?: unknown
}

type DownloadTarget = 'sheet' | 'svg'
type Failure = 'loadFailed' | 'invalidSkin' | 'buildFailed' | 'exportFailed'

const buttonClass = 'inline-flex items-center justify-center gap-2 border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer transition-colors'

function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = () => reject(new Error('Image decode failed'))
        image.src = url
    })
}

export function FigureOrigamiPage({ current }: { current: LangData }) {
    const t = current.figureOrigami
    const printT = current.figurePrint
    const { user: currentUser } = useCurrentUser()
    const isPro = currentUser?.is_pro === true
    const [hasDownloaded, setHasDownloaded] = useState(false)
    const [proPromptDismissed, setProPromptDismissed] = useState(() => {
        try {
            return typeof sessionStorage !== 'undefined' && sessionStorage.getItem('dismissed_figure_pro_prompt') === '1'
        } catch {
            return false
        }
    })
    const dismissProPrompt = useCallback(() => {
        setProPromptDismissed(true)
        try {
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem('dismissed_figure_pro_prompt', '1')
            }
        } catch {
            // ignore
        }
    }, [])

    const [model, setModel] = useState<OrigamiModel>(ORIGAMI_MODELS[0])
    const [layerMode, setLayerMode] = useState<OrigamiLayerMode>(DEFAULT_ORIGAMI_LAYER)
    const [includeOverlay, setIncludeOverlay] = useState(true)
    const [showGuideLines, setShowGuideLines] = useState(true)
    const [pageChoice, setPageChoice] = useState<{ output: OrigamiOutput; index: number } | null>(null)
    const location = useLocation()
    const linkedSource = useFigureSourceById(location.search || '')
    const state = location.state as OrigamiSourceState | null
    const textureUrl = linkedSource.active
        ? linkedSource.data?.textureUrl || ''
        : typeof state?.textureUrl === 'string'
            ? state.textureUrl
            : ''
    const source = useMemo(
        () => (linkedSource.active ? linkedSource.data?.source || null : readFigureSource(state?.source)),
        [linkedSource.active, linkedSource.data, state?.source],
    )
    const name = source?.name || (!linkedSource.active && typeof state?.name === 'string' ? state.name : '')

    const stickerInfo = useMemo(() => ({
        modelName: `${model.name} · ${layerMode.toUpperCase()}`,
        name: name || printT.unnamedSkin,
        publisher: source?.publisher || printT.unknownPublisher,
        publisherId: source?.publisherId || '',
        sourceId: source?.id || '',
        sourceUrl: source ? figureSourceUrl(source.id) : '',
        sourceIsPublic: source?.isPublic,
        labels: printT.stickerInfo,
    }), [model.name, layerMode, name, source, printT.unnamedSkin, printT.unknownPublisher, printT.stickerInfo])

    const [output, setOutput] = useState<OrigamiOutput | null>(null)
    const [progress, setProgress] = useState(0)
    const [busy, setBusy] = useState(!!textureUrl)
    const [busyLabel, setBusyLabel] = useState<string | null>(null)
    const [failure, setFailure] = useState<Failure | null>(null)
    const [retry, setRetry] = useState(0)
    const [previewFailed, setPreviewFailed] = useState(false)
    const [pendingDownload, setPendingDownload] = useState<{ output: OrigamiOutput; target: DownloadTarget; pageIndex: number } | null>(null)
    const downloadAbortRef = useRef<AbortController | null>(null)

    const sheets = output?.sheets ?? []
    const activePageIndex = output && pageChoice?.output === output
        ? Math.min(pageChoice.index, Math.max(0, sheets.length - 1))
        : 0
    const activeSheet = sheets[activePageIndex]
    const canDownload = !!output && !busy
    const closeDownload = useCallback(() => setPendingDownload(null), [])
    const onPreviewError = useCallback(() => setPreviewFailed(true), [])

    useEffect(() => {
        const controller = new AbortController()
        let result: OrigamiOutput | null = null
        let imageUrl: string | undefined

        async function generate() {
            setOutput(null)
            setFailure(null)
            setPreviewFailed(false)
            setProgress(0)
            setBusy(!!textureUrl)
            setBusyLabel(null)
            setPendingDownload(null)
            if (!textureUrl) return
            let stage: Failure = 'loadFailed'
            try {
                const response = await request(textureUrl, { signal: controller.signal, skipGlobalError: true })
                if (!response.ok) throw new Error(`Skin request failed: ${response.status}`)
                imageUrl = URL.createObjectURL(await response.blob())
                const img = await loadImage(imageUrl)
                controller.signal.throwIfAborted()
                stage = 'invalidSkin'
                if (img.width !== 64 || ![32, 64].includes(img.height)) throw new Error('Invalid skin dimensions')
                stage = 'buildFailed'
                result = await generateOrigami(img, controller.signal, setProgress, stickerInfo, {
                    modelId: model.id,
                    layerMode,
                    includeOverlay,
                    showGuideLines,
                    sheetLabels: t.sheetLabels,
                })
                if (controller.signal.aborted) {
                    disposeOrigami(result)
                    result = null
                    return
                }
                setOutput(result)
            } catch (error) {
                if (!controller.signal.aborted) {
                    console.error('Origami generation failed', error)
                    setFailure(stage)
                }
            } finally {
                if (imageUrl) URL.revokeObjectURL(imageUrl)
                if (!controller.signal.aborted) setBusy(false)
            }
        }

        void Promise.resolve().then(() => {
            if (!controller.signal.aborted) return generate()
        })
        return () => {
            controller.abort()
            downloadAbortRef.current?.abort()
            if (result) disposeOrigami(result)
        }
    }, [textureUrl, retry, stickerInfo, model.id, layerMode, includeOverlay, showGuideLines, t.sheetLabels])

    function requestDownload(target: DownloadTarget) {
        if (output && !busy) setPendingDownload({ output, target, pageIndex: activePageIndex })
    }

    const completeDownload = useCallback(async () => {
        if (!pendingDownload || pendingDownload.output !== output || busy) return
        const { target, pageIndex } = pendingDownload
        const activeOutput = output
        const targetSheet = activeOutput.sheets[pageIndex] ?? activeOutput.sheets[0]
        setPendingDownload(null)
        if (!targetSheet) return
        const suffix = targetSheet.filenameSuffix || 'origami'
        try {
            if (target === 'svg') {
                if (!targetSheet.svgUrl) return
                downloadUrl(targetSheet.svgUrl, `${model.name}_${suffix}_cut_fold_A4.svg`)
            } else {
                let sheetUrl = targetSheet.fullSheetUrl
                if ((!sheetUrl || targetSheet.isPreviewSheet) && typeof generateFullOrigamiAssets === 'function') {
                    downloadAbortRef.current?.abort()
                    const controller = new AbortController()
                    downloadAbortRef.current = controller
                    setBusy(true)
                    setBusyLabel(t.generatingFull)
                    setProgress(0)
                    try {
                        const full = await generateFullOrigamiAssets(activeOutput, controller.signal, setProgress, pageIndex)
                        if (controller.signal.aborted) return
                        sheetUrl = full.sheetUrl
                        const nextSheets = activeOutput.sheets.map((item, idx) =>
                            idx === pageIndex ? { ...item, sheetUrl: full.sheetUrl, fullSheetUrl: full.sheetUrl, isPreviewSheet: false } : item,
                        )
                        const updated: OrigamiOutput = {
                            ...activeOutput,
                            sheets: nextSheets,
                            ...(pageIndex === 0 ? { sheetUrl: full.sheetUrl, fullSheetUrl: full.sheetUrl, isPreviewSheet: false } : {}),
                        }
                        setOutput(updated)
                        setPageChoice({ output: updated, index: pageIndex })
                    } finally {
                        if (!controller.signal.aborted) {
                            setBusy(false)
                            setBusyLabel(null)
                        }
                    }
                } else if (!sheetUrl) {
                    sheetUrl = targetSheet.sheetUrl
                }
                if (!sheetUrl) return
                downloadUrl(sheetUrl, `${model.name}_${suffix}_A4.png`)
            }
            setHasDownloaded(true)
        } catch (error: unknown) {
            if (error instanceof Error && error.name === 'AbortError') return
            console.error(error)
            setFailure('exportFailed')
        }
    }, [pendingDownload, output, busy, model.name, t.generatingFull])

    if (linkedSource.active && !linkedSource.data) {
        return (
            <PageContainer className={current.fontClass}>
                <SEO title={t.title} description={t.description} />
                <p role={linkedSource.error ? 'alert' : 'status'} className="text-sm text-white/65">
                    {linkedSource.error === 'unavailable'
                        ? printT.sharedSourceUnavailable
                        : linkedSource.error
                            ? printT.loadFailed
                            : printT.sharedSourceLoading}
                </p>
                <div className="flex flex-wrap gap-3">
                    {linkedSource.error === 'loadFailed' && (
                        <button type="button" className={buttonClass} onClick={linkedSource.retry}>
                            {printT.retry}
                        </button>
                    )}
                    <Link to="/skin/" className={buttonClass}>{printT.discoverSkins}</Link>
                </div>
                <div className="mt-auto shrink-0"><Footer current={current} /></div>
            </PageContainer>
        )
    }

    if (!textureUrl) {
        return (
            <div className={`absolute inset-0 z-10 flex flex-col overflow-x-hidden overflow-y-auto custom-scrollbar ${current.fontClass}`}>
                <SEO title={t.title} description={t.description} />
                <div className="fixed inset-0 pointer-events-none select-none overflow-hidden" aria-hidden="true">
                    <img
                        src="/images/figure_physical_showcase.jpg?v=2"
                        alt={t.heroAlt}
                        className="w-full h-full object-cover object-center filter brightness-[0.98] contrast-[1.02]"
                        loading="eager"
                        fetchPriority="high"
                        decoding="async"
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/65 via-transparent to-black/55" />
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_65%,rgba(0,0,0,0.25)_100%)]" />
                </div>

                <div className="relative z-10 min-h-full shrink-0 flex flex-col justify-end pt-24 sm:pt-32">
                    <div className="pb-6 sm:pb-8 lg:pb-10 px-4 w-full">
                        <div className="flex flex-col items-center text-center gap-3.5 max-w-2xl mx-auto w-full p-4 sm:p-5 bg-black/30 backdrop-blur-md border border-white/20 shadow-2xl">
                            <div className="flex items-center gap-2">
                                <span className={`px-2.5 py-0.5 text-[10px] sm:text-xs ${current.fontClass || 'font-pixel-hans'} uppercase tracking-wider border border-amber-500/40 bg-amber-500/20 text-amber-300 backdrop-blur-md`}>
                                    {t.badge}
                                </span>
                            </div>
                            <p className="text-xs sm:text-sm text-white/85 m-0 leading-relaxed max-w-md">
                                {t.empty}
                            </p>
                            <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 w-full sm:w-auto">
                                <Link
                                    to="/skin/collection"
                                    className="w-full sm:w-auto px-5 py-2.5 bg-[#3c8527] hover:bg-[#4ea632] text-white text-xs font-bold inline-flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-950/60 border border-black active:translate-y-px no-underline"
                                >
                                    <Icon icon="pixelarticons:folder" className="text-base" />
                                    <span>{printT.chooseCollection}</span>
                                </Link>
                                <Link
                                    to="/skin/"
                                    className="w-full sm:w-auto px-5 py-2.5 bg-white/10 hover:bg-white/15 text-white text-xs font-bold inline-flex items-center justify-center gap-2 transition-all backdrop-blur-md border border-white/20 hover:border-white/35 active:translate-y-px no-underline"
                                >
                                    <Icon icon="pixelarticons:search" className="text-base" />
                                    <span>{printT.discoverSkins}</span>
                                </Link>
                                <Link
                                    to="/figure/showcase"
                                    className="w-full sm:w-auto px-5 py-2.5 bg-white/10 hover:bg-white/15 text-white text-xs font-bold inline-flex items-center justify-center gap-2 transition-all backdrop-blur-md border border-white/20 hover:border-white/35 active:translate-y-px no-underline"
                                >
                                    <Icon icon="pixelarticons:image" className="text-base" />
                                    <span>{current.nav.showcase}</span>
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="relative z-10 w-full shrink-0 bg-black/75 backdrop-blur-md border-t border-white/15">
                    <div className="max-w-7xl mx-auto px-4 sm:px-8 [&>footer]:border-t-0">
                        <Footer current={current} />
                    </div>
                </div>
            </div>
        )
    }

    const partLabels = {
        head: printT.parts.head,
        torso: printT.parts.torso,
        rightArm: printT.parts.rightArm,
        leftArm: printT.parts.leftArm,
        rightLeg: printT.parts.rightLeg,
        leftLeg: printT.parts.leftLeg,
    }

    const pageBadge = sheets.length > 1 && activeSheet ? ` (${activeSheet.pageNumber}/${sheets.length})` : ''

    return (
        <PageContainer gap="gap-4" className={current.fontClass}>
            <SEO title={t.title} description={t.description} />
            <header className="flex flex-wrap items-center justify-between gap-3 shrink-0 border-b border-white/10 pb-4">
                <div className="min-w-0 max-w-full">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                        <div className="flex items-center gap-3">
                            <Icon icon="pixelarticons:scissors" className="text-[#71bc56] text-2xl" />
                            <h2 className="text-xl sm:text-2xl m-0">{t.title}</h2>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 max-w-full">
                            <label className="flex items-center gap-2 text-xs text-white/60 max-w-full">
                                <span className="shrink-0">{printT.modelType}</span>
                                <span className="relative inline-flex min-w-0 max-w-full">
                                    <select
                                        aria-label={printT.modelType}
                                        value={model.id}
                                        onChange={event => {
                                            const selected = ORIGAMI_MODELS.find(item => item.id === event.target.value)
                                            if (selected) {
                                                setPendingDownload(null)
                                                setModel(selected)
                                            }
                                        }}
                                        className="h-9 max-w-full appearance-none rounded-none border border-white/15 bg-white/5 pl-3 pr-8 py-0 text-xs text-white/80 cursor-pointer hover:bg-white/10 hover:text-white transition-colors focus:outline-none focus:border-[#84c96b]"
                                    >
                                        {ORIGAMI_MODELS.map(item => (
                                            <option key={item.id} value={item.id} className="bg-[#182018]">
                                                {item.name}
                                            </option>
                                        ))}
                                    </select>
                                    <Icon icon="pixelarticons:chevron-down" className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs" />
                                </span>
                            </label>
                            <label className="flex items-center gap-2 text-xs text-white/60 max-w-full">
                                <span className="shrink-0">{t.layerType}</span>
                                <span className="relative inline-flex min-w-0 max-w-full">
                                    <select
                                        aria-label={t.layerType}
                                        value={layerMode}
                                        onChange={event => {
                                            const selected = event.target.value as OrigamiLayerMode
                                            if (ORIGAMI_LAYERS.includes(selected)) {
                                                setPendingDownload(null)
                                                setLayerMode(selected)
                                            }
                                        }}
                                        className="h-9 max-w-full appearance-none rounded-none border border-white/15 bg-white/5 pl-3 pr-8 py-0 text-xs text-white/80 cursor-pointer hover:bg-white/10 hover:text-white transition-colors focus:outline-none focus:border-[#84c96b]"
                                    >
                                        {ORIGAMI_LAYERS.map(mode => (
                                            <option key={mode} value={mode} className="bg-[#182018]">
                                                {t.layers[mode]}
                                            </option>
                                        ))}
                                    </select>
                                    <Icon icon="pixelarticons:chevron-down" className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs" />
                                </span>
                            </label>
                            <Link to="/figure/showcase" className={`${buttonClass} h-9 shrink-0 !py-0 no-underline`}>
                                <Icon icon="pixelarticons:image" />
                                {current.nav.showcase}
                            </Link>
                            <Link to="/skin/collection" className={`${buttonClass} h-9 shrink-0 !py-0 no-underline`}>
                                <Icon icon="pixelarticons:folder" />
                                {printT.chooseCollection}
                            </Link>
                        </div>
                    </div>
                </div>
            </header>

            {hasDownloaded && !isPro && !proPromptDismissed && (
                <div className="shrink-0 border border-[#a6df7a]/25 bg-gradient-to-r from-[#a6df7a]/12 via-[#a6df7a]/5 to-transparent p-3 sm:px-4 sm:py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs backdrop-blur-sm relative">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <Icon icon="pixelarticons:zap" className="text-base text-[#a6df7a] shrink-0 animate-pulse" />
                        <span className="text-white/85 leading-relaxed">{t.proSupportPrompt}</span>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-auto">
                        <Link
                            to="/pro"
                            className="inline-flex items-center gap-1 border border-[#a6df7a]/40 bg-[#a6df7a]/15 hover:bg-[#a6df7a]/25 px-3 py-1.5 text-xs font-medium text-[#a6df7a] hover:text-[#c4f09e] transition-all no-underline shadow-[0_0_10px_rgba(166,223,122,0.1)] active:translate-y-px"
                        >
                            <span>{printT.proSupportAction}</span>
                            <Icon icon="pixelarticons:chevron-right" className="text-xs" />
                        </Link>
                        <button
                            type="button"
                            onClick={dismissProPrompt}
                            className="text-white/40 hover:text-white p-1 cursor-pointer transition-colors bg-transparent border-none inline-flex items-center justify-center"
                            aria-label={printT.dismissProPrompt}
                            title={printT.dismissProPrompt}
                        >
                            <Icon icon="pixelarticons:close" className="text-xs" />
                        </button>
                    </div>
                </div>
            )}

            {failure && (
                <div role="alert" className="flex flex-wrap items-center gap-3 border border-red-400/25 bg-red-400/10 p-3 text-xs text-red-200 shrink-0">
                    <span className="flex-1">{failure === 'buildFailed' ? t.buildFailed : failure === 'exportFailed' ? t.exportFailed : printT[failure]}</span>
                    {textureUrl && !busy && (
                        <button type="button" className={buttonClass} onClick={() => setRetry(value => value + 1)}>
                            {printT.retry}
                        </button>
                    )}
                </div>
            )}

            {busy && (
                <div role="status" className="shrink-0">
                    <div className="flex justify-between text-xs text-white/60 mb-2">
                        <span>{busyLabel || t.generating}</span>
                        <span>{progress}%</span>
                    </div>
                    <div role="progressbar" aria-label={busyLabel || t.generating} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} className="h-1 bg-white/10">
                        <div className="h-full bg-[#4ea632] transition-[width]" style={{ width: `${progress}%` }} />
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0 lg:min-h-[430px] max-lg:flex-none">
                <section className="flex flex-col min-h-0 border border-white/10 bg-[#101510]/75">
                    <div className="flex items-center justify-between gap-3 p-3 border-b border-white/10 text-sm">
                        <h3 className="m-0 shrink-0 text-sm">{t.model}</h3>
                        <div className="flex min-w-0 items-center justify-end gap-1.5 text-[11px] text-white/55">
                            <span className="shrink-0">{printT.source}:</span>
                            {source ? (
                                <Link to={figureSourcePath(source.id)} title={source.name || printT.unnamedSkin} className="truncate text-[#84c96b] underline underline-offset-2">
                                    {source.name || printT.unnamedSkin}
                                </Link>
                            ) : (
                                <Link to="/skin/collection" className="truncate underline underline-offset-2" title={printT.sourceUnavailable}>
                                    {printT.sourceUnavailable}
                                </Link>
                            )}
                        </div>
                    </div>
                    <div className="relative flex-1 min-h-[320px] lg:min-h-[240px] bg-[radial-gradient(ellipse_at_center,#263323_0%,#111711_75%)]">
                        {output ? (
                            <>
                                <OrigamiPreview
                                    layout={output.layout}
                                    faceCanvases={output.faceCanvases}
                                    overlayFaceCanvases={output.overlayFaceCanvases}
                                    dualPlan={output.dualPlan}
                                    includeOverlay={includeOverlay}
                                    onToggleOverlay={next => {
                                        setPendingDownload(null)
                                        setIncludeOverlay(next)
                                    }}
                                    partLabels={partLabels}
                                    explodedLabel={t.assembly.toggle}
                                    overlayLabel={t.overlayMode}
                                    overlayHint={t.overlayModeHint}
                                    xrayLabel={t.xrayMode}
                                    xrayHint={t.xrayModeHint}
                                    onError={onPreviewError}
                                />
                                {previewFailed && <p className="absolute inset-x-4 bottom-3 text-xs bg-black/70 p-3">{t.previewFailed}</p>}
                            </>
                        ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center text-white/35">
                                <Icon icon="pixelarticons:scissors" className={`text-5xl ${busy ? 'animate-pulse' : ''}`} />
                                <p className="text-sm m-0">{busy ? t.generating : t.empty}</p>
                            </div>
                        )}
                        <Link
                            to="/skin/edit"
                            state={{ textureUrl, name, passedLogId: source?.id, isPublic: source?.isPublic }}
                            className={`${buttonClass} absolute left-3 top-3 z-10 !py-1.5 !bg-black/50 no-underline`}
                        >
                            <Icon icon="pixelarticons:edit" />
                            {current.nav.edit}
                        </Link>
                    </div>
                    {output && (
                        <div className="p-3 border-t border-white/10">
                            {output.dualPlan ? (
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-white/70">
                                    <div className="border border-white/10 bg-white/[0.03] px-2.5 py-1.5 flex items-center justify-between gap-2">
                                        <span className="text-white/45">{t.specs.height}</span>
                                        <span className="text-white/90">{output.layout.heightCm} cm</span>
                                    </div>
                                    <div className="border border-white/10 bg-white/[0.03] px-2.5 py-1.5 flex items-center justify-between gap-2">
                                        <span className="text-white/45">{t.specs.islands}</span>
                                        <span className="text-white/90">
                                            {t.specs.islandsValue
                                                .replace('{islands}', String(output.dualPlan.islands.length))
                                                .replace('{pages}', String(output.sheets.length))}
                                        </span>
                                    </div>
                                    <div className="border border-white/10 bg-white/[0.03] px-2.5 py-1.5 flex items-center justify-between gap-2">
                                        <span className="text-white/45">{t.specs.supports}</span>
                                        <span className="text-white/90">
                                            {t.specs.supportsValue.replace('{count}', String(output.dualPlan.supportCount))}
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-white/70">
                                    <div className="border border-white/10 bg-white/[0.03] px-2.5 py-1.5 flex items-center justify-between gap-2">
                                        <span className="text-white/45">{t.specs.height}</span>
                                        <span className="text-white/90">{output.layout.heightCm} cm</span>
                                    </div>
                                    <div className="border border-white/10 bg-white/[0.03] px-2.5 py-1.5 flex items-center justify-between gap-2">
                                        <span className="text-white/45">{t.specs.parts}</span>
                                        <span className="text-white/90">
                                            {t.specs.partsValue.replace('{pages}', String(output.sheets.length))}
                                        </span>
                                    </div>
                                    <div className="border border-white/10 bg-white/[0.03] px-2.5 py-1.5 flex items-center justify-between gap-2">
                                        <span className="text-white/45">{t.specs.paper}</span>
                                        <span className="text-white/90">{t.specs.paperValue}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </section>

                <section className="flex flex-col min-h-0 border border-white/10 bg-[#151515]/80">
                    <div className="flex flex-wrap items-center justify-between gap-2 p-3 border-b border-white/10">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <h3 className="m-0 text-sm shrink-0">{t.sheet}</h3>
                            {sheets.length <= 1 && <span className="text-[11px] text-white/45 shrink-0">A4 · 210×297 mm</span>}
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                            {sheets.length > 1 && (
                                <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label={t.sheet}>
                                    {sheets.map((sheet, idx) => {
                                        const label = sheet.kind === 'overlay'
                                            ? t.pages.overlay.replace('{page}', String(sheet.pageNumber))
                                            : sheet.baseRole === 'headTorso'
                                                ? t.pages.headTorso
                                                : sheet.baseRole === 'limbs'
                                                    ? t.pages.limbs
                                                    : t.pages.base
                                        const active = idx === activePageIndex
                                        return (
                                            <button
                                                key={sheet.pageNumber}
                                                type="button"
                                                role="tab"
                                                aria-selected={active}
                                                onClick={() => output && setPageChoice({ output, index: idx })}
                                                className={`border px-2.5 py-1 text-[11px] cursor-pointer transition-colors ${active ? 'border-[#84c96b]/60 bg-[#3c8527] text-white' : 'border-white/15 bg-white/5 text-white/65 hover:text-white'}`}
                                            >
                                                {label}
                                            </button>
                                        )
                                    })}
                                </div>
                            )}
                            <button
                                type="button"
                                role="switch"
                                aria-checked={showGuideLines}
                                title={t.guideLinesHint}
                                onClick={() => {
                                    setPendingDownload(null)
                                    setShowGuideLines(value => !value)
                                }}
                                className="flex items-center gap-2 border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-white/70 hover:text-white cursor-pointer transition-colors"
                            >
                                {t.guideLines}
                                <span aria-hidden="true" className="relative inline-block h-3.5 w-6 shrink-0 rounded-full bg-white/15">
                                    <span className={`absolute top-0.5 left-0.5 h-2.5 w-2.5 rounded-full transition-transform ${showGuideLines ? 'translate-x-2.5 bg-[#84c96b]' : 'translate-x-0 bg-white/50'}`} />
                                </span>
                            </button>
                        </div>
                    </div>
                    <div
                        onContextMenu={event => event.preventDefault()}
                        className="relative flex-1 min-h-[400px] lg:min-h-0 overflow-auto p-4 flex items-center justify-center bg-[#222] select-none [-webkit-touch-callout:none]"
                    >
                        {activeSheet ? (
                            <div className="h-full max-h-full aspect-[210/297] max-w-full shadow-[0_4px_25px_#0006]">
                                <img
                                    src={activeSheet.previewSheetUrl || activeSheet.sheetUrl}
                                    alt={t.sheetAlt}
                                    draggable={false}
                                    onDragStart={event => event.preventDefault()}
                                    className="block w-full h-full object-contain bg-white"
                                />
                            </div>
                        ) : (
                            <div className="text-center text-white/30 p-8">
                                <Icon icon="pixelarticons:note" className="text-5xl mx-auto mb-4" />
                                <p className="text-sm">{busy ? t.generating : t.sheetEmpty}</p>
                            </div>
                        )}
                    </div>
                    <div className="p-3 border-t border-white/10">
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                disabled={!canDownload}
                                onClick={() => requestDownload('svg')}
                                className={`${buttonClass} flex-1`}
                            >
                                <Icon icon="pixelarticons:download" />
                                {t.exportSvg}{pageBadge}
                            </button>
                            <button
                                type="button"
                                disabled={!canDownload}
                                onClick={() => requestDownload('sheet')}
                                className={`${buttonClass} flex-1`}
                            >
                                <Icon icon="pixelarticons:download" />
                                {t.downloadSheet}{pageBadge}
                            </button>
                        </div>
                    </div>
                </section>
            </div>

            <div className="shrink-0">
                <Footer current={current} />
            </div>

            {pendingDownload && pendingDownload.output === output && !busy && (
                <FigureDownloadDialog current={current} onClose={closeDownload} onDownload={completeDownload} />
            )}
        </PageContainer>
    )
}
