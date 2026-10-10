import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { LangData } from '../../../constants/lang'
import { request } from '../../../utils/httpClient'
import { disposeFigure, generateFigure, type FigureOutput } from './figureEngine'
import { FigurePreview } from './FigurePreview'
import { getPrintModelProfile, type PrintModelType } from './figureModels'

export function FigureOrderPreviewModal({ textureUrl, current, modelType = 'cute7', onClose }: {
    textureUrl: string
    modelType?: PrintModelType
    current: LangData
    onClose: () => void
}) {
    const dialog = useRef<HTMLDialogElement>(null)
    const [output, setOutput] = useState<FigureOutput | null>(null)
    const [failed, setFailed] = useState(false)
    const [retry, setRetry] = useState(0)
    const onError = useCallback(() => setFailed(true), [])
    const t = current.figurePrint

    useEffect(() => {
        const element = dialog.current!
        element.showModal()
        return () => element.close()
    }, [])

    useEffect(() => {
        const controller = new AbortController()
        let result: FigureOutput | null = null
        async function load() {
            setOutput(null)
            setFailed(false)
            let imageUrl: string | undefined
            try {
                const response = await request(textureUrl, { signal: controller.signal, skipGlobalError: true })
                if (!response.ok) throw new Error('Skin request failed')
                const blob = await response.blob()
                controller.signal.throwIfAborted()
                imageUrl = URL.createObjectURL(blob)
                const source = await new Promise<HTMLImageElement>((resolve, reject) => {
                    const image = new Image()
                    image.onload = () => resolve(image)
                    image.onerror = () => reject(new Error('Image decode failed'))
                    image.src = imageUrl!
                })
                controller.signal.throwIfAborted()
                if (source.width !== 64 || ![32, 64].includes(source.height)) throw new Error('Invalid skin dimensions')
                // Reuse the print engine, including its white, non-sticker surfaces.
                result = await generateFigure(source, controller.signal, () => {}, undefined, { modelType, generateStickers: false })
                if (controller.signal.aborted) { disposeFigure(result); result = null; return }
                setOutput(result)
            } catch {
                if (!controller.signal.aborted) setFailed(true)
            } finally {
                if (imageUrl) URL.revokeObjectURL(imageUrl)
            }
        }
        void Promise.resolve().then(() => { if (!controller.signal.aborted) return load() })
        return () => {
            controller.abort()
            if (result) disposeFigure(result)
        }
    }, [textureUrl, modelType, retry])

    return createPortal(<dialog ref={dialog} aria-labelledby="figure-order-preview-title" onCancel={event => { event.preventDefault(); onClose() }} className={`m-auto w-[calc(100%-2rem)] max-w-2xl max-h-[90dvh] overflow-auto border border-white/15 bg-[#111711] p-0 text-white shadow-2xl backdrop:bg-black/60 ${current.fontClass}`}>
        <header className="flex items-center justify-between gap-4 border-b border-white/10 p-4">
            <h2 id="figure-order-preview-title" className="m-0 text-sm">{getPrintModelProfile(modelType).name} · {t.model}</h2>
            <button type="button" onClick={onClose} className="border border-white/20 px-3 py-1.5 text-xs hover:bg-white/10 cursor-pointer">{current.orders.closePreview}</button>
        </header>
        <div className="relative h-[min(65dvh,560px)] min-h-80 bg-[radial-gradient(ellipse_at_center,#263323_0%,#111711_75%)]">
            {failed ? <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center text-sm"><p>{t.previewFailed}</p><button type="button" onClick={() => setRetry(value => value + 1)} className="border border-white/20 px-3 py-2 cursor-pointer">{t.retry}</button></div>
                : output ? <FigurePreview modelType={output.modelType} parts={output.parts} isSlim={output.isSlim} assemblyLabels={t.assembly} resetLabel={t.resetView} resetPositionsLabel={t.resetPositions} partLabels={t.parts} onError={onError} />
                : <p role="status" className="absolute inset-0 flex items-center justify-center text-sm text-white/60">{t.generating}</p>}
        </div>
    </dialog>, document.body)
}
