import { CUTE_HEIGHT, CUTE_SCALE, CUTE_TAPER } from '../../../lib/minefigure/shared/characterProportions.js'
import {
    DEFAULT_ORIGAMI_MODEL,
    getOrigamiModelProfile,
    type OrigamiModelId,
    type OrigamiShape,
} from './origamiModels'

export type OrigamiPartId = 'head' | 'torso' | 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg'
export type OrigamiFaceName = 'top' | 'bottom' | 'right' | 'front' | 'left' | 'back'

export const ORIGAMI_PARTS: readonly OrigamiPartId[] = [
    'head',
    'torso',
    'rightArm',
    'leftArm',
    'rightLeg',
    'leftLeg',
] as const

export const A4_WIDTH_MM = 210
export const A4_HEIGHT_MM = 297
export const PAGE_MARGIN_X_MM = 10
export const CUT_SAFE_TOP_MM = 22.1
export const CUT_SAFE_BOTTOM_MM = 274.9

export type Point2D = [number, number]

export interface RectMm {
    x: number
    y: number
    width: number
    height: number
}

export interface FaceUvRect {
    u: number
    v: number
    w: number
    h: number
    flipH?: boolean
    flipV?: boolean
    /** When true, vertical 12-px limb/torso textures are resampled to 8 Cute rows via `cuteSourceRow`. */
    cuteRows?: boolean
}

export interface OrigamiFaceSpec {
    name: OrigamiFaceName
    baseUv: FaceUvRect
    overlayUv: FaceUvRect
    /** Logical pixel grid resolution of this face (e.g. 8x8 for Cute torso front, 8x12 for Std torso front). */
    gridW: number
    gridH: number
    /** Axis-aligned bounding rect on the A4 sheet in millimetres. */
    rect: RectMm
    /**
     * Exact 4 corners on the A4 sheet in millimetres: [topLeft, topRight, bottomRight, bottomLeft]
     * in the face's logical UV space (where topLeft = (0,0), topRight = (gridW,0), bottomRight = (gridW,gridH), bottomLeft = (0,gridH)).
     * Supports axis-aligned rectangles, rotated Cute torso side walls, and tapered Cute torso trapezoids.
     */
    quad: [Point2D, Point2D, Point2D, Point2D]
    /** Physical width of one grid cell in mm (at the widest row for tapered faces). */
    cellWidthMm: number
    /** Physical height of one grid cell in mm. */
    cellHeightMm: number
    /** Linear top-width taper factor (0 for rectangles; CUTE_TAPER = 0.3 for Cute torso front/back). */
    taperTopFactor: number
}

export interface OrigamiTab {
    id: string
    points: Point2D[]
}

export interface OrigamiFoldLine {
    from: Point2D
    to: Point2D
    kind: 'body' | 'tab'
}

export interface OrigamiPartNet {
    id: OrigamiPartId
    code: string
    /** 0-based base A4 page index where this part is placed (0 for Std; 0 or 1 for Cute). */
    pageIndex: number
    /** Logical pixel grid dimensions [w, h, d] (e.g. [8,8,4] on Cute torso, [8,12,4] on Std torso). */
    sizePx: [number, number, number]
    /** Physical 3D box dimensions in millimetres [widthBottom, heightVertical, depth]. */
    sizeMm: [number, number, number]
    /** Linear top-width taper (0 for cuboids, CUTE_TAPER = 0.3 for Cute torso). */
    taper: number
    /** Bounding box of the unfolded net (including glue tabs) on its A4 page in mm. */
    bounds: RectMm
    faces: OrigamiFaceSpec[]
    tabs: OrigamiTab[]
    /** Single continuous closed perimeter cut path in A4 mm coordinates. */
    cutPolygon: Point2D[]
    /** All 12 mountain-fold lines (5 body hinges + 7 glue-tab hinges) in A4 mm coordinates. */
    foldLines: OrigamiFoldLine[]
    /** Open corner area inside the net's bounding box for printing the part title. */
    labelAnchor: Point2D
}

export interface OrigamiBasePage {
    pageNumber: number
    role: 'all' | 'headTorso' | 'limbs'
    pageWidthMm: number
    pageHeightMm: number
    parts: OrigamiPartNet[]
    headerArea: RectMm
    guideArea: RectMm
    infoArea: RectMm
}

