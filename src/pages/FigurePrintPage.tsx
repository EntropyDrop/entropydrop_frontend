import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { PageContainer } from '../components/PageContainer'
import { SEO } from '../components/SEO'
import type { LangData } from '../constants/lang'
import { request } from '../utils/httpClient'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { disposeFigure, exportPartStl, generateFigure, generateFullFigureAssets, type FigureOutput, type PrintPartId } from './figure/print/figureEngine'
import { FigurePreview } from './figure/print/FigurePreview'
import { FigureDownloadDialog } from './figure/print/FigureDownloadDialog'
import { downloadUrl } from './figure/print/download'
import { figureSourcePath, figureSourceUrl, readFigureSource, type FigureSkinSource } from './figure/print/figureSource'
import { orderStickerInfo } from './figure/print/orderSticker'
import { useOrderProductionSource } from './figure/print/useOrderProductionSource'
import { usePublicFigureSource } from './figure/print/usePublicFigureSource'
import { getOrderPrintModel, FIGURE_MODELS, type FigureModel } from './figure/print/figureModels'
import { FigureKitPrice } from './figure/print/FigureKitPrice'

const FigureCommissionDialog = lazy(() => import('./figure/print/FigureCommissionDialog').then(m => ({ default: m.FigureCommissionDialog })))

interface PrintSource { textureUrl?: string; name?: string; source?: unknown }
type DownloadTarget = { kind: 'part'; id: string } | { kind: 'sticker' | 'cutter' }
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

