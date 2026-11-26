import { createCanvas, processSkin } from '../../../lib/minefigure/web_sticker/src/sticker/skinHelper.js'
import { STICKER_FONT_FAMILY } from '../../../lib/minefigure/web_sticker/src/sticker/mergedComposer.js'
import { loadStickerFont, type StickerInfo } from '../print/stickerInfo'
import {
    DEFAULT_ORIGAMI_LAYER,
    DEFAULT_ORIGAMI_MODEL,
    type OrigamiLayerMode,
    type OrigamiModelId,
} from './origamiModels'
import {
    buildOrigamiLayout,
    generateOrigamiBasePageSvg,
    type FaceUvRect,
    type OrigamiBasePage,
    type OrigamiFaceName,
    type OrigamiFaceSpec,
    type OrigamiLayout,
    type OrigamiPartId,
    type Point2D,
} from './origamiLayout'
import {
    buildDualLayerPlan,
    generateOverlayPageSvg,
    mapFaceGridPointMm,
    readOrientedSkinPixel,
    type DualLayerOverlayPage,
    type DualLayerPlan,
    type SupportAnchor,
} from './origamiDualLayer'

const PREVIEW_PX_PER_MM = 4 // 840 x 1188 px
const FULL_PX_PER_MM = 16 // 3360 x 4752 px (~406 DPI)

export interface OrigamiSheetLabels {
    cutLine: string
    foldLine: string
    glueTab: string
    scaleLabel: string
    tipCut: string
    tipFold: string
    tipGlue: string
    dualOverlayTitle?: string
    dualLshapeLegend?: string
    dualTip?: string
    dualEmptyOverlay?: string
}

export const DEFAULT_SHEET_LABELS: OrigamiSheetLabels = {
    cutLine: 'Cut',
    foldLine: 'Mountain fold',
    glueTab: 'Glue tab',
    scaleLabel: '3 cm scale check',
    tipCut: '1. Print A4 at 100% scale (160-200g paper).',
    tipFold: '2. Cut solid lines, score & fold dashed lines away.',
    tipGlue: '3. Glue tabs inside, then join head, arms & legs with wooden sticks or glue.',
    dualOverlayTitle: 'Outer Layer Stickers & L-Supports',
    dualLshapeLegend: 'L-Support: 1 pc, 5 mountain folds (90 deg L + diagonal brace & self-glue tab)',
    dualTip: 'Glue self-tab to close #N support, attach to number N on base sheet, then glue outer sticker on top.',
    dualEmptyOverlay: 'This skin has no opaque outer-layer pixels; only base sheets are needed.',
}

export type PartFaceCanvasMap = Record<OrigamiPartId, Record<OrigamiFaceName, HTMLCanvasElement>>

export interface OrigamiSheetOutput {
    pageNumber: number
    kind: 'base' | 'overlay'
    baseRole?: OrigamiBasePage['role']
    filenameSuffix: string
    previewSheetUrl: string
    sheetUrl: string
    fullSheetUrl?: string
    svgUrl: string
    isPreviewSheet: boolean
}

export interface OrigamiOutput {
    modelId: OrigamiModelId
    layerMode: OrigamiLayerMode
    isSlim: boolean
    includeOverlay: boolean
    showGuideLines: boolean
    layout: OrigamiLayout
    faceCanvases: PartFaceCanvasMap
    overlayFaceCanvases?: PartFaceCanvasMap
    dualPlan?: DualLayerPlan
    sheets: OrigamiSheetOutput[]
    skinData?: Uint8ClampedArray
    previewSheetUrl: string
    sheetUrl: string
    fullSheetUrl?: string
    svgUrl: string
    isPreviewSheet: boolean
    info?: StickerInfo
    sheetLabels: OrigamiSheetLabels
}

export interface GenerateOrigamiOptions {
    modelId?: OrigamiModelId
    layerMode?: OrigamiLayerMode
    includeOverlay?: boolean
    showGuideLines?: boolean
    sheetLabels?: OrigamiSheetLabels
}

function cleanText(value: string) {
    return value.replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim()
}

function fitText(ctx: CanvasRenderingContext2D, value: string, maxWidth: number) {
    const text = cleanText(value)
    if (ctx.measureText(text).width <= maxWidth) return text
    const chars = Array.from(text)
    while (chars.length && ctx.measureText(`${chars.join('')}…`).width > maxWidth) chars.pop()
    return `${chars.join('')}…`
}

function extractSingleFace(
    skinData: Uint8ClampedArray,
    face: OrigamiFaceSpec,
    includeOverlay: boolean,
): HTMLCanvasElement {
    const w = face.gridW
    const h = face.gridH
    const canvas = createCanvas(w, h)
    const ctx = canvas.getContext('2d')!
    const imgData = ctx.createImageData(w, h)
    const out = imgData.data

    for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
            const [br, bg, bb, ba] = readOrientedSkinPixel(skinData, face.baseUv, dx, dy, h)
            const [or, og, ob, oa] = readOrientedSkinPixel(skinData, face.overlayUv, dx, dy, h)
            const dstIdx = (dy * w + dx) * 4

            let r = ba >= 128 ? br : 255
            let g = ba >= 128 ? bg : 255
            let b = ba >= 128 ? bb : 255

            if (includeOverlay && oa >= 128) {
                r = or
                g = og
                b = ob
            }

            out[dstIdx] = r
            out[dstIdx + 1] = g
            out[dstIdx + 2] = b
            out[dstIdx + 3] = 255
        }
    }

    ctx.putImageData(imgData, 0, 0)
    return canvas
}