export interface OrigamiLayout {
    modelId: OrigamiModelId
    modelName: string
    shape: OrigamiShape
    heightCm: number
    mmPerPixel: number
    tabMm: number
    isSlim: boolean
    pageWidthMm: number
    pageHeightMm: number
    parts: OrigamiPartNet[]
    basePages: OrigamiBasePage[]
    /** Backwards-compatible aliases pointing to Page 1 areas. */
    headerArea: RectMm
    guideArea: RectMm
    infoArea: RectMm
}

interface RawPartDef {
    id: OrigamiPartId
    code: string
    gridPx: [number, number, number]
    sizeMm: [number, number, number]
    taper: number
    decorOffset: [number, number]
    uvs: Record<OrigamiFaceName, FaceUvRect>
}

function getRawPartDefs(isSlim: boolean, shape: OrigamiShape, mmPerPixel: number): RawPartDef[] {
    const armW = isSlim ? 3 : 4
    const isCute = shape === 'cute'
    const bodyGridH = isCute ? CUTE_HEIGHT : 12
    const limbScaleXY = isCute ? CUTE_SCALE : 1

    const faceUv = (u: number, v: number, w: number, h: number, opts: { flipV?: boolean; cuteRows?: boolean } = {}): FaceUvRect => ({
        u,
        v,
        w,
        h,
        ...(opts.flipV ? { flipV: true } : {}),
        ...(opts.cuteRows ? { cuteRows: true } : {}),
    })

    return [
        {
            id: 'head',
            code: 'HEAD',
            gridPx: [8, 8, 8],
            sizeMm: [8 * mmPerPixel, 8 * mmPerPixel, 8 * mmPerPixel],
            taper: 0,
            decorOffset: [32, 0],
            uvs: {
                right: faceUv(0, 8, 8, 8),
                front: faceUv(8, 8, 8, 8),
                left: faceUv(16, 8, 8, 8),
                back: faceUv(24, 8, 8, 8),
                top: faceUv(8, 0, 8, 8),
                bottom: faceUv(16, 0, 8, 8, { flipV: true }),
            },
        },
        {
            id: 'torso',
            code: 'TORSO',
            gridPx: [8, bodyGridH, 4],
            sizeMm: [8 * limbScaleXY * mmPerPixel, bodyGridH * limbScaleXY * mmPerPixel, 4 * mmPerPixel],
            taper: isCute ? CUTE_TAPER : 0,
            decorOffset: [0, 16],
            uvs: {
                right: faceUv(16, 20, 4, 12, { cuteRows: isCute }),
                front: faceUv(20, 20, 8, 12, { cuteRows: isCute }),
                left: faceUv(28, 20, 4, 12, { cuteRows: isCute }),
                back: faceUv(32, 20, 8, 12, { cuteRows: isCute }),
                top: faceUv(20, 16, 8, 4),
                bottom: faceUv(28, 16, 8, 4, { flipV: true }),
            },
        },
        {
            id: 'rightArm',
            code: 'RIGHT ARM',
            gridPx: [armW, bodyGridH, 4],
            sizeMm: [armW * limbScaleXY * mmPerPixel, bodyGridH * limbScaleXY * mmPerPixel, 4 * mmPerPixel],
            taper: 0,
            decorOffset: [0, 16],
            uvs: {
                right: faceUv(40, 20, 4, 12, { cuteRows: isCute }),
                front: faceUv(44, 20, armW, 12, { cuteRows: isCute }),
                left: faceUv(44 + armW, 20, 4, 12, { cuteRows: isCute }),
                back: faceUv(48 + armW, 20, armW, 12, { cuteRows: isCute }),
                top: faceUv(44, 16, armW, 4),
                bottom: faceUv(44 + armW, 16, armW, 4, { flipV: true }),
            },
        },
        {
            id: 'leftArm',
            code: 'LEFT ARM',
            gridPx: [armW, bodyGridH, 4],
            sizeMm: [armW * limbScaleXY * mmPerPixel, bodyGridH * limbScaleXY * mmPerPixel, 4 * mmPerPixel],
            taper: 0,
            decorOffset: [16, 0],
            uvs: {
                right: faceUv(32, 52, 4, 12, { cuteRows: isCute }),
                front: faceUv(36, 52, armW, 12, { cuteRows: isCute }),
                left: faceUv(36 + armW, 52, 4, 12, { cuteRows: isCute }),
                back: faceUv(40 + armW, 52, armW, 12, { cuteRows: isCute }),
                top: faceUv(36, 48, armW, 4),
                bottom: faceUv(36 + armW, 48, armW, 4, { flipV: true }),
            },
        },
        {
            id: 'rightLeg',
            code: 'RIGHT LEG',
            gridPx: [4, bodyGridH, 4],
            sizeMm: [4 * limbScaleXY * mmPerPixel, bodyGridH * limbScaleXY * mmPerPixel, 4 * mmPerPixel],
            taper: 0,
            decorOffset: [0, 16],
            uvs: {
                right: faceUv(0, 20, 4, 12, { cuteRows: isCute }),
                front: faceUv(4, 20, 4, 12, { cuteRows: isCute }),
                left: faceUv(8, 20, 4, 12, { cuteRows: isCute }),
                back: faceUv(12, 20, 4, 12, { cuteRows: isCute }),
                top: faceUv(4, 16, 4, 4),
                bottom: faceUv(8, 16, 4, 4, { flipV: true }),
            },
        },
        {
            id: 'leftLeg',
            code: 'LEFT LEG',
            gridPx: [4, bodyGridH, 4],
            sizeMm: [4 * limbScaleXY * mmPerPixel, bodyGridH * limbScaleXY * mmPerPixel, 4 * mmPerPixel],
            taper: 0,
            decorOffset: [-16, 0],
            uvs: {
                right: faceUv(16, 52, 4, 12, { cuteRows: isCute }),
                front: faceUv(20, 52, 4, 12, { cuteRows: isCute }),
                left: faceUv(24, 52, 4, 12, { cuteRows: isCute }),
                back: faceUv(28, 52, 4, 12, { cuteRows: isCute }),
                top: faceUv(20, 48, 4, 4),
                bottom: faceUv(24, 48, 4, 4, { flipV: true }),
            },
        },
    ]
}