export function FigurePrintPage({ current }: { current: LangData }) {
    const t = current.figurePrint
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
    const [model, setModel] = useState<FigureModel>(FIGURE_MODELS[0])
    const location = useLocation()
    const production = useOrderProductionSource(location.search || '')
    const publicSource = usePublicFigureSource(production.active ? '' : location.search || '')
    const savedSticker = production.data?.sticker_snapshot
    const printModelType = production.active ? getOrderPrintModel(savedSticker?.model_name) : model.id
    const state = location.state as PrintSource | null
    const textureUrl = production.active ? production.data?.skin_url || '' : publicSource.active ? publicSource.data?.textureUrl || '' : typeof state?.textureUrl === 'string' ? state.textureUrl : ''
    const source = useMemo(() => production.active ? savedSticker ? { id: savedSticker.skin_id, name: savedSticker.skin_name, publisher: savedSticker.publisher_name, publisherId: savedSticker.publisher_id, parentId: '', publicLicense: '' } : null : publicSource.active ? publicSource.data?.source || null : readFigureSource(state?.source), [production.active, savedSticker, publicSource.active, publicSource.data, state?.source])
    const name = source?.name || (!publicSource.active && !production.active && typeof state?.name === 'string' ? state.name : '')
    const stickerInfo = useMemo(() => savedSticker ? orderStickerInfo(savedSticker) : ({
        name: name || t.unnamedSkin,
        publisher: source?.publisher || t.unknownPublisher,
        publisherId: source?.publisherId || '',
        sourceId: source?.id || '',
        sourceUrl: source ? figureSourceUrl(source.id) : '',
        sourceIsPublic: source?.isPublic,
        labels: t.stickerInfo,
    }), [savedSticker, name, source, t.unnamedSkin, t.unknownPublisher, t.stickerInfo])
    const [output, setOutput] = useState<FigureOutput | null>(null)
    const [progress, setProgress] = useState(0)
    const [busy, setBusy] = useState(!!textureUrl)
    const [busyLabel, setBusyLabel] = useState<string | null>(null)
    const [failure, setFailure] = useState<Failure | null>(null)
    const [retry, setRetry] = useState(0)
    const [previewFailed, setPreviewFailed] = useState(false)
    const [pendingDownload, setPendingDownload] = useState<{ output: FigureOutput; target: DownloadTarget } | null>(null)
    const [commissionSource, setCommissionSource] = useState<FigureSkinSource | null>(null)
    const downloadAbortRef = useRef<AbortController | null>(null)
    const canDownload = !!output && !busy
    const closeDownload = useCallback(() => setPendingDownload(null), [])
    const onPreviewError = useCallback(() => setPreviewFailed(true), [])
    const closeCommission = useCallback(() => setCommissionSource(null), [])

    useEffect(() => {
        const controller = new AbortController()
        let result: FigureOutput | null = null
        let imageUrl: string | undefined
        async function generate() {
            setOutput(null)
            setFailure(null)
            setPreviewFailed(false)
            setProgress(0)
            setBusy(!!textureUrl)
            setBusyLabel(null)
            setPendingDownload(null)
            setCommissionSource(null)
            if (!textureUrl) return
            let stage: Failure = 'loadFailed'
            try {
                const response = await request(textureUrl, { signal: controller.signal, skipGlobalError: true })
                if (!response.ok) throw new Error(`Skin request failed: ${response.status}`)
                imageUrl = URL.createObjectURL(await response.blob())
                const source = await loadImage(imageUrl)
                controller.signal.throwIfAborted()
                stage = 'invalidSkin'
                if (source.width !== 64 || ![32, 64].includes(source.height)) throw new Error('Invalid skin dimensions')
                stage = 'buildFailed'
                result = await generateFigure(source, controller.signal, setProgress, stickerInfo, { modelType: printModelType })
                if (controller.signal.aborted) { disposeFigure(result); result = null; return }
                setOutput(result)
            } catch (error) {
                if (!controller.signal.aborted) { console.error('Figure generation failed', error); setFailure(stage) }
            } finally {
                if (imageUrl) URL.revokeObjectURL(imageUrl)
                if (!controller.signal.aborted) setBusy(false)
            }
        }
        // The microtask also avoids duplicate work during StrictMode's setup/cleanup probe.
        void Promise.resolve().then(() => { if (!controller.signal.aborted) return generate() })
        return () => {
            controller.abort()
            downloadAbortRef.current?.abort()
            if (result) disposeFigure(result)
        }
    }, [textureUrl, retry, stickerInfo, printModelType])

    function requestDownload(target: DownloadTarget) {
        if (output && !busy) setPendingDownload({ output, target })
    }

    const completeDownload = useCallback(async () => {
        // A completed request must never download a replaced/disposed model.
        if (!pendingDownload || pendingDownload.output !== output || busy) return
        const target = pendingDownload.target
        const activeOutput = output
        setPendingDownload(null)
        try {
            if (target.kind === 'part') {
                const part = activeOutput.parts.find(part => part.id === target.id)
                if (!part) return
                const url = URL.createObjectURL(exportPartStl(part))
                downloadUrl(url, `${printModelType}_${part.id}.stl`)
                setTimeout(() => URL.revokeObjectURL(url), 1000)
            } else {
                let stickerUrl = activeOutput.fullStickerUrl
                let cutterUrl = activeOutput.fullCutterUrl || activeOutput.cutterUrl
                const needsFull = !stickerUrl || !cutterUrl || activeOutput.isPreviewSticker
                if (needsFull && activeOutput.source && typeof generateFullFigureAssets === 'function') {
                    downloadAbortRef.current?.abort()
                    const controller = new AbortController()
                    downloadAbortRef.current = controller
                    setBusy(true)
                    setBusyLabel(t.generatingFull || t.generating)
                    setProgress(0)
                    try {
                        const full = await generateFullFigureAssets(activeOutput, controller.signal, setProgress)
                        if (controller.signal.aborted) return
                        stickerUrl = full.stickerUrl
                        cutterUrl = full.cutterUrl
                        setOutput({ ...activeOutput, ...full, isPreviewSticker: false })
                    } finally {
                        if (!controller.signal.aborted) {
                            setBusy(false)
                            setBusyLabel(null)
                        }
                    }
                } else if (!stickerUrl || !cutterUrl) {
                    stickerUrl = activeOutput.stickerUrl
                    cutterUrl = activeOutput.cutterUrl
                }
                if (target.kind === 'sticker') {
                    if (!stickerUrl) return
                    downloadUrl(stickerUrl, `${printModelType}_sticker_A4.png`)
                } else {
                    if (!cutterUrl) return
                    downloadUrl(cutterUrl, `${printModelType}_sticker_cut_A4.svg`)
                }
            }
            setHasDownloaded(true)
        } catch (error: unknown) {
            if (error instanceof Error && error.name === 'AbortError') return
            console.error(error)
            setFailure('exportFailed')
        }
    }, [pendingDownload, output, busy, printModelType, t.generatingFull, t.generating])

    if (production.active && !production.data) return <PageContainer className={current.fontClass}><p role={production.failed ? 'alert' : 'status'} className="text-sm text-white/65">{production.failed ? t.productionSourceFailed : t.productionSourceLoading}</p>{production.failed && <button type="button" className={buttonClass} onClick={production.retry}>{t.retry}</button>}<Link to="/figure/manage" className="text-xs text-[#a6df7a] underline">{t.backToManagement}</Link></PageContainer>

    if (publicSource.active && !publicSource.data) return <PageContainer className={current.fontClass}>
        <SEO title={t.title} description={t.description} />
        <p role={publicSource.error ? 'alert' : 'status'} className="text-sm text-white/65">{publicSource.error === 'unavailable' ? t.sharedSourceUnavailable : publicSource.error ? t.loadFailed : t.sharedSourceLoading}</p>
        <div className="flex flex-wrap gap-3">
            {publicSource.error === 'loadFailed' && <button type="button" className={buttonClass} onClick={publicSource.retry}>{t.retry}</button>}
            <Link to="/skin/" className={buttonClass}>{t.discoverSkins}</Link>
        </div>
    </PageContainer>

    if (!textureUrl) return (
        <div className={`absolute inset-0 z-10 flex flex-col justify-between overflow-x-hidden overflow-y-auto custom-scrollbar ${current.fontClass}`}>
            <SEO title={t.title} description={t.description} />
            {/* Background Physical Figure Showcase spanning entire screen from behind nav down */}
            <div className="fixed inset-0 pointer-events-none select-none overflow-hidden" aria-hidden="true">
                <img
                    src="/images/figure_physical_showcase.jpg"
                    alt="Physical 3D printed voxel figures"
                    className="w-full h-full object-cover object-center filter brightness-[0.98] contrast-[1.02]"
                    loading="eager"
                    decoding="async"
                />
                {/* Subtle gradient: soft darkening at top behind nav for contrast, gentle darkening at bottom behind dock */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/65 via-transparent to-black/55" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_65%,rgba(0,0,0,0.25)_100%)]" />
            </div>

            {/* Top spacing below floating Navbar */}
            <div className="pt-20 sm:pt-28 px-4 sm:px-8 max-w-7xl mx-auto w-full relative z-10 flex items-center justify-between pointer-events-none shrink-0">
                <div className="flex items-center gap-2.5 pointer-events-auto">
                    <Icon icon="pixelarticons:box" className="text-[#71bc56] text-xl sm:text-2xl drop-shadow" />
                    <h1 className="text-base sm:text-xl font-bold text-white tracking-wide m-0 drop-shadow">
                        {t.title}
                    </h1>
                </div>
            </div>

            {/* Center Spacer to showcase the 4 physical figures */}
            <div className="relative z-10 flex-1 min-h-[40px] sm:min-h-[80px]" aria-hidden="true" />

            {/* Bottom Floating Glassmorphism Hero Dock */}
            <div className="relative z-10 pb-6 sm:pb-8 lg:pb-10 px-4 w-full">
                <div className="flex flex-col items-center text-center gap-3.5 max-w-2xl mx-auto w-full p-4 sm:p-5 bg-black/30 backdrop-blur-md border border-white/20 shadow-2xl">
                    <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-0.5 text-[10px] sm:text-xs ${current.fontClass || 'font-pixel-hans'} uppercase tracking-wider border border-amber-500/40 bg-amber-500/20 text-amber-300 backdrop-blur-md`}>
                            3D PRINT FIGURE
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
                            <span>{t.chooseCollection}</span>
                        </Link>
                        <Link
                            to="/skin/"
                            className="w-full sm:w-auto px-5 py-2.5 bg-white/10 hover:bg-white/15 text-white text-xs font-bold inline-flex items-center justify-center gap-2 transition-all backdrop-blur-md border border-white/20 hover:border-white/35 active:translate-y-px no-underline"
                        >
                            <Icon icon="pixelarticons:search" className="text-base" />
                            <span>{t.discoverSkins}</span>
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
    )

    const partLabel = (id: string) => t.parts[id as PrintPartId] || id
    return <PageContainer gap="gap-4" className={current.fontClass}>
        <SEO title={t.title} description={t.description} />
        <header className="flex flex-wrap items-center justify-between gap-3 shrink-0 border-b border-white/10 pb-4">
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                    <div className="flex items-center gap-3"><Icon icon="pixelarticons:box" className="text-[#71bc56] text-2xl" /><h2 className="text-xl sm:text-2xl m-0">{t.title}</h2></div>
                    <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-2 text-xs text-white/60">{t.modelType}<span className="relative inline-flex"><select aria-label={t.modelType} value={printModelType} disabled={production.active} onChange={event => {
                            const selected = FIGURE_MODELS.find(item => item.id === event.target.value)
                            if (selected) { setCommissionSource(null); setPendingDownload(null); setModel(selected) }
                        }} className="h-9 appearance-none rounded-none border border-white/15 bg-white/5 pl-3 pr-8 py-0 text-xs text-white/80 cursor-pointer hover:bg-white/10 hover:text-white transition-colors focus:outline-none focus:border-[#84c96b]">{production.active && printModelType === 'cute7' && <option value="cute7" className="bg-[#182018]">CUTE-7cm</option>}{FIGURE_MODELS.map(item => <option key={item.id} value={item.id} className="bg-[#182018]">{item.name}</option>)}</select><Icon icon="pixelarticons:chevron-down" className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs" /></span></label>
                        <Link to="/figure/showcase" className={`${buttonClass} h-9 shrink-0 !py-0 no-underline`}><Icon icon="pixelarticons:image" />{current.nav.showcase}</Link>
                        {!production.active && <Link to="/skin/collection" className={`${buttonClass} h-9 shrink-0 !py-0 no-underline`}><Icon icon="pixelarticons:folder" />{t.chooseCollection}</Link>}
                    </div>
                </div>
            </div>
            <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-x-3 gap-y-2">
                {!production.active && <>
                    <span className="text-xs leading-relaxed text-white/50">{t.commissionIntro}</span>
                    <button type="button" disabled={!source || !canDownload} onClick={() => setCommissionSource(source)} className={`${buttonClass} h-9 shrink-0 !py-0 !bg-[#3c8527] hover:!bg-[#4ea632] !text-white`}><Icon icon="pixelarticons:box" />{t.commission}<FigureKitPrice modelType={model.orderModelType} current={current} /></button>
                </>}
                {production.active && <Link to="/figure/manage" className={buttonClass}>{t.backToManagement}</Link>}
            </div>
        </header>
        {hasDownloaded && !production.active && !isPro && !proPromptDismissed && (
            <div className="shrink-0 border border-[#a6df7a]/25 bg-gradient-to-r from-[#a6df7a]/12 via-[#a6df7a]/5 to-transparent p-3 sm:px-4 sm:py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs backdrop-blur-sm relative">
                <div className="flex items-center gap-2.5 min-w-0">
                    <Icon icon="pixelarticons:zap" className="text-base text-[#a6df7a] shrink-0 animate-pulse" />
                    <span className="text-white/85 leading-relaxed">
                        {t.proSupportPrompt}
                    </span>
                </div>
                <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-auto">
                    <Link
                        to="/pro"
                        className="inline-flex items-center gap-1 border border-[#a6df7a]/40 bg-[#a6df7a]/15 hover:bg-[#a6df7a]/25 px-3 py-1.5 text-xs font-medium text-[#a6df7a] hover:text-[#c4f09e] transition-all no-underline shadow-[0_0_10px_rgba(166,223,122,0.1)] active:translate-y-px"
                    >
                        <span>{t.proSupportAction}</span>
                        <Icon icon="pixelarticons:chevron-right" className="text-xs" />
                    </Link>
                    <button
                        type="button"
                        onClick={dismissProPrompt}
                        className="text-white/40 hover:text-white p-1 cursor-pointer transition-colors bg-transparent border-none inline-flex items-center justify-center"
                        aria-label={t.dismissProPrompt}
                        title={t.dismissProPrompt}
                    >
                        <Icon icon="pixelarticons:close" className="text-xs" />
                    </button>
                </div>
            </div>
        )}
        {failure && <div role="alert" className="flex flex-wrap items-center gap-3 border border-red-400/25 bg-red-400/10 p-3 text-xs text-red-200 shrink-0"><span className="flex-1">{t[failure]}</span>{textureUrl && !busy && <button type="button" className={buttonClass} onClick={production.active ? production.retry : () => setRetry(value => value + 1)}>{t.retry}</button>}</div>}
        {busy && <div role="status" className="shrink-0"><div className="flex justify-between text-xs text-white/60 mb-2"><span>{busyLabel || t.generating}</span><span>{progress}%</span></div><div role="progressbar" aria-label={busyLabel || t.generating} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} className="h-1 bg-white/10"><div className="h-full bg-[#4ea632] transition-[width]" style={{ width: `${progress}%` }} /></div></div>}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0 lg:min-h-[430px] max-lg:flex-none">
            <section className="flex flex-col min-h-0 border border-white/10 bg-[#101510]/75">
                <div className="flex items-center justify-between gap-3 p-3 border-b border-white/10 text-sm">
                    <h3 className="m-0 shrink-0 text-sm">{t.model}</h3>
                    <div className="flex min-w-0 items-center justify-end gap-1.5 text-[11px] text-white/55">
                        <span className="shrink-0">{t.source}:</span>
                        {source ? <Link to={figureSourcePath(source.id)} title={source.name || t.unnamedSkin} className="truncate text-[#84c96b] underline underline-offset-2">{source.name || t.unnamedSkin}</Link>
                            : <Link to="/skin/collection" className="truncate underline underline-offset-2" title={t.sourceUnavailable}>{t.sourceUnavailable}</Link>}
                    </div>
                </div>
                <div className="relative flex-1 min-h-[320px] lg:min-h-[240px] bg-[radial-gradient(ellipse_at_center,#263323_0%,#111711_75%)]">
                    {output ? <><FigurePreview modelType={output.modelType} parts={output.parts} isSlim={output.isSlim} assemblyLabels={t.assembly} voxelModeLabel={t.voxelMode} voxelModeHint={t.voxelModeHint} partLabels={t.parts} onError={onPreviewError} />{previewFailed && <p className="absolute inset-x-4 bottom-3 text-xs bg-black/70 p-3">{t.previewFailed}</p>}</> : <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center text-white/35"><Icon icon="pixelarticons:box" className={`text-5xl ${busy ? 'animate-pulse' : ''}`} /><p className="text-sm m-0">{busy ? t.generating : t.empty}</p></div>}
                    {!production.active && <Link to="/skin/edit" state={{ textureUrl, name, passedLogId: source?.id, isPublic: source?.isPublic }} className={`${buttonClass} absolute left-3 top-3 z-10 !py-1.5 !bg-black/50`}><Icon icon="pixelarticons:edit" />{current.nav.edit}</Link>}
                </div>
                {output && <div className="p-3 border-t border-white/10"><div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{output.parts.map(part => <button type="button" key={part.id} disabled={!canDownload} onClick={() => requestDownload({ kind: 'part', id: part.id })} className={`${buttonClass} !px-2`} aria-label={`${partLabel(part.id)} STL`}><Icon icon="pixelarticons:download" className="shrink-0" /><span>{partLabel(part.id)}<span className="block text-[9px] text-white/35 mt-0.5">STL</span></span></button>)}</div></div>}
            </section>
            <section className="flex flex-col min-h-0 border border-white/10 bg-[#151515]/80">
                <div className="p-3 border-b border-white/10"><h3 className="m-0 text-sm">{t.stickers}</h3></div>
                <div onContextMenu={event => event.preventDefault()} className="relative flex-1 min-h-[400px] lg:min-h-0 overflow-auto p-4 flex items-center justify-center bg-[#222] select-none [-webkit-touch-callout:none]">
                    {output ? <div className="h-full max-h-full aspect-[210/297] max-w-full shadow-[0_4px_25px_#0006]"><img src={output.previewStickerUrl || output.stickerUrl} alt={t.stickerAlt} draggable={false} onDragStart={event => event.preventDefault()} className="block w-full h-full object-contain bg-white" /></div> : <div className="text-center text-white/30 p-8"><Icon icon="pixelarticons:note" className="text-5xl mx-auto mb-4" /><p className="text-sm">{busy ? t.generating : t.stickerEmpty}</p></div>}
                </div>
                <div className="p-3 border-t border-white/10"><div className="flex flex-wrap gap-2"><button type="button" disabled={!canDownload} onClick={() => requestDownload({ kind: 'cutter' })} className={`${buttonClass} flex-1`}><Icon icon="pixelarticons:download" />{t.exportSvg}</button><button type="button" disabled={!canDownload} onClick={() => requestDownload({ kind: 'sticker' })} className={`${buttonClass} flex-1`}><Icon icon="pixelarticons:download" />{t.downloadSticker}</button></div></div>
            </section>
        </div>
        {pendingDownload && pendingDownload.output === output && !busy && <FigureDownloadDialog current={current} onClose={closeDownload} onDownload={completeDownload} />}
        {commissionSource && commissionSource === source && canDownload && <Suspense fallback={null}><FigureCommissionDialog key={model.id} current={current} source={commissionSource} model={model} onClose={closeCommission} /></Suspense>}
    </PageContainer>
}
