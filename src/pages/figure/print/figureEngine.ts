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
    isSlim: boolean
    stickerUrl: string
    cutterUrl: string
}

export function disposeParts(parts: FigurePart[]) {
    const geometries = new Set(parts.flatMap(part => [part.exportGeometry,
        ...part.meshes.map(mesh => mesh.geometry),
        ...part.cutters.flatMap(cutter => [cutter.geometry, cutter.visual])]))
    geometries.forEach(geometry => geometry?.dispose())
}

export function disposeFigure(output: FigureOutput) {
    disposeParts(output.parts)
    URL.revokeObjectURL(output.stickerUrl)
    URL.revokeObjectURL(output.cutterUrl)
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG export failed')), 'image/png'))
}

// Serialize builds across route changes as both WASM and the guide renderer are shared.
let queue: Promise<unknown> = Promise.resolve()
export function generateFigure(source: HTMLImageElement, signal: AbortSignal, onProgress: (progress: number) => void, info?: StickerInfo): Promise<FigureOutput> {
    const job = queue.catch(() => {}).then(async () => {
        signal.throwIfAborted()
        await loadStickerFont(info)
        signal.throwIfAborted()
        const skin = processSkin(source, 0.5)
        resolveVoxelConsistency(skin)
        const assemblySettings = validateStickerAssemblySettings(normalizeAssemblySettings({}, true), skin.isSlim, true)
        let parts: FigurePart[] = []
        const urls: string[] = []
        try {
            const model = await buildFigure(Float32Array.from(skin.data, channel => channel / 255), skin.width, {
                parts: Object.fromEntries(PRINT_PARTS.map(id => [id, true])),
                decor: true, cuteMode: true, isAlex: skin.isSlim, fillTransparentBase: false, assemblySettings,
            }, (_message, done, total) => { if (!signal.aborted) onProgress(Math.round(done / total * 65)) })
            parts = model.results
            signal.throwIfAborted()
            const pages = await composeMergedPages(skin, { alphaThreshold: 0.5, cuteMode: true, assemblySettings }, percent => {
                if (!signal.aborted) onProgress(65 + Math.round(percent * 0.3))
            })
            const page = pages[0]
            try {
                signal.throwIfAborted()
                const svg = generatePageCutterSVG(page, { includeBackground: false })
                if (info) drawStickerInfo(page.pageCanvas, page.infoArea, info)
                const png = await canvasBlob(page.pageCanvas)
                signal.throwIfAborted()
                const stickerUrl = URL.createObjectURL(png)
                urls.push(stickerUrl)
                const cutterUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
                urls.push(cutterUrl)
                onProgress(100)
                return { parts, isSlim: skin.isSlim, stickerUrl, cutterUrl }
            } finally {
                for (const page of pages) {
                    for (const canvas of [page.pageCanvas, page.cutterCanvas, ...page.cutterLayers]) canvas.width = canvas.height = 1
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