function quadBounds(points: Point2D[]): RectMm {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const [x, y] of points) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/** Builds a standard rectangular cross-net (for all cuboids: Head, Std Torso, Arms, Legs). */
function buildCuboidNet(def: RawPartDef, originX: number, originY: number, tabMm: number, pageIndex: number): OrigamiPartNet {
    const [W, H, D] = def.sizeMm
    const [gW, gH, gD] = def.gridPx
    const t = tabMm

    const bW = Math.min(t * 0.75, W * 0.22)
    const bD = Math.min(t * 0.75, D * 0.22)
    const bH = Math.min(t * 0.75, H * 0.22)

    const x0 = originX
    const x1 = originX + D
    const x2 = originX + D + W
    const x3 = originX + 2 * D + W
    const x4 = originX + 2 * D + 2 * W
    const x5 = x4 + t

    const y0 = originY + t
    const y1 = originY + t + D
    const y2 = originY + t + D + H
    const y3 = originY + t + 2 * D + H
    const y4 = originY + 2 * t + 2 * D + H

    const [du, dv] = def.decorOffset
    const makeRectFace = (name: OrigamiFaceName, rect: RectMm, gridW: number, gridH: number): OrigamiFaceSpec => {
        const baseUv = def.uvs[name]
        const quad: [Point2D, Point2D, Point2D, Point2D] = [
            [rect.x, rect.y],
            [rect.x + rect.width, rect.y],
            [rect.x + rect.width, rect.y + rect.height],
            [rect.x, rect.y + rect.height],
        ]
        return {
            name,
            baseUv,
            overlayUv: { ...baseUv, u: baseUv.u + du, v: baseUv.v + dv },
            gridW,
            gridH,
            rect,
            quad,
            cellWidthMm: rect.width / gridW,
            cellHeightMm: rect.height / gridH,
            taperTopFactor: 0,
        }
    }

    const faces: OrigamiFaceSpec[] = [
        makeRectFace('top', { x: x1, y: y0, width: W, height: D }, gW, gD),
        makeRectFace('right', { x: x0, y: y1, width: D, height: H }, gD, gH),
        makeRectFace('front', { x: x1, y: y1, width: W, height: H }, gW, gH),
        makeRectFace('left', { x: x2, y: y1, width: D, height: H }, gD, gH),
        makeRectFace('back', { x: x3, y: y1, width: W, height: H }, gW, gH),
        makeRectFace('bottom', { x: x1, y: y2, width: W, height: D }, gW, gD),
    ]

    const tabs: OrigamiTab[] = [
        { id: 'topLeft', points: [[x1, y1], [x1 - t, y1 - bD], [x1 - t, y0 + bD], [x1, y0]] },
        { id: 'topTop', points: [[x1, y0], [x1 + bW, originY], [x2 - bW, originY], [x2, y0]] },
        { id: 'topRight', points: [[x2, y0], [x2 + t, y0 + bD], [x2 + t, y1 - bD], [x2, y1]] },
        { id: 'backRight', points: [[x4, y1], [x5, y1 + bH], [x5, y2 - bH], [x4, y2]] },
        { id: 'bottomRight', points: [[x2, y2], [x2 + t, y2 + bD], [x2 + t, y3 - bD], [x2, y3]] },
        { id: 'bottomBottom', points: [[x2, y3], [x2 - bW, y4], [x1 + bW, y4], [x1, y3]] },
        { id: 'bottomLeft', points: [[x1, y3], [x1 - t, y3 - bD], [x1 - t, y2 + bD], [x1, y2]] },
    ]

    const cutPolygon: Point2D[] = [
        [x0, y1], [x1, y1], [x1 - t, y1 - bD], [x1 - t, y0 + bD], [x1, y0],
        [x1 + bW, originY], [x2 - bW, originY], [x2, y0], [x2 + t, y0 + bD], [x2 + t, y1 - bD],
        [x2, y1], [x4, y1], [x5, y1 + bH], [x5, y2 - bH], [x4, y2],
        [x2, y2], [x2 + t, y2 + bD], [x2 + t, y3 - bD], [x2, y3], [x2 - bW, y4],
        [x1 + bW, y4], [x1, y3], [x1 - t, y3 - bD], [x1 - t, y2 + bD], [x1, y2], [x0, y2],
    ]

    const foldLines: OrigamiFoldLine[] = [
        { from: [x1, y1], to: [x1, y2], kind: 'body' },
        { from: [x2, y1], to: [x2, y2], kind: 'body' },
        { from: [x3, y1], to: [x3, y2], kind: 'body' },
        { from: [x1, y1], to: [x2, y1], kind: 'body' },
        { from: [x1, y2], to: [x2, y2], kind: 'body' },
        { from: [x1, y0], to: [x1, y1], kind: 'tab' },
        { from: [x1, y0], to: [x2, y0], kind: 'tab' },
        { from: [x2, y0], to: [x2, y1], kind: 'tab' },
        { from: [x4, y1], to: [x4, y2], kind: 'tab' },
        { from: [x2, y2], to: [x2, y3], kind: 'tab' },
        { from: [x1, y3], to: [x2, y3], kind: 'tab' },
        { from: [x1, y2], to: [x1, y3], kind: 'tab' },
    ]

    return {
        id: def.id,
        code: def.code,
        pageIndex,
        sizePx: def.gridPx,
        sizeMm: def.sizeMm,
        taper: 0,
        bounds: { x: originX, y: originY, width: x5 - x0, height: y4 - originY },
        faces,
        tabs,
        cutPolygon,
        foldLines,
        labelAnchor: [x2 + t + 2.5, y1 - 3.5],
    }
}