function extractOverlayOnlyFace(skinData: Uint8ClampedArray, face: OrigamiFaceSpec): HTMLCanvasElement {
    const w = face.gridW
    const h = face.gridH
    const canvas = createCanvas(w, h)
    const ctx = canvas.getContext('2d')!
    const imgData = ctx.createImageData(w, h)
    const out = imgData.data

    for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
            const [r, g, b, a] = readOrientedSkinPixel(skinData, face.overlayUv, dx, dy, h)
            const dstIdx = (dy * w + dx) * 4
            if (a >= 128) {
                out[dstIdx] = r
                out[dstIdx + 1] = g
                out[dstIdx + 2] = b
                out[dstIdx + 3] = 255
            }
        }
    }

    ctx.putImageData(imgData, 0, 0)
    return canvas
}

export function extractPartFaceCanvases(
    skinData: Uint8ClampedArray,
    layout: OrigamiLayout,
    includeOverlay = true,
): PartFaceCanvasMap {
    const result = {} as PartFaceCanvasMap
    for (const part of layout.parts) {
        const faces = {} as Record<OrigamiFaceName, HTMLCanvasElement>
        for (const face of part.faces) {
            faces[face.name] = extractSingleFace(skinData, face, includeOverlay)
        }
        result[part.id] = faces
    }
    return result
}

export function extractOverlayFaceCanvases(
    skinData: Uint8ClampedArray,
    layout: OrigamiLayout,
): PartFaceCanvasMap {
    const result = {} as PartFaceCanvasMap
    for (const part of layout.parts) {
        const faces = {} as Record<OrigamiFaceName, HTMLCanvasElement>
        for (const face of part.faces) {
            faces[face.name] = extractOverlayOnlyFace(skinData, face)
        }
        result[part.id] = faces
    }
    return result
}

function evalQuad(quad: [Point2D, Point2D, Point2D, Point2D], u: number, v: number): Point2D {
    const [tl, tr, br, bl] = quad
    const tx = tl[0] + (tr[0] - tl[0]) * u
    const ty = tl[1] + (tr[1] - tl[1]) * u
    const bx = bl[0] + (br[0] - bl[0]) * u
    const by = bl[1] + (br[1] - bl[1]) * u
    return [tx + (bx - tx) * v, ty + (by - ty) * v]
}

function isAxisAlignedRectQuad(quad: [Point2D, Point2D, Point2D, Point2D]): boolean {
    const [tl, tr, br, bl] = quad
    const eps = 1e-4
    return (
        Math.abs(tl[1] - tr[1]) < eps &&
        Math.abs(bl[1] - br[1]) < eps &&
        Math.abs(tl[0] - bl[0]) < eps &&
        Math.abs(tr[0] - br[0]) < eps &&
        tr[0] > tl[0] &&
        bl[1] > tl[1]
    )
}

