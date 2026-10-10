import { DEFAULT_PRINT_MODEL, getPrintModelProfile, type PrintModelType } from './figureModels'
import * as THREE from 'three'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { buildFigure } from '../../../lib/minefigure/web_model/src/mcModel/figure'
import type { FigurePart } from '../../../lib/minefigure/web_model/src/types'
import { MODEL_MM_PER_UNIT, normalizeAssemblySettings, validateStickerAssemblySettings } from '../../../lib/minefigure/shared/assemblySettings.js'
import { processSkin, resolveVoxelConsistency } from '../../../lib/minefigure/web_sticker/src/sticker/skinHelper.js'
import { composeMergedPages } from '../../../lib/minefigure/web_sticker/src/sticker/mergedComposer.js'
import { generatePageCutterSVG } from '../../../lib/minefigure/web_sticker/src/sticker/vectorTracer.js'
import { disposePreviewRenderer } from '../../../lib/minefigure/web_sticker/src/sticker/previewRenderer.js'
import { drawStickerInfo, loadStickerFont, type StickerInfo } from './stickerInfo'

export type { FigurePart }
export const PRINT_PARTS = ['head', 'torso', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg', 'shortConnector', 'longConnector'] as const
export type PrintPartId = typeof PRINT_PARTS[number]
export interface FigureOutput {
    parts: FigurePart[]
    modelType?: PrintModelType
    isSlim: boolean
    stickerUrl: string
    cutterUrl: string
    previewStickerUrl?: string
    fullStickerUrl?: string
    fullCutterUrl?: string
    isPreviewSticker?: boolean
    source?: HTMLImageElement
    info?: StickerInfo
}

export function disposeParts(parts: FigurePart[]) {
    const geometries = new Set(parts.flatMap(part => [part.exportGeometry,
        ...part.meshes.map(mesh => mesh.geometry),
        ...part.cutters.flatMap(cutter => [cutter.geometry, cutter.visual])]))
    geometries.forEach(geometry => geometry?.dispose())
}

export function disposeFigure(output: FigureOutput) {
    disposeParts(output.parts)
    const revoked = new Set<string>()
    for (const url of [output.stickerUrl, output.previewStickerUrl, output.fullStickerUrl, output.cutterUrl, output.fullCutterUrl]) {
        if (url && !revoked.has(url)) {
            URL.revokeObjectURL(url)
            revoked.add(url)
        }
    }
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG export failed')), 'image/png'))
}

// Serialize builds across route changes as both WASM and the guide renderer are shared.
let queue: Promise<unknown> = Promise.resolve()
export function generateFigure(source: HTMLImageElement, signal: AbortSignal, onProgress: (progress: number) => void, info?: StickerInfo, options?: { fullRes?: boolean; modelType?: PrintModelType; generateStickers?: boolean }): Promise<FigureOutput> {
    const job = queue.catch(() => {}).then(async () => {
        signal.throwIfAborted()
        if (options?.generateStickers !== false) await loadStickerFont(info)
        signal.throwIfAborted()
        const skin = processSkin(source, 0.5)
        resolveVoxelConsistency(skin)
        const modelType = options?.modelType ?? DEFAULT_PRINT_MODEL
        const { modelScale } = getPrintModelProfile(modelType)
        const assemblySettings = validateStickerAssemblySettings(normalizeAssemblySettings({}, true, modelScale), skin.isSlim, true, modelScale)
        let parts: FigurePart[] = []
        const urls: string[] = []
        try {
            const isFull = !!options?.fullRes
            const model = await buildFigure(Float32Array.from(skin.data, channel => channel / 255), skin.width, {
                parts: Object.fromEntries(PRINT_PARTS.map(id => [id, true])),
                decor: true, cuteMode: true, modelScale, isAlex: skin.isSlim, fillTransparentBase: false, assemblySettings,
            }, (_message, done, total) => { if (!signal.aborted) onProgress(Math.round(done / total * (isFull ? 65 : 75))) })
            parts = model.results
            signal.throwIfAborted()

            if (options?.generateStickers === false) {
                onProgress(100)
                signal.throwIfAborted()
                return { parts, modelType, isSlim: skin.isSlim, stickerUrl: '', cutterUrl: '', source, info }
            }

            const pages = await composeMergedPages(skin, { alphaThreshold: 0.5, cuteMode: true, modelScale, assemblySettings, preview: !isFull, signal }, percent => {
                if (!signal.aborted) onProgress(isFull ? (65 + Math.round(percent * 0.3)) : (75 + Math.round(percent * 0.2)))
            })
            const page = pages[0]
            try {
                signal.throwIfAborted()
                let cutterUrl = ''
                if (isFull) {
                    const svg = generatePageCutterSVG(page, { includeBackground: false })
                    cutterUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
                    urls.push(cutterUrl)
                }
                if (info) drawStickerInfo(page.pageCanvas, page.infoArea, info)
                const png = await canvasBlob(page.pageCanvas)
                signal.throwIfAborted()
                const stickerUrl = URL.createObjectURL(png)
                urls.push(stickerUrl)
                onProgress(100)
                return {
                    parts,
                    modelType,
                    isSlim: skin.isSlim,
                    stickerUrl,
                    cutterUrl,
                    previewStickerUrl: isFull ? undefined : stickerUrl,
                    fullStickerUrl: isFull ? stickerUrl : undefined,
                    fullCutterUrl: isFull ? cutterUrl : undefined,
                    isPreviewSticker: !isFull,
                    source,
                    info,
                }
            } finally {
                for (const p of pages) {
                    for (const canvas of [p.pageCanvas, p.cutterCanvas, ...p.cutterLayers]) if (canvas) canvas.width = canvas.height = 1
                }
            }
        } catch (error) {
            disposeParts(parts)
            urls.forEach(url => URL.revokeObjectURL(url))
            throw error
        } finally {
            skin.canvas.width = skin.canvas.height = 1
            disposePreviewRenderer()
        }
    })
    queue = job
    return job
}

/** Generates 4200x5940 high-resolution sticker PNG and cutter SVG on demand when downloading. */
export function generateFullFigureAssets(output: FigureOutput, signal: AbortSignal, onProgress: (progress: number) => void): Promise<{ stickerUrl: string; cutterUrl: string }> {
    if (output.fullStickerUrl && (output.fullCutterUrl || output.cutterUrl)) {
        return Promise.resolve({ stickerUrl: output.fullStickerUrl, cutterUrl: (output.fullCutterUrl || output.cutterUrl)! })
    }
    const source = output.source
    if (!source) return Promise.reject(new Error('Source image is unavailable'))
    const job = queue.catch(() => {}).then(async () => {
        signal.throwIfAborted()
        await loadStickerFont(output.info)
        signal.throwIfAborted()
        const skin = processSkin(source, 0.5)
        resolveVoxelConsistency(skin)
        const { modelScale } = getPrintModelProfile(output.modelType)
        const assemblySettings = validateStickerAssemblySettings(normalizeAssemblySettings({}, true, modelScale), skin.isSlim, true, modelScale)
        const urls: string[] = []
        try {
            onProgress(10)
            const pages = await composeMergedPages(skin, { alphaThreshold: 0.5, cuteMode: true, modelScale, assemblySettings, preview: false, signal }, percent => {
                if (!signal.aborted) onProgress(10 + Math.round(percent * 0.6))
            })
            const page = pages[0]
            try {
                signal.throwIfAborted()
                onProgress(75)
                const svg = generatePageCutterSVG(page, { includeBackground: false })
                if (output.info) drawStickerInfo(page.pageCanvas, page.infoArea, output.info)
                onProgress(90)
                const png = await canvasBlob(page.pageCanvas)
                signal.throwIfAborted()
                const stickerUrl = URL.createObjectURL(png)
                urls.push(stickerUrl)
                const cutterUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
                urls.push(cutterUrl)
                output.fullStickerUrl = stickerUrl
                output.fullCutterUrl = cutterUrl
                output.cutterUrl = cutterUrl
                output.stickerUrl = stickerUrl
                output.isPreviewSticker = false
                onProgress(100)
                return { stickerUrl, cutterUrl }
            } finally {
                for (const p of pages) {
                    for (const canvas of [p.pageCanvas, p.cutterCanvas, ...p.cutterLayers]) if (canvas) canvas.width = canvas.height = 1
                }
            }
        } catch (error) {
            urls.forEach(url => URL.revokeObjectURL(url))
            throw error
        } finally {
            skin.canvas.width = skin.canvas.height = 1
            disposePreviewRenderer()
        }
    })
    queue = job
    return job
}

/** Same closed geometry and millimetre scale used by Minefigure's STL export. */
export function exportPartStl(part: FigurePart): Blob {
    const root = new THREE.Group()
    root.rotation.x = -Math.PI / 2
    root.scale.setScalar(MODEL_MM_PER_UNIT)
    const material = new THREE.MeshBasicMaterial()
    const geometries = part.exportGeometry ? [part.exportGeometry] : part.meshes.map(mesh => mesh.geometry)
    for (const geometry of geometries) {
        const mesh = new THREE.Mesh(geometry, material)
        mesh.position.set(...part.position)
        root.add(mesh)
    }
    root.updateMatrixWorld(true)
    try {
        const data = new STLExporter().parse(root, { binary: true })
        return new Blob([data.buffer as ArrayBuffer], { type: 'model/stl' })
    } finally { material.dispose() }
}