/**
 * Builds the exact tapered frustum net for the Cute Torso:
 * Vertical spine: [Back (rotated 180°)] - [Top] - [Front] - [Bottom (+tab)]
 * Slanted side walls: [Right] hinged to Front's left edge, [Left] hinged to Front's right edge.
 * All 7 open seams carry 1 beveled trapezoidal glue tab with zero overlap.
 */
function buildCuteTaperedTorsoNet(def: RawPartDef, originX: number, originY: number, tabMm: number, pageIndex: number): OrigamiPartNet {
    const [Wbot, Hvert, D] = def.sizeMm
    const [gW, gH, gD] = def.gridPx
    const Wtop = Wbot * (1 - def.taper)
    const dx = (Wbot - Wtop) / 2
    const Hside = Math.hypot(Hvert, dx)
    const cosA = Hvert / Hside
    const sinA = dx / Hside
    const t = tabMm

    const bD = Math.min(t * 0.75, D * 0.22)
    const bH = Math.min(t * 0.75, Hside * 0.22)
    const bW = Math.min(t * 0.75, Wbot * 0.22)

    // Leftmost point is the bottom-left outer tip of Right's outer glue tab:
    // B.x - (D + t) * cosA + bH * sinA ... bound safely with halfSpan = Wbot/2 + (D + t) * cosA
    const halfSpan = Wbot / 2 + (D + t) * cosA
    const cx = originX + halfSpan

    const yBackTop = originY // bottom edge of Back in 3D (wide Wbot)
    const yTopTop = yBackTop + Hvert // hinge Back <-> Top (narrow Wtop)
    const yFrontTop = yTopTop + D // hinge Top <-> Front (narrow Wtop)
    const yFrontBot = yFrontTop + Hvert // hinge Front <-> Bottom (wide Wbot)
    const yBotBot = yFrontBot + D
    const yBotTab = yBotBot + t

    const add = (p: Point2D, vx: number, vy: number): Point2D => [p[0] + vx, p[1] + vy]
    const lerpPt = (a: Point2D, b: Point2D, f: number): Point2D => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]

    // Key spine vertices
    const bTL: Point2D = [cx - Wbot / 2, yBackTop]
    const bTR: Point2D = [cx + Wbot / 2, yBackTop]
    const tTL: Point2D = [cx - Wtop / 2, yTopTop]
    const tTR: Point2D = [cx + Wtop / 2, yTopTop]
    const fTL: Point2D = [cx - Wtop / 2, yFrontTop]
    const fTR: Point2D = [cx + Wtop / 2, yFrontTop]
    const fBL: Point2D = [cx - Wbot / 2, yFrontBot]
    const fBR: Point2D = [cx + Wbot / 2, yFrontBot]
    const boBL: Point2D = [cx - Wbot / 2, yBotBot]
    const boBR: Point2D = [cx + Wbot / 2, yBotBot]

    // Right wall outward unit vector (-cosA, -sinA), hinge along fTL -> fBL
    const rTL: Point2D = add(fTL, -D * cosA, -D * sinA)
    const rBL: Point2D = add(fBL, -D * cosA, -D * sinA)
    // Left wall outward unit vector (+cosA, -sinA), hinge along fTR -> fBR
    const lTR: Point2D = add(fTR, D * cosA, -D * sinA)
    const lBR: Point2D = add(fBR, D * cosA, -D * sinA)

    // Outer tab vertices on Right's outer edge (rTL -> rBL) and Left's outer edge (lTR -> lBR)
    const rTabTop: Point2D = add(lerpPt(rTL, rBL, bH / Hside), -t * cosA, -t * sinA)
    const rTabBot: Point2D = add(lerpPt(rTL, rBL, 1 - bH / Hside), -t * cosA, -t * sinA)
    const lTabTop: Point2D = add(lerpPt(lTR, lBR, bH / Hside), t * cosA, -t * sinA)
    const lTabBot: Point2D = add(lerpPt(lTR, lBR, 1 - bH / Hside), t * cosA, -t * sinA)

    const [du, dv] = def.decorOffset
    const makeFace = (
        name: OrigamiFaceName,
        quad: [Point2D, Point2D, Point2D, Point2D],
        gridW: number,
        gridH: number,
        cellWidthMm: number,
        cellHeightMm: number,
        taperTopFactor = 0,
    ): OrigamiFaceSpec => {
        const baseUv = def.uvs[name]
        return {
            name,
            baseUv,
            overlayUv: { ...baseUv, u: baseUv.u + du, v: baseUv.v + dv },
            gridW,
            gridH,
            rect: quadBounds(quad),
            quad,
            cellWidthMm,
            cellHeightMm,
            taperTopFactor,
        }
    }

    // Notice Back is rotated 180° in the flat net so its narrow top edge (UV y=0) sits on tTL..tTR,
    // with UV topLeft (dx=0, dy=0) at tTR and UV topRight (dx=gW, dy=0) at tTL!
    const faces: OrigamiFaceSpec[] = [
        makeFace('back', [tTR, tTL, bTL, bTR], gW, gH, Wbot / gW, Hvert / gH, def.taper),
        makeFace('top', [tTL, tTR, fTR, fTL], gW, gD, Wtop / gW, D / gD, 0),
        makeFace('front', [fTL, fTR, fBR, fBL], gW, gH, Wbot / gW, Hvert / gH, def.taper),
        makeFace('right', [rTL, fTL, fBL, rBL], gD, gH, D / gD, Hside / gH, 0),
        makeFace('left', [fTR, lTR, lBR, fBR], gD, gH, D / gD, Hside / gH, 0),
        makeFace('bottom', [fBL, fBR, boBR, boBL], gW, gD, Wbot / gW, D / gD, 0),
    ]

    const tabs: OrigamiTab[] = [
        { id: 'topLeft', points: [fTL, [fTL[0] - t, fTL[1] - bD], [tTL[0] - t, tTL[1] + bD], tTL] },
        { id: 'topRight', points: [tTR, [tTR[0] + t, tTR[1] + bD], [fTR[0] + t, fTR[1] - bD], fTR] },
        { id: 'leftOuter', points: [lTR, lTabTop, lTabBot, lBR] },
        { id: 'bottomRight', points: [fBR, [fBR[0] + t, fBR[1] + bD], [boBR[0] + t, boBR[1] - bD], boBR] },
        { id: 'bottomBottom', points: [boBR, [boBR[0] - bW, yBotTab], [boBL[0] + bW, yBotTab], boBL] },
        { id: 'bottomLeft', points: [boBL, [boBL[0] - t, boBL[1] - bD], [fBL[0] - t, fBL[1] + bD], fBL] },
        { id: 'rightOuter', points: [rBL, rTabBot, rTabTop, rTL] },
    ]

    // Trace clockwise from bTL around the entire closed 26-vertex perimeter
    const cutPolygon: Point2D[] = [
        bTL,
        bTR,
        tTR,
        [tTR[0] + t, tTR[1] + bD],
        [fTR[0] + t, fTR[1] - bD],
        fTR,
        lTR,
        lTabTop,
        lTabBot,
        lBR,
        fBR,
        [fBR[0] + t, fBR[1] + bD],
        [boBR[0] + t, boBR[1] - bD],
        boBR,
        [boBR[0] - bW, yBotTab],
        [boBL[0] + bW, yBotTab],
        boBL,
        [boBL[0] - t, boBL[1] - bD],
        [fBL[0] - t, fBL[1] + bD],
        fBL,
        rBL,
        rTabBot,
        rTabTop,
        rTL,
        fTL,
        [fTL[0] - t, fTL[1] - bD],
        [tTL[0] - t, tTL[1] + bD],
        tTL,
    ]

    const foldLines: OrigamiFoldLine[] = [
        // 5 internal frustum creases
        { from: tTL, to: tTR, kind: 'body' },
        { from: fTL, to: fTR, kind: 'body' },
        { from: fBL, to: fBR, kind: 'body' },
        { from: fTL, to: fBL, kind: 'body' },
        { from: fTR, to: fBR, kind: 'body' },
        // 7 glue-tab creases
        { from: tTL, to: fTL, kind: 'tab' },
        { from: tTR, to: fTR, kind: 'tab' },
        { from: lTR, to: lBR, kind: 'tab' },
        { from: fBR, to: boBR, kind: 'tab' },
        { from: boBL, to: boBR, kind: 'tab' },
        { from: fBL, to: boBL, kind: 'tab' },
        { from: rTL, to: rBL, kind: 'tab' },
    ]

    const bounds = quadBounds(cutPolygon)
    return {
        id: def.id,
        code: def.code,
        pageIndex,
        sizePx: def.gridPx,
        sizeMm: def.sizeMm,
        taper: def.taper,
        bounds,
        faces,
        tabs,
        cutPolygon,
        foldLines,
        labelAnchor: [bTR[0] + 4, yBackTop + 5],
    }
}