function drawPolygon(ctx: CanvasRenderingContext2D, points: Point2D[], scale: number) {
    if (typeof ctx.moveTo !== 'function' || typeof ctx.lineTo !== 'function' || typeof ctx.closePath !== 'function') return
    ctx.beginPath()
    points.forEach(([x, y], index) => {
        const px = x * scale
        const py = y * scale
        if (index === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
    })
    ctx.closePath()
}

function strokeSegment(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
    if (typeof ctx.moveTo !== 'function' || typeof ctx.lineTo !== 'function') return
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
}

/**
 * Draws a face cleanly onto the A4 canvas:
 * - Fast nearest-neighbor `drawImage` for standard axis-aligned rectangles.
 * - Exact cell-by-cell bilinear quad fills for tapered trapezoids & rotated Cute torso walls.
 */
function drawFaceArtwork(
    ctx: CanvasRenderingContext2D,
    face: OrigamiFaceSpec,
    faceCanvas: HTMLCanvasElement,
    s: number,
) {
    if (isAxisAlignedRectQuad(face.quad)) {
        const x = Math.round(face.rect.x * s)
        const y = Math.round(face.rect.y * s)
        const w = Math.round((face.rect.x + face.rect.width) * s) - x
        const h = Math.round((face.rect.y + face.rect.height) * s) - y
        ctx.drawImage(faceCanvas, 0, 0, faceCanvas.width, faceCanvas.height, x, y, w, h)
        return
    }

    const pixels = faceCanvas.getContext('2d')?.getImageData(0, 0, face.gridW, face.gridH).data
    if (!pixels) return
    ctx.save()
    ctx.lineWidth = 0.6
    ctx.lineJoin = 'miter'
    for (let dy = 0; dy < face.gridH; dy++) {
        const v0 = dy / face.gridH
        const v1 = (dy + 1) / face.gridH
        for (let dx = 0; dx < face.gridW; dx++) {
            const idx = (dy * face.gridW + dx) * 4
            const color = `rgb(${pixels[idx]},${pixels[idx + 1]},${pixels[idx + 2]})`
            const u0 = dx / face.gridW
            const u1 = (dx + 1) / face.gridW
            const cellQuad: Point2D[] = [
                evalQuad(face.quad, u0, v0),
                evalQuad(face.quad, u1, v0),
                evalQuad(face.quad, u1, v1),
                evalQuad(face.quad, u0, v1),
            ]
            ctx.fillStyle = color
            ctx.strokeStyle = color
            drawPolygon(ctx, cellQuad, s)
            ctx.fill()
            ctx.stroke()
        }
    }
    ctx.restore()
}

/**
 * Prints only the support index number over the untouched base skin voxel color
 * (choosing light or dark ink automatically by pixel luminance for legibility).
 */
function drawBaseSupportNumber(
    ctx: CanvasRenderingContext2D,
    anchor: SupportAnchor,
    face: OrigamiFaceSpec,
    faceCanvas: HTMLCanvasElement,
    s: number,
) {
    const faceData = faceCanvas.getContext('2d')?.getImageData(0, 0, faceCanvas.width, faceCanvas.height).data
    let lum = 200
    if (faceData) {
        const px = Math.min(faceCanvas.width - 1, Math.max(0, Math.floor(anchor.baseU * faceCanvas.width)))
        const py = Math.min(faceCanvas.height - 1, Math.max(0, Math.floor(anchor.baseV * faceCanvas.height)))
        const idx = (py * faceCanvas.width + px) * 4
        lum = 0.299 * faceData[idx] + 0.587 * faceData[idx + 1] + 0.114 * faceData[idx + 2]
    }
    const [cxMm, cyMm] = evalQuad(face.quad, anchor.baseU, anchor.baseV)
    ctx.save()
    const numPx = Math.max(7, Math.round(1.55 * s))
    ctx.font = `${numPx}px ${STICKER_FONT_FAMILY}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = lum < 135 ? '#ffffff' : '#0f172a'
    ctx.fillText(String(anchor.index), cxMm * s, cyMm * s)
    ctx.restore()
}

function drawAttributionInfo(
    ctx: CanvasRenderingContext2D,
    area: { x: number; y: number; width: number; height: number },
    info: StickerInfo,
    s: number,
    fontPx: (mm: number) => number,
) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(area.x * s, area.y * s, area.width * s, area.height * s)
    ctx.clip()
    ctx.fillStyle = '#25364a'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'

    const lines = [
        `${info.labels.publisher}: ${info.publisher}`,
        info.publisherId ? `${info.labels.userId}: ${info.publisherId}` : '',
        `${info.labels.source}: ${info.sourceId ? `#${info.sourceId}` : '—'}`,
        info.sourceUrl,
    ].filter(Boolean)

    const lineHeightMm = Math.min(5.2, area.height / Math.max(1, lines.length))
    ctx.font = `${fontPx(Math.min(2.4, lineHeightMm - 0.8))}px ${STICKER_FONT_FAMILY}`
    const maxW = area.width * s
    lines.forEach((line, index) => {
        const suffix = info.sourceUrl && info.sourceIsPublic === false && index === lines.length - 1 ? ' (private)' : ''
        const text = fitText(ctx, line, maxW - ctx.measureText(suffix).width) + suffix
        ctx.fillText(text, area.x * s, (area.y + index * lineHeightMm) * s)
    })
    ctx.restore()
}

export function renderOrigamiBasePage(
    page: OrigamiBasePage,
    layout: OrigamiLayout,
    faceCanvases: PartFaceCanvasMap,
    pxPerMm: number,
    info?: StickerInfo,
    sheetLabels: OrigamiSheetLabels = DEFAULT_SHEET_LABELS,
    options: { pageSuffix?: string; supportAnchors?: SupportAnchor[]; showGuideLines?: boolean } = {},
): HTMLCanvasElement {
    const showGuideLines = options.showGuideLines ?? true
    const width = Math.round(page.pageWidthMm * pxPerMm)
    const height = Math.round(page.pageHeightMm * pxPerMm)
    const canvas = createCanvas(width, height)
    const ctx = canvas.getContext('2d')!
    const s = pxPerMm

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)

    const fontPx = (mm: number) => Math.max(10, Math.round((mm * s) / 2) * 2)

    ctx.save()
    ctx.fillStyle = '#1e293b'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.font = `${fontPx(3.4)}px ${STICKER_FONT_FAMILY}`
    const suffix = options.pageSuffix ? ` · ${options.pageSuffix}` : ''
    const brandText = `${info?.brand || 'EntropyDrop'} · ${info?.modelName || layout.modelName}${layout.isSlim ? ' (Slim)' : ''}${suffix}`
    ctx.fillText(fitText(ctx, brandText, page.headerArea.width * s), page.headerArea.x * s, page.headerArea.y * s)

    ctx.font = `${fontPx(2.6)}px ${STICKER_FONT_FAMILY}`
    ctx.fillStyle = '#475569'
    if (info?.name) {
        ctx.fillText(fitText(ctx, info.name, page.headerArea.width * s), page.headerArea.x * s, (page.headerArea.y + 5.6) * s)
    }
    ctx.restore()

    const anchorsByFace = new Map<string, SupportAnchor[]>()
    if (options.supportAnchors) {
        for (const anchor of options.supportAnchors) {
            const key = `${anchor.partId}:${anchor.faceName}`
            const list = anchorsByFace.get(key)
            if (list) list.push(anchor)
            else anchorsByFace.set(key, [anchor])
        }
    }

    for (const part of page.parts) {
        ctx.save()
        ctx.fillStyle = '#eef2f6'
        for (const tab of part.tabs) {
            drawPolygon(ctx, tab.points, s)
            ctx.fill()
        }
        ctx.restore()

        ctx.save()
        ctx.imageSmoothingEnabled = false
        for (const face of part.faces) {
            const faceCanvas = faceCanvases[part.id][face.name]
            drawFaceArtwork(ctx, face, faceCanvas, s)

            const faceAnchors = anchorsByFace.get(`${part.id}:${face.name}`)
            if (faceAnchors) {
                for (const anchor of faceAnchors) {
                    drawBaseSupportNumber(ctx, anchor, face, faceCanvas, s)
                }
            }
        }
        ctx.restore()

        if (showGuideLines) {
            ctx.save()
            ctx.lineCap = 'butt'
            const dash = [1.4 * s, 1.1 * s]
            for (const pass of [
                { stroke: 'rgba(255,255,255,0.75)', width: Math.max(1, 0.42 * s), dashOffset: 0 },
                { stroke: '#334155', width: Math.max(1, 0.22 * s), dashOffset: 0 },
            ]) {
                ctx.strokeStyle = pass.stroke
                ctx.lineWidth = pass.width
                if (typeof ctx.setLineDash === 'function') {
                    ctx.setLineDash(dash)
                    ctx.lineDashOffset = pass.dashOffset
                }
                ctx.beginPath()
                if (typeof ctx.moveTo === 'function' && typeof ctx.lineTo === 'function') {
                    for (const line of part.foldLines) {
                        ctx.moveTo(line.from[0] * s, line.from[1] * s)
                        ctx.lineTo(line.to[0] * s, line.to[1] * s)
                    }
                }
                ctx.stroke()
            }
            ctx.restore()

            ctx.save()
            ctx.strokeStyle = '#0f172a'
            ctx.lineWidth = Math.max(1, 0.26 * s)
            ctx.lineJoin = 'miter'
            drawPolygon(ctx, part.cutPolygon, s)
            ctx.stroke()
            ctx.restore()
        }

        ctx.save()
        ctx.fillStyle = '#475569'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'bottom'
        ctx.font = `${fontPx(2.4)}px ${STICKER_FONT_FAMILY}`
        ctx.fillText(part.code, part.labelAnchor[0] * s, part.labelAnchor[1] * s)
        ctx.restore()
    }

    // Legend, 3 cm scale verification bar, and concise folding instructions
    ctx.save()
    const g = page.guideArea
    ctx.strokeStyle = '#cbd5e1'
    ctx.lineWidth = Math.max(1, 0.2 * s)
    ctx.strokeRect(g.x * s, g.y * s, g.width * s, g.height * s)

    const pad = 3.2
    const lx = g.x + pad
    let ly = g.y + 3.2
    const maxW = (g.width - pad * 2) * s

    const legendFont = fontPx(2.2)
    ctx.font = `${legendFont}px ${STICKER_FONT_FAMILY}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'

    ctx.strokeStyle = '#0f172a'
    ctx.lineWidth = Math.max(1, 0.3 * s)
    strokeSegment(ctx, lx * s, (ly + 1.4) * s, (lx + 7) * s, (ly + 1.4) * s)
    ctx.fillStyle = '#1e293b'
    ctx.fillText(sheetLabels.cutLine, (lx + 8.5) * s, (ly + 1.4) * s)

    const foldSwatchX = lx + Math.min(34, g.width * 0.32)
    ctx.save()
    ctx.strokeStyle = '#334155'
    ctx.lineWidth = Math.max(1, 0.26 * s)
    if (typeof ctx.setLineDash === 'function') ctx.setLineDash([1.4 * s, 1.1 * s])
    strokeSegment(ctx, foldSwatchX * s, (ly + 1.4) * s, (foldSwatchX + 7) * s, (ly + 1.4) * s)
    ctx.restore()
    ctx.fillText(sheetLabels.foldLine, (foldSwatchX + 8.5) * s, (ly + 1.4) * s)

    if (g.width >= 105) {
        const tabSwatchX = lx + Math.min(76, g.width * 0.66)
        ctx.fillStyle = '#eef2f6'
        ctx.fillRect(tabSwatchX * s, (ly + 0.1) * s, 6.0 * s, 2.6 * s)
        ctx.strokeStyle = '#0f172a'
        ctx.lineWidth = Math.max(1, 0.2 * s)
        ctx.strokeRect(tabSwatchX * s, (ly + 0.1) * s, 6.0 * s, 2.6 * s)
        ctx.fillStyle = '#1e293b'
        ctx.fillText(sheetLabels.glueTab, (tabSwatchX + 7.5) * s, (ly + 1.4) * s)
    }

    ly += 6.2
    const barW = 30
    const barH = 2.2
    for (let cm = 0; cm < 3; cm++) {
        ctx.fillStyle = cm % 2 === 0 ? '#1e293b' : '#ffffff'
        ctx.fillRect((lx + cm * 10) * s, ly * s, 10 * s, barH * s)
    }
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = Math.max(1, 0.2 * s)
    ctx.strokeRect(lx * s, ly * s, barW * s, barH * s)
    ctx.fillStyle = '#334155'
    ctx.fillText(fitText(ctx, sheetLabels.scaleLabel, Math.max(10, g.width - pad * 2 - barW - 3) * s), (lx + barW + 3) * s, (ly + barH / 2) * s)

    ly += 5.4
    ctx.textBaseline = 'top'
    ctx.fillStyle = '#475569'
    ctx.font = `${fontPx(2.1)}px ${STICKER_FONT_FAMILY}`
    for (const tip of [sheetLabels.tipCut, sheetLabels.tipFold, sheetLabels.tipGlue]) {
        ctx.fillText(fitText(ctx, tip, maxW), lx * s, ly * s)
        ly += 4.6
    }
    ctx.restore()

    if (info) {
        drawAttributionInfo(ctx, page.infoArea, info, s, fontPx)
    }

    return canvas
}

/** Backwards-compatible helper rendering Page 1 of `layout.basePages`. */
export function renderOrigamiSheet(
    layout: OrigamiLayout,
    faceCanvases: PartFaceCanvasMap,
    pxPerMm: number,
    info?: StickerInfo,
    sheetLabels: OrigamiSheetLabels = DEFAULT_SHEET_LABELS,
    options: { pageSuffix?: string; supportAnchors?: SupportAnchor[]; showGuideLines?: boolean } = {},
): HTMLCanvasElement {
    return renderOrigamiBasePage(layout.basePages[0], layout, faceCanvases, pxPerMm, info, sheetLabels, options)
}

export function renderDualLayerOverlaySheet(
    page: DualLayerOverlayPage,
    totalPages: number,
    layout: OrigamiLayout,
    skinData: Uint8ClampedArray,
    pxPerMm: number,
    info?: StickerInfo,
    sheetLabels: OrigamiSheetLabels = DEFAULT_SHEET_LABELS,
    options: { showGuideLines?: boolean } = {},
): HTMLCanvasElement {
    const showGuideLines = options.showGuideLines ?? true
    const width = Math.round(page.pageWidthMm * pxPerMm)
    const height = Math.round(page.pageHeightMm * pxPerMm)
    const canvas = createCanvas(width, height)
    const ctx = canvas.getContext('2d')!
    const s = pxPerMm

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)

    const fontPx = (mm: number) => Math.max(10, Math.round((mm * s) / 2) * 2)

    ctx.save()
    ctx.fillStyle = '#1e293b'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.font = `${fontPx(3.4)}px ${STICKER_FONT_FAMILY}`
    const overlayTitle = sheetLabels.dualOverlayTitle || DEFAULT_SHEET_LABELS.dualOverlayTitle!
    const brandText = `${info?.brand || 'EntropyDrop'} · ${info?.modelName || layout.modelName} · P${page.pageNumber}/${totalPages}`
    ctx.fillText(fitText(ctx, brandText, page.headerArea.width * s), page.headerArea.x * s, page.headerArea.y * s)

    ctx.font = `${fontPx(2.5)}px ${STICKER_FONT_FAMILY}`
    ctx.fillStyle = '#475569'
    const subtitle = info?.name ? `${info.name} · ${overlayTitle}` : overlayTitle
    ctx.fillText(fitText(ctx, subtitle, page.headerArea.width * s), page.headerArea.x * s, (page.headerArea.y + 5.6) * s)
    ctx.restore()

    if (page.islands.length === 0 && page.supports.length === 0) {
        ctx.save()
        ctx.fillStyle = '#64748b'
        ctx.font = `${fontPx(3.0)}px ${STICKER_FONT_FAMILY}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(
            fitText(ctx, sheetLabels.dualEmptyOverlay || DEFAULT_SHEET_LABELS.dualEmptyOverlay!, 170 * s),
            (page.pageWidthMm / 2) * s,
            (page.pageHeightMm / 2 - 20) * s,
        )
        ctx.restore()
    }

    const faceUvByKey = new Map<string, FaceUvRect>()
    for (const part of layout.parts) {
        for (const face of part.faces) {
            faceUvByKey.set(`${part.id}:${face.name}`, face.overlayUv)
        }
    }

    // 1. Render each connected outer-layer island pixel-by-pixel (rectangular or tapered trapezoid)
    for (const placed of page.islands) {
        const { island } = placed
        const uv = faceUvByKey.get(`${island.partId}:${island.faceName}`)
        if (uv) {
            ctx.save()
            const minYMm = island.bbox.minY * island.cellHeightMm
            for (const [vx, vy] of island.pixels) {
                const [r, g, b] = readOrientedSkinPixel(skinData, uv, vx, vy, island.faceHeightPx)
                const color = `rgb(${r},${g},${b})`
                ctx.fillStyle = color
                if (!island.taperTopFactor) {
                    const lx = placed.x + (vx - island.bbox.minX) * island.cellWidthMm
                    const ly = placed.y + (vy - island.bbox.minY) * island.cellHeightMm
                    const rx0 = Math.round(lx * s)
                    const ry0 = Math.round(ly * s)
                    const rx1 = Math.round((lx + island.cellWidthMm) * s)
                    const ry1 = Math.round((ly + island.cellHeightMm) * s)
                    ctx.fillRect(rx0, ry0, Math.max(1, rx1 - rx0), Math.max(1, ry1 - ry0))
                } else {
                    const mapPt = (gx: number, gy: number): Point2D => {
                        const [mx, my] = mapFaceGridPointMm(
                            gx,
                            gy,
                            island.faceWidthPx,
                            island.faceHeightPx,
                            island.cellWidthMm,
                            island.cellHeightMm,
                            island.taperTopFactor,
                        )
                        return [placed.x + (mx - placed.localOffsetXMm), placed.y + (my - minYMm)]
                    }
                    const poly: Point2D[] = [mapPt(vx, vy), mapPt(vx + 1, vy), mapPt(vx + 1, vy + 1), mapPt(vx, vy + 1)]
                    ctx.strokeStyle = color
                    ctx.lineWidth = 0.5
                    drawPolygon(ctx, poly, s)
                    ctx.fill()
                    ctx.stroke()
                }
            }
            ctx.restore()
        }

        if (showGuideLines) {
            ctx.save()
            ctx.strokeStyle = '#0f172a'
            ctx.lineWidth = Math.max(1, 0.24 * s)
            ctx.lineJoin = 'miter'
            for (const loop of placed.cutLoopsMm) {
                drawPolygon(ctx, loop, s)
                ctx.stroke()
            }
            ctx.restore()
        }

        ctx.save()
        ctx.fillStyle = '#475569'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        ctx.font = `${Math.max(8, Math.round(1.9 * s))}px ${STICKER_FONT_FAMILY}`
        const supportRefs = island.supports.map(a => `#${a.index}`).join(',')
        const caption = `${island.id} (${supportRefs})`
        ctx.fillText(fitText(ctx, caption, Math.max(placed.widthMm + 6, 16) * s), placed.x * s, (placed.y + placed.heightMm + 0.7) * s)
        ctx.restore()
    }

    // 2. Render each numbered 1-piece self-gluing L-corner column
    for (const placed of page.supports) {
        const [r, g, b] = placed.anchor.color
        for (const piece of placed.pieces) {
            ctx.save()
            ctx.fillStyle = '#eef2f6'
            for (const poly of piece.glueTabPolygons) {
                drawPolygon(ctx, poly, s)
                ctx.fill()
            }
            ctx.fillStyle = `rgb(${r},${g},${b})`
            ctx.fillRect(piece.wallRect.x * s, piece.wallRect.y * s, piece.wallRect.width * s, piece.wallRect.height * s)
            ctx.restore()

            if (showGuideLines) {
                for (const line of piece.foldLines) {
                    ctx.save()
                    ctx.strokeStyle = '#1d4ed8'
                    ctx.lineWidth = Math.max(1, 0.22 * s)
                    if (typeof ctx.setLineDash === 'function') {
                        ctx.setLineDash([1.0 * s, 0.8 * s])
                    }
                    strokeSegment(ctx, line.from[0] * s, line.from[1] * s, line.to[0] * s, line.to[1] * s)
                    ctx.restore()
                }

                ctx.save()
                ctx.strokeStyle = '#0f172a'
                ctx.lineWidth = Math.max(1, 0.22 * s)
                ctx.lineJoin = 'miter'
                drawPolygon(ctx, piece.cutPolygon, s)
                ctx.stroke()
                ctx.restore()
            }
        }

        ctx.save()
        ctx.fillStyle = '#047857'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'bottom'
        ctx.font = `${Math.max(8, Math.round(1.9 * s))}px ${STICKER_FONT_FAMILY}`
        ctx.fillText(`#${placed.anchor.index} L`, placed.labelPos[0] * s, placed.labelPos[1] * s)
        ctx.restore()
    }

    if (page.legendArea) {
        const g = page.legendArea
        ctx.save()
        ctx.strokeStyle = '#cbd5e1'
        ctx.lineWidth = Math.max(1, 0.2 * s)
        ctx.strokeRect(g.x * s, g.y * s, g.width * s, g.height * s)

        const pad = 3
        const lx = g.x + pad
        let ly = g.y + 3
        const maxW = (g.width - pad * 2) * s

        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        ctx.font = `${fontPx(2.2)}px ${STICKER_FONT_FAMILY}`
        ctx.fillStyle = '#047857'
        ctx.fillText(fitText(ctx, sheetLabels.dualLshapeLegend || DEFAULT_SHEET_LABELS.dualLshapeLegend!, maxW), lx * s, ly * s)
        ly += 5.4

        const barW = 30
        const barH = 2.0
        for (let cm = 0; cm < 3; cm++) {
            ctx.fillStyle = cm % 2 === 0 ? '#1e293b' : '#ffffff'
            ctx.fillRect((lx + cm * 10) * s, ly * s, 10 * s, barH * s)
        }
        ctx.strokeStyle = '#1e293b'
        ctx.lineWidth = Math.max(1, 0.2 * s)
        ctx.strokeRect(lx * s, ly * s, barW * s, barH * s)
        ctx.fillStyle = '#334155'
        ctx.textBaseline = 'middle'
        ctx.fillText(sheetLabels.scaleLabel, (lx + barW + 2.5) * s, (ly + barH / 2) * s)

        ly += 5.2
        ctx.textBaseline = 'top'
        ctx.fillStyle = '#475569'
        ctx.font = `${fontPx(2.0)}px ${STICKER_FONT_FAMILY}`
        ctx.fillText(fitText(ctx, sheetLabels.dualTip || DEFAULT_SHEET_LABELS.dualTip!, maxW), lx * s, ly * s)
        ctx.restore()
    }

    if (page.infoArea && info) {
        drawAttributionInfo(ctx, page.infoArea, info, s, fontPx)
    }

    return canvas
}