export function buildOrigamiLayout(isSlim: boolean, modelId: OrigamiModelId = DEFAULT_ORIGAMI_MODEL): OrigamiLayout {
    const profile = getOrigamiModelProfile(modelId)
    const { mmPerPixel, tabMm, shape } = profile
    const defs = Object.fromEntries(
        getRawPartDefs(isSlim, shape, mmPerPixel).map(def => [def.id, def]),
    ) as Record<OrigamiPartId, RawPartDef>

    const usableWidth = A4_WIDTH_MM - PAGE_MARGIN_X_MM * 2
    const headerArea: RectMm = { x: PAGE_MARGIN_X_MM, y: 7, width: usableWidth, height: 15 }

    if (shape === 'cute') {
        // Page 1: HEAD (upright top) + Cute tapered TORSO (bottom-left) + Legend & Info (bottom-right)
        const headW = 4 * defs.head.sizeMm[0] + tabMm
        const headX = (A4_WIDTH_MM - headW) / 2
        const head = buildCuboidNet(defs.head, headX, 26, tabMm, 0)
        const torsoY = head.bounds.y + head.bounds.height + 8
        const torso = buildCuteTaperedTorsoNet(defs.torso, PAGE_MARGIN_X_MM, torsoY, tabMm, 0)

        const p1PanelX = torso.bounds.x + torso.bounds.width + 10
        const p1PanelW = A4_WIDTH_MM - PAGE_MARGIN_X_MM - p1PanelX
        const p1GuideArea: RectMm = { x: p1PanelX, y: torsoY + 6, width: p1PanelW, height: 34 }
        const p1InfoArea: RectMm = { x: p1PanelX, y: torsoY + 46, width: p1PanelW, height: 38 }

        // Page 2: All 4 Cute limbs upright in a clean 2x2 grid + Legend & Info below
        const armNetW = 2 * defs.rightArm.sizeMm[0] + 2 * defs.rightArm.sizeMm[2] + tabMm
        const legNetW = 2 * defs.rightLeg.sizeMm[0] + 2 * defs.rightLeg.sizeMm[2] + tabMm
        const armGap = Math.max(12, Math.min(24, usableWidth - 2 * armNetW))
        const armStartX = (A4_WIDTH_MM - (2 * armNetW + armGap)) / 2
        const legGap = Math.max(12, Math.min(24, usableWidth - 2 * legNetW))
        const legStartX = (A4_WIDTH_MM - (2 * legNetW + legGap)) / 2

        const row1Y = 28
        const rightArm = buildCuboidNet(defs.rightArm, armStartX, row1Y, tabMm, 1)
        const leftArm = buildCuboidNet(defs.leftArm, armStartX + armNetW + armGap, row1Y, tabMm, 1)
        const row2Y = rightArm.bounds.y + rightArm.bounds.height + 12
        const rightLeg = buildCuboidNet(defs.rightLeg, legStartX, row2Y, tabMm, 1)
        const leftLeg = buildCuboidNet(defs.leftLeg, legStartX + legNetW + legGap, row2Y, tabMm, 1)

        const p2FooterY = rightLeg.bounds.y + rightLeg.bounds.height + 14
        const p2GuideArea: RectMm = { x: PAGE_MARGIN_X_MM, y: p2FooterY, width: 112, height: 34 }
        const p2InfoArea: RectMm = { x: PAGE_MARGIN_X_MM + 116, y: p2FooterY, width: usableWidth - 116, height: 34 }

        const parts: OrigamiPartNet[] = [head, torso, rightArm, leftArm, rightLeg, leftLeg]
        const basePages: OrigamiBasePage[] = [
            {
                pageNumber: 1,
                role: 'headTorso',
                pageWidthMm: A4_WIDTH_MM,
                pageHeightMm: A4_HEIGHT_MM,
                parts: [head, torso],
                headerArea,
                guideArea: p1GuideArea,
                infoArea: p1InfoArea,
            },
            {
                pageNumber: 2,
                role: 'limbs',
                pageWidthMm: A4_WIDTH_MM,
                pageHeightMm: A4_HEIGHT_MM,
                parts: [rightArm, leftArm, rightLeg, leftLeg],
                headerArea,
                guideArea: p2GuideArea,
                infoArea: p2InfoArea,
            },
        ]

        return {
            modelId: profile.id,
            modelName: profile.name,
            shape,
            heightCm: profile.heightCm,
            mmPerPixel,
            tabMm,
            isSlim,
            pageWidthMm: A4_WIDTH_MM,
            pageHeightMm: A4_HEIGHT_MM,
            parts,
            basePages,
            headerArea,
            guideArea: p1GuideArea,
            infoArea: p1InfoArea,
        }
    }

    // Standard classic 1-page A4 layout
    const netW = (def: RawPartDef) => 2 * def.sizeMm[0] + 2 * def.sizeMm[2] + tabMm
    const netH = (def: RawPartDef) => def.sizeMm[1] + 2 * def.sizeMm[2] + 2 * tabMm

    const row1Y = 26
    const headH = netH(defs.head)
    const torsoW = netW(defs.torso)
    const torsoX = A4_WIDTH_MM - PAGE_MARGIN_X_MM - torsoW

    const rowGap = 8
    const row2Y = row1Y + headH + rowGap
    const rArmW = netW(defs.rightArm)
    const lArmW = netW(defs.leftArm)
    const rLegW = netW(defs.rightLeg)
    const limbH = netH(defs.rightLeg)
    const row2Gap = (usableWidth - (rArmW + lArmW + rLegW)) / 2

    const row3Y = row2Y + limbH + rowGap
    const lLegW = netW(defs.leftLeg)

    const parts: OrigamiPartNet[] = [
        buildCuboidNet(defs.head, PAGE_MARGIN_X_MM, row1Y, tabMm, 0),
        buildCuboidNet(defs.torso, torsoX, row1Y, tabMm, 0),
        buildCuboidNet(defs.rightArm, PAGE_MARGIN_X_MM, row2Y, tabMm, 0),
        buildCuboidNet(defs.leftArm, PAGE_MARGIN_X_MM + rArmW + row2Gap, row2Y, tabMm, 0),
        buildCuboidNet(defs.rightLeg, A4_WIDTH_MM - PAGE_MARGIN_X_MM - rLegW, row2Y, tabMm, 0),
        buildCuboidNet(defs.leftLeg, PAGE_MARGIN_X_MM, row3Y, tabMm, 0),
    ]

    const panelX = PAGE_MARGIN_X_MM + lLegW + 10
    const panelW = A4_WIDTH_MM - PAGE_MARGIN_X_MM - panelX
    const guideArea: RectMm = { x: panelX, y: row3Y + 1, width: panelW, height: 34 }
    const infoArea: RectMm = { x: panelX, y: row3Y + 38, width: panelW, height: limbH - 39 }

    const basePages: OrigamiBasePage[] = [
        {
            pageNumber: 1,
            role: 'all',
            pageWidthMm: A4_WIDTH_MM,
            pageHeightMm: A4_HEIGHT_MM,
            parts,
            headerArea,
            guideArea,
            infoArea,
        },
    ]

    return {
        modelId: profile.id,
        modelName: profile.name,
        shape,
        heightCm: profile.heightCm,
        mmPerPixel,
        tabMm,
        isSlim,
        pageWidthMm: A4_WIDTH_MM,
        pageHeightMm: A4_HEIGHT_MM,
        parts,
        basePages,
        headerArea,
        guideArea,
        infoArea,
    }
}

function fmt(value: number): string {
    return Number(value.toFixed(3)).toString()
}

/** Generates an exact physical-millimetre A4 cutting & scoring SVG for a single base page. */
export function generateOrigamiBasePageSvg(page: OrigamiBasePage): string {
    const cutPaths = page.parts.map(part => {
        const commands = part.cutPolygon.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${fmt(x)} ${fmt(y)}`).join(' ')
        return `    <path id="cut-${part.id}" d="${commands} Z" />`
    }).join('\n')

    const foldPaths = page.parts.map(part => {
        const commands = part.foldLines.map(line => `M${fmt(line.from[0])} ${fmt(line.from[1])} L${fmt(line.to[0])} ${fmt(line.to[1])}`).join(' ')
        return `    <path id="fold-${part.id}" d="${commands}" />`
    }).join('\n')

    return [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<svg xmlns="http://www.w3.org/2000/svg" width="${page.pageWidthMm}mm" height="${page.pageHeightMm}mm" viewBox="0 0 ${page.pageWidthMm} ${page.pageHeightMm}">`,
        `  <g id="cut-lines" fill="none" stroke="#e11d48" stroke-width="0.25" stroke-linejoin="miter">`,
        cutPaths,
        `  </g>`,
        `  <g id="fold-lines" fill="none" stroke="#2563eb" stroke-width="0.2" stroke-dasharray="1.5 1.2">`,
        foldPaths,
        `  </g>`,
        `</svg>`,
    ].join('\n')
}

/** Backwards-compatible wrapper generating the Page 1 base cutting & scoring SVG. */
export function generateOrigamiSvg(layout: OrigamiLayout): string {
    return generateOrigamiBasePageSvg(layout.basePages[0])
}