async function canvasToBlobUrl(canvas: HTMLCanvasElement): Promise<string> {
    const blob = await new Promise<Blob>((resolve, reject) => {
        if (typeof canvas.toBlob === 'function') {
            canvas.toBlob(value => (value ? resolve(value) : reject(new Error('PNG encode failed'))), 'image/png')
        } else {
            resolve(new Blob(['mock'], { type: 'image/png' }))
        }
    })
    return URL.createObjectURL(blob)
}

export async function generateOrigami(
    source: HTMLImageElement | HTMLCanvasElement,
    signal: AbortSignal,
    onProgress: (percent: number) => void,
    info?: StickerInfo,
    options: GenerateOrigamiOptions = {},
): Promise<OrigamiOutput> {
    signal.throwIfAborted()
    const modelId = options.modelId ?? DEFAULT_ORIGAMI_MODEL
    const layerMode = options.layerMode ?? DEFAULT_ORIGAMI_LAYER
    const isDual = layerMode === 'dual'
    const includeOverlay = isDual ? false : (options.includeOverlay ?? true)
    const showGuideLines = options.showGuideLines ?? true
    const sheetLabels = options.sheetLabels ?? DEFAULT_SHEET_LABELS
    const report = (percent: number) => {
        if (!signal.aborted) onProgress(percent)
    }

    report(10)
    const skin = processSkin(source, 0.5)
    const skinData = new Uint8ClampedArray(skin.data)
    skin.canvas.width = skin.canvas.height = 1
    signal.throwIfAborted()

    report(25)
    const layout = buildOrigamiLayout(skin.isSlim, modelId)
    const faceCanvases = extractPartFaceCanvases(skinData, layout, includeOverlay)
    const overlayFaceCanvases = isDual ? extractOverlayFaceCanvases(skinData, layout) : undefined
    const dualPlan = isDual ? buildDualLayerPlan(layout, skinData) : undefined
    signal.throwIfAborted()

    const layerTag = layerMode.toUpperCase()
    const modelLabel = `${layout.modelName} · ${layerTag}`
    const resolvedInfo = info ? { ...info, modelName: info.modelName || modelLabel } : undefined
    await loadStickerFont(resolvedInfo)
    signal.throwIfAborted()

    const totalPages = layout.basePages.length + (isDual && dualPlan ? dualPlan.overlayPages.length : 0)
    const sheets: OrigamiSheetOutput[] = []

    report(50)
    for (const basePage of layout.basePages) {
        const pageCanvas = renderOrigamiBasePage(basePage, layout, faceCanvases, PREVIEW_PX_PER_MM, resolvedInfo, sheetLabels, {
            pageSuffix: totalPages > 1 ? `P${basePage.pageNumber}/${totalPages}` : undefined,
            supportAnchors: dualPlan?.supports,
            showGuideLines,
        })
        const previewUrl = await canvasToBlobUrl(pageCanvas)
        pageCanvas.width = pageCanvas.height = 1
        signal.throwIfAborted()

        const svgUrl = URL.createObjectURL(
            new Blob([generateOrigamiBasePageSvg(basePage)], { type: 'image/svg+xml;charset=utf-8' }),
        )
        const roleTag = basePage.role === 'headTorso' ? 'head_torso' : basePage.role === 'limbs' ? 'limbs' : 'base'
        const suffix = totalPages > 1 ? `${layerTag}_P${basePage.pageNumber}_${roleTag}` : `${layerTag}_origami`
        sheets.push({
            pageNumber: basePage.pageNumber,
            kind: 'base',
            baseRole: basePage.role,
            filenameSuffix: suffix,
            previewSheetUrl: previewUrl,
            sheetUrl: previewUrl,
            svgUrl,
            isPreviewSheet: true,
        })
    }

    if (isDual && dualPlan) {
        report(78)
        for (const overlayPage of dualPlan.overlayPages) {
            const ovCanvas = renderDualLayerOverlaySheet(
                overlayPage,
                totalPages,
                layout,
                skinData,
                PREVIEW_PX_PER_MM,
                resolvedInfo,
                sheetLabels,
                { showGuideLines },
            )
            const ovPreviewUrl = await canvasToBlobUrl(ovCanvas)
            ovCanvas.width = ovCanvas.height = 1
            signal.throwIfAborted()

            const ovSvgUrl = URL.createObjectURL(
                new Blob([generateOverlayPageSvg(overlayPage)], { type: 'image/svg+xml;charset=utf-8' }),
            )
            sheets.push({
                pageNumber: overlayPage.pageNumber,
                kind: 'overlay',
                filenameSuffix: `${layerTag}_P${overlayPage.pageNumber}_overlay_supports`,
                previewSheetUrl: ovPreviewUrl,
                sheetUrl: ovPreviewUrl,
                svgUrl: ovSvgUrl,
                isPreviewSheet: true,
            })
        }
    }

    report(100)
    return {
        modelId,
        layerMode,
        isSlim: layout.isSlim,
        includeOverlay,
        showGuideLines,
        layout,
        faceCanvases,
        overlayFaceCanvases,
        dualPlan,
        sheets,
        skinData: isDual ? skinData : undefined,
        previewSheetUrl: sheets[0].previewSheetUrl,
        sheetUrl: sheets[0].sheetUrl,
        svgUrl: sheets[0].svgUrl,
        isPreviewSheet: true,
        info: resolvedInfo,
        sheetLabels,
    }
}

export async function generateFullOrigamiAssets(
    output: OrigamiOutput,
    signal: AbortSignal,
    onProgress: (percent: number) => void,
    pageIndex = 0,
): Promise<{ sheetUrl: string; svgUrl: string }> {
    signal.throwIfAborted()
    const targetSheet = output.sheets[pageIndex] ?? output.sheets[0]
    if (targetSheet.fullSheetUrl) {
        onProgress(100)
        return { sheetUrl: targetSheet.fullSheetUrl, svgUrl: targetSheet.svgUrl }
    }
    const report = (percent: number) => {
        if (!signal.aborted) onProgress(percent)
    }
    report(20)
    await loadStickerFont(output.info)
    signal.throwIfAborted()
    report(55)

    const baseCount = output.layout.basePages.length
    let fullCanvas: HTMLCanvasElement
    if (targetSheet.kind === 'overlay' && output.dualPlan && output.skinData) {
        const overlayPage = output.dualPlan.overlayPages[pageIndex - baseCount]
        fullCanvas = renderDualLayerOverlaySheet(
            overlayPage,
            output.sheets.length,
            output.layout,
            output.skinData,
            FULL_PX_PER_MM,
            output.info,
            output.sheetLabels,
            { showGuideLines: output.showGuideLines },
        )
    } else {
        const basePage = output.layout.basePages[pageIndex] ?? output.layout.basePages[0]
        fullCanvas = renderOrigamiBasePage(basePage, output.layout, output.faceCanvases, FULL_PX_PER_MM, output.info, output.sheetLabels, {
            pageSuffix: output.sheets.length > 1 ? `P${basePage.pageNumber}/${output.sheets.length}` : undefined,
            supportAnchors: output.dualPlan?.supports,
            showGuideLines: output.showGuideLines,
        })
    }

    signal.throwIfAborted()
    const fullSheetUrl = await canvasToBlobUrl(fullCanvas)
    fullCanvas.width = fullCanvas.height = 1
    if (signal.aborted) {
        URL.revokeObjectURL(fullSheetUrl)
        signal.throwIfAborted()
    }
    targetSheet.fullSheetUrl = fullSheetUrl
    targetSheet.sheetUrl = fullSheetUrl
    targetSheet.isPreviewSheet = false
    if (pageIndex === 0) {
        output.fullSheetUrl = fullSheetUrl
        output.sheetUrl = fullSheetUrl
        output.isPreviewSheet = false
    }
    report(100)
    return { sheetUrl: fullSheetUrl, svgUrl: targetSheet.svgUrl }
}

export function disposeOrigami(output: OrigamiOutput) {
    const urls = new Set<string>()
    for (const url of [output.previewSheetUrl, output.sheetUrl, output.fullSheetUrl, output.svgUrl]) {
        if (url) urls.add(url)
    }
    for (const sheet of output.sheets) {
        for (const url of [sheet.previewSheetUrl, sheet.sheetUrl, sheet.fullSheetUrl, sheet.svgUrl]) {
            if (url) urls.add(url)
        }
    }
    for (const url of urls) URL.revokeObjectURL(url)
    for (const map of [output.faceCanvases, output.overlayFaceCanvases]) {
        if (!map) continue
        for (const faces of Object.values(map)) {
            for (const canvas of Object.values(faces)) {
                if (canvas) canvas.width = canvas.height = 1
            }
        }
    }
}
