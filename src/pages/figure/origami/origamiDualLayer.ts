import { cuteSourceRow } from '../../../lib/minefigure/shared/characterProportions.js'
import {
    A4_HEIGHT_MM,
    A4_WIDTH_MM,
    CUT_SAFE_BOTTOM_MM,
    CUT_SAFE_TOP_MM,
    PAGE_MARGIN_X_MM,
    type FaceUvRect,
    type OrigamiFaceName,
    type OrigamiFaceSpec,
    type OrigamiLayout,
    type OrigamiPartId,
    type OrigamiPartNet,
    type Point2D,
    type RectMm,
} from './origamiLayout'
import { getOrigamiModelProfile, type OrigamiModelId } from './origamiModels'

export type SupportKind = 'triangle'

const SQRT3 = Math.sqrt(3)
const TRI_ALT_RATIO = SQRT3 / 2

/**
 * Exact outer-layer face dimensions & standoff derived from MCModal (`MC.tsx`):
 * - Head inflates by +1.0 pixel unit total (+0.5/side -> 9×9×9 outer box).
 * - Torso, arms & legs inflate by +0.5 pixel unit total (+0.25/side -> [W+0.5, H+0.5, D+0.5]),
 *   preserving Cute's [0.85, 0.85, 1] limb/body scale and 0.3 torso X-taper.
 */
export interface OverlayFaceMetrics {
    baseWidthMm: number
    baseHeightMm: number
    outerWidthMm: number
    outerHeightMm: number
    outerCellWidthMm: number
    outerCellHeightMm: number
    standoffMm: number
    /** Tangential shift of outer face center along local +Y (upward in 3D; negated in top-down UV). */
    shiftYMm: number
    taperTopFactor: number
}

export function getOverlayFaceMetrics(
    part: OrigamiPartNet,
    face: OrigamiFaceSpec,
    modelId: OrigamiModelId,
): OverlayFaceMetrics {
    const profile = getOrigamiModelProfile(modelId)
    const extraPx = part.id === 'head' ? profile.headOverlayExtraPx : profile.bodyOverlayExtraPx

    const [W, H, D] = part.sizeMm
    const [gW, gH, gD] = part.sizePx
    const sx = W / gW
    const sy = H / gH
    const sz = D / gD

    const outerW = W + extraPx * sx
    const outerH = H + extraPx * sy
    const outerD = D + extraPx * sz

    const taper = part.taper
    const baseWtop = W * (1 - taper)
    const outerWtop = outerW * (1 - taper)

    let baseWidthMm: number
    let baseHeightMm: number
    let outerWidthMm: number
    let outerHeightMm: number
    let standoffMm: number
    let shiftYMm = 0
    let taperTopFactor = 0

    switch (face.name) {
        case 'front':
        case 'back':
            baseWidthMm = W
            baseHeightMm = H
            outerWidthMm = outerW
            outerHeightMm = outerH
            standoffMm = (outerD - D) / 2
            taperTopFactor = taper
            break
        case 'top':
            baseWidthMm = baseWtop
            baseHeightMm = D
            outerWidthMm = outerWtop
            outerHeightMm = outerD
            standoffMm = (outerH - H) / 2
            break
        case 'bottom':
            baseWidthMm = W
            baseHeightMm = D
            outerWidthMm = outerW
            outerHeightMm = outerD
            standoffMm = (outerH - H) / 2
            break
        case 'left':
        case 'right':
            if (taper > 0) {
                const baseDx = (W - baseWtop) / 2
                const outerDx = (outerW - outerWtop) / 2
                const baseHside = Math.hypot(H, baseDx)
                const outerHside = Math.hypot(outerH, outerDx)
                const tilt = Math.atan2(baseDx, H)
                const deltaMidX = (outerW + outerWtop) / 4 - (W + baseWtop) / 4
                baseWidthMm = D
                baseHeightMm = baseHside
                outerWidthMm = outerD
                outerHeightMm = outerHside
                standoffMm = deltaMidX * Math.cos(tilt)
                shiftYMm = -deltaMidX * Math.sin(tilt)
            } else {
                baseWidthMm = D
                baseHeightMm = H
                outerWidthMm = outerD
                outerHeightMm = outerH
                standoffMm = (outerW - W) / 2
            }
            break
    }

    return {
        baseWidthMm,
        baseHeightMm,
        outerWidthMm,
        outerHeightMm,
        outerCellWidthMm: outerWidthMm / face.gridW,
        outerCellHeightMm: outerHeightMm / face.gridH,
        standoffMm,
        shiftYMm,
        taperTopFactor,
    }
}

export interface SupportAnchor {
    /** 1-based global index printed on both the base cuboid pixel and the triangle support piece. */
    index: number
    islandId: string
    partId: OrigamiPartId
    faceName: OrigamiFaceName
    /** Voxel coordinate in the face's oriented outer pixel grid (0..gridW-1, 0..gridH-1). */
    x: number
    y: number
    /** Normalized base-face coordinate (0..1, 0..1) directly below the outer support mount. */
    baseU: number
    baseV: number
    /** Physical mount position relative to the base face center in mm (+X right, +Y down). */
    faceOffsetXMm: number
    faceOffsetYMm: number
    kind: SupportKind
    /** Equilateral triangle side length (mm), strictly hidden behind occupied island pixels & inside base face. */
    sideMm: number
    /** Exact MCModal stand-off height in millimetres between base face and floating outer layer. */
    standoffMm: number
    /** Folded top/bottom 60° trapezoidal glue-flap depth in millimetres. */
    footMm: number
    /** RGB color sampled from this key voxel so the triangle walls blend discreetly from the side. */
    color: [number, number, number]
}

export interface OverlayIsland {
    id: string
    partId: OrigamiPartId
    faceName: OrigamiFaceName
    faceWidthPx: number
    faceHeightPx: number
    /** Inflated MCModal outer-layer cell width (mm) at the face's widest row. */
    cellWidthMm: number
    /** Inflated MCModal outer-layer cell height (mm). */
    cellHeightMm: number
    /** Exact MCModal stand-off gap (mm) for this face. */
    standoffMm: number
    /** Tangential +Y shift of outer face center relative to base face center (mm). */
    shiftYMm: number
    /** Linear top-width taper factor (0 for rectangles; CUTE_TAPER for Cute torso front/back). */
    taperTopFactor: number
    /** Pixels in oriented face coordinates [x, y]. */
    pixels: Point2D[]
    bbox: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number }
    /**
     * Exact orthogonal boundary loops in local island pixel coordinates (relative to bbox.minX, bbox.minY).
     * First loop(s) are outer perimeters; any interior cutouts (e.g. eye holes) are inner loops.
     */
    cutLoopsPx: Point2D[][]
    supports: SupportAnchor[]
}

export interface PlacedOverlayIsland {
    island: OverlayIsland
    /** Placement origin (top-left of island mm bounding box) on its A4 sheet in millimetres. */
    x: number
    y: number
    widthMm: number
    heightMm: number
    /** Horizontal shift subtracted after tapering so the island's leftmost point sits at `x`. */
    localOffsetXMm: number
    /** Cut loops transformed to A4 sheet millimetres (including taper for Cute torso front/back). */
    cutLoopsMm: Point2D[][]
    /** Anchor positions transformed to A4 sheet millimetres. */
    anchorPointsMm: { index: number; x: number; y: number }[]
}

export interface SupportFoldSegment {
    from: Point2D
    to: Point2D
    kind: 'mountain'
}

export interface SupportCutPiece {
    /** Single closed 13-vertex equilateral triangular prism cut outline in A4 sheet millimetres. */
    cutPolygon: Point2D[]
    /** 5 all-mountain fold lines (3 equal 60° walls + self-glue tab + top & bottom 60° glue flaps). */
    foldLines: SupportFoldSegment[]
    /** Combined 3-wall vertical strip rect (3 equal sides) tinted with the key voxel color on PNG. */
    wallRect: RectMm
    /** Light-tinted glue-tab polygons (top 60° flap, bottom 60° flap, and right-end self-glue tab). */
    glueTabPolygons: Point2D[][]
}

export interface PlacedSupport {
    anchor: SupportAnchor
    bounds: RectMm
    /** Single unfolded 1-piece L-shaped corner riser. */
    pieces: SupportCutPiece[]
    labelPos: Point2D
}

export interface DualLayerOverlayPage {
    pageNumber: number
    pageWidthMm: number
    pageHeightMm: number
    headerArea: RectMm
    islands: PlacedOverlayIsland[]
    supports: PlacedSupport[]
    infoArea?: RectMm
}

export interface DualLayerPlan {
    standoffMm: number
    footMm: number
    islands: OverlayIsland[]
    supports: SupportAnchor[]
    supportCount: number
    /** Overlay + support A4 pages starting immediately after `layout.basePages`. */
    overlayPages: DualLayerOverlayPage[]
}

const PART_SHORT_CODE: Record<OrigamiPartId, string> = {
    head: 'H',
    torso: 'T',
    rightArm: 'RA',
    leftArm: 'LA',
    rightLeg: 'RL',
    leftLeg: 'LL',
}

const MAX_SUPPORTS_PER_ISLAND = 12

export function readOrientedSkinPixel(
    skinData: Uint8ClampedArray,
    uv: FaceUvRect,
    dx: number,
    dy: number,
    gridH: number,
): [number, number, number, number] {
    const sx = uv.flipH ? uv.w - 1 - dx : dx
    const logicalY = uv.flipV ? gridH - 1 - dy : dy
    const sy = uv.cuteRows && uv.h === 12 ? cuteSourceRow(logicalY, gridH) : logicalY
    const idx = ((uv.v + sy) * 64 + (uv.u + sx)) * 4
    return [skinData[idx], skinData[idx + 1], skinData[idx + 2], skinData[idx + 3]]
}

/**
 * Maps a face-space grid coordinate `(gx, gy)` (in `0..faceW, 0..faceH`) to physical mm relative
 * to the face's top-left corner, applying linear top taper when `taperTopFactor > 0`.
 */
export function mapFaceGridPointMm(
    gx: number,
    gy: number,
    faceW: number,
    faceH: number,
    cellWidthMm: number,
    cellHeightMm: number,
    taperTopFactor: number,
): Point2D {
    const fullW = faceW * cellWidthMm
    const yMm = gy * cellHeightMm
    if (!taperTopFactor) {
        return [gx * cellWidthMm, yMm]
    }
    const yFrac = gy / faceH // 0 at top (narrow), 1 at bottom (wide)
    const rowFactor = 1 - taperTopFactor * (1 - yFrac)
    const rowW = fullW * rowFactor
    const xMm = (fullW - rowW) / 2 + (gx / faceW) * rowW
    return [xMm, yMm]
}

/**
 * Traces all closed orthogonal pixel-grid boundary loops (both outer perimeters and inner holes)
 * for a set of local pixel coordinates `(lx, ly)` and merges collinear segments.
 */
export function tracePixelBoundaryLoops(localPixels: Point2D[]): Point2D[][] {
    const occupied = new Set(localPixels.map(([x, y]) => `${x},${y}`))
    const has = (x: number, y: number) => occupied.has(`${x},${y}`)

    interface DirEdge {
        x1: number
        y1: number
        x2: number
        y2: number
        dir: number // 0: +x, 1: +y, 2: -x, 3: -y
        used: boolean
    }
    const edges: DirEdge[] = []
    const byStart = new Map<string, DirEdge[]>()
    const addEdge = (x1: number, y1: number, x2: number, y2: number, dir: number) => {
        const edge: DirEdge = { x1, y1, x2, y2, dir, used: false }
        edges.push(edge)
        const key = `${x1},${y1}`
        const list = byStart.get(key)
        if (list) list.push(edge)
        else byStart.set(key, [edge])
    }

    for (const [x, y] of localPixels) {
        if (!has(x, y - 1)) addEdge(x, y, x + 1, y, 0)
        if (!has(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1, 1)
        if (!has(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1, 2)
        if (!has(x - 1, y)) addEdge(x, y + 1, x, y, 3)
    }

    const loops: Point2D[][] = []
    for (const startEdge of edges) {
        if (startEdge.used) continue
        const raw: Point2D[] = []
        let curr: DirEdge | undefined = startEdge
        while (curr && !curr.used) {
            curr.used = true
            raw.push([curr.x1, curr.y1])
            const candidates: DirEdge[] = (byStart.get(`${curr.x2},${curr.y2}`) || []).filter(e => !e.used)
            if (candidates.length === 0) break
            if (candidates.length === 1) {
                curr = candidates[0]
            } else {
                const currDir = curr.dir
                const turnOrder: number[] = [(currDir + 1) % 4, currDir, (currDir + 3) % 4, (currDir + 2) % 4]
                curr = turnOrder.map(dir => candidates.find(c => c.dir === dir)).find(Boolean) ?? candidates[0]
            }
        }
        const simplified: Point2D[] = []
        for (let i = 0; i < raw.length; i++) {
            const prev = raw[(i - 1 + raw.length) % raw.length]
            const pt = raw[i]
            const next = raw[(i + 1) % raw.length]
            const collinear = (prev[0] === pt[0] && pt[0] === next[0]) || (prev[1] === pt[1] && pt[1] === next[1])
            if (!collinear) simplified.push(pt)
        }
        if (simplified.length >= 4) loops.push(simplified)
    }

    return loops
}

/**
 * Computes structural key support voxel coordinates for a 4-connected outer-layer island.
 * Uses exact 4-connected geodesic distance strictly along connected paper pixels (never jumping
 * across empty air or diagonal corners), gives tighter limits to thin 1-pixel filaments/tips,
 * and adds off-diagonal supports on 2D plates so no patch balances on a single corner or seesaw hinge.
 */
export function selectKeySupportVoxels(pixels: Point2D[]): Point2D[] {
    if (pixels.length === 0) return []
    const n = pixels.length
    const idxByKey = new Map<string, number>()
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (let i = 0; i < n; i++) {
        const [x, y] = pixels[i]
        idxByKey.set(`${x},${y}`, i)
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
    }
    const bw = maxX - minX + 1
    const bh = maxY - minY + 1
    const has = (x: number, y: number) => idxByKey.has(`${x},${y}`)

    // Strict 4-connected adjacency graph + thin-filament detection (not part of any 2x2 solid block)
    const adj: number[][] = Array.from({ length: n }, () => [])
    const deg = new Uint8Array(n)
    const isThin = new Uint8Array(n)
    for (let i = 0; i < n; i++) {
        const [x, y] = pixels[i]
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as Point2D[]) {
            const j = idxByKey.get(`${nx},${ny}`)
            if (j !== undefined) adj[i].push(j)
        }
        deg[i] = adj[i].length
        const in2x2 =
            (has(x - 1, y) && has(x, y - 1) && has(x - 1, y - 1)) ||
            (has(x + 1, y) && has(x, y - 1) && has(x + 1, y - 1)) ||
            (has(x - 1, y) && has(x, y + 1) && has(x - 1, y + 1)) ||
            (has(x + 1, y) && has(x, y + 1) && has(x + 1, y + 1))
        if (!in2x2) isThin[i] = 1
    }

    // All-pairs exact 4-connected BFS geodesic distance along the paper island (n <= 96)
    const geo: Int16Array[] = Array.from({ length: n }, () => new Int16Array(n).fill(9999))
    const queue = new Int32Array(n)
    for (let s = 0; s < n; s++) {
        const dist = geo[s]
        dist[s] = 0
        let qh = 0
        let qt = 0
        queue[qt++] = s
        while (qh < qt) {
            const u = queue[qh++]
            const du = dist[u] + 1
            for (const v of adj[u]) {
                if (dist[v] > du) {
                    dist[v] = du
                    queue[qt++] = v
                }
            }
        }
    }

    const cmpPos = (a: number, b: number) =>
        pixels[a][1] !== pixels[b][1] ? pixels[a][1] - pixels[b][1] : pixels[a][0] - pixels[b][0]

    // Compact small islands (<= 3x3 and geodesic radius <= 2): single centered support at geodesic medoid
    let medoid = 0
    let medEcc = Infinity
    let medSum = Infinity
    for (let i = 0; i < n; i++) {
        let ecc = 0
        let sum = 0
        for (let j = 0; j < n; j++) {
            if (geo[i][j] > ecc) ecc = geo[i][j]
            sum += geo[i][j]
        }
        if (
            ecc < medEcc ||
            (ecc === medEcc &&
                (sum < medSum ||
                    (sum === medSum && (deg[i] > deg[medoid] || (deg[i] === deg[medoid] && cmpPos(i, medoid) < 0)))))
        ) {
            medoid = i
            medEcc = ecc
            medSum = sum
        }
    }
    if (bw <= 3 && bh <= 3 && medEcc <= 2) {
        return [pixels[medoid]]
    }

    // Per-pixel geodesic reach limit:
    // - 1-px filaments, tips & diagonal staircases: <= 2 steps
    // - 2D patch borders & corners: <= 3 steps
    // - Solid interior surrounded on all 4 sides: <= 4 steps
    const limit = new Int16Array(n)
    for (let i = 0; i < n; i++) {
        if (isThin[i]) limit[i] = 2
        else if (deg[i] < 4) limit[i] = 3
        else limit[i] = 4
    }

    // Candidate pool: prefer inset (deg=4) when the island is >= 5px in both dimensions so supports
    // sit comfortably away from edges, while keeping any protruding thin branches eligible.
    const inset: number[] = []
    for (let i = 0; i < n; i++) {
        if (deg[i] === 4) inset.push(i)
    }
    const useInset = inset.length >= 2 && Math.min(bw, bh) >= 5
    const allIdx = Array.from({ length: n }, (_, i) => i)
    let pool: number[]
    if (useInset) {
        pool = [...inset]
        for (let i = 0; i < n; i++) {
            if (deg[i] === 4) continue
            let minToInset = Infinity
            for (const q of inset) {
                if (geo[i][q] < minToInset) minToInset = geo[i][q]
            }
            if (minToInset >= 3 || (isThin[i] && minToInset >= 2)) {
                pool.push(i)
            }
        }
    } else {
        pool = allIdx
    }

    const cheb = (a: number, b: number) =>
        Math.max(Math.abs(pixels[a][0] - pixels[b][0]), Math.abs(pixels[a][1] - pixels[b][1]))

    // Seed with geodesic diameter endpoints in pool (stabilizes opposite ends of strips, U-shapes & plates)
    let pA = pool[0]
    let pB = pool[0]
    let bestDia = -1
    for (let ia = 0; ia < pool.length; ia++) {
        for (let ib = ia + 1; ib < pool.length; ib++) {
            const a = pool[ia]
            const b = pool[ib]
            const d = geo[a][b]
            const degSum = deg[a] + deg[b]
            const bestDegSum = deg[pA] + deg[pB]
            if (
                d > bestDia ||
                (d === bestDia &&
                    (degSum > bestDegSum ||
                        (degSum === bestDegSum && (cmpPos(a, pA) < 0 || (a === pA && cmpPos(b, pB) < 0)))))
            ) {
                bestDia = d
                pA = a
                pB = b
            }
        }
    }

    const chosen: number[] = bestDia > 0 ? [pA, pB] : [pA]
    const chosenSet = new Set<number>(chosen)

    const pickCandidate = (worst: number, reqLimit: number): number => {
        const search = (cands: number[], minCheb: number) => {
            let best = -1
            let bestToWorst = Infinity
            let bestDeg = -1
            let bestSpread = -1
            for (const c of cands) {
                if (chosenSet.has(c)) continue
                let minC = Infinity
                let minG = Infinity
                for (const a of chosen) {
                    const ch = cheb(c, a)
                    if (ch < minC) minC = ch
                    const gd = geo[c][a]
                    if (gd < minG) minG = gd
                }
                if (minC < minCheb) continue
                const tw = geo[c][worst]
                const d = deg[c]
                if (
                    tw < bestToWorst ||
                    (tw === bestToWorst &&
                        (d > bestDeg ||
                            (d === bestDeg && (minG > bestSpread || (minG === bestSpread && cmpPos(c, best) < 0)))))
                ) {
                    best = c
                    bestToWorst = tw
                    bestDeg = d
                    bestSpread = minG
                }
            }
            return best
        }

        const stages: [number[], number][] = [
            [pool, 2],
            [allIdx, 2],
            [pool, 1],
            [allIdx, 1],
        ]
        for (const [cands, mc] of stages) {
            const hit = search(cands, mc)
            if (hit !== -1 && geo[hit][worst] <= reqLimit) return hit
        }
        for (const [cands, mc] of stages) {
            const hit = search(cands, mc)
            if (hit !== -1) return hit
        }
        return -1
    }

    while (chosen.length < MAX_SUPPORTS_PER_ISLAND) {
        let worst = -1
        let worstExcess = 0
        let worstDeg = 99
        let worstDist = -1
        for (let i = 0; i < n; i++) {
            let nearest = Infinity
            for (const a of chosen) {
                if (geo[i][a] < nearest) nearest = geo[i][a]
            }
            const excess = nearest - limit[i]
            if (
                excess > worstExcess ||
                (excess === worstExcess &&
                    excess > 0 &&
                    (deg[i] < worstDeg ||
                        (deg[i] === worstDeg &&
                            (nearest > worstDist || (nearest === worstDist && cmpPos(i, worst) < 0)))))
            ) {
                worst = i
                worstExcess = excess
                worstDeg = deg[i]
                worstDist = nearest
            }
        }
        if (worst === -1) break
        const next = pickCandidate(worst, limit[worst])
        if (next === -1) break
        chosen.push(next)
        chosenSet.add(next)
    }

    // Anti-seesaw check: any 2D plate (>= 4x4, >= 12px) left with only 2 supports rocks along that
    // line; brace the farthest pixels on both sides of the hinge.
    if (chosen.length === 2 && bw >= 4 && bh >= 4 && n >= 12) {
        const [ax, ay] = pixels[chosen[0]]
        const [bx, by] = pixels[chosen[1]]
        const lineLen = Math.hypot(bx - ax, by - ay) || 1
        for (const sign of [1, -1]) {
            let far = -1
            let farPerp = 1.6
            for (let i = 0; i < n; i++) {
                const [px, py] = pixels[i]
                const signed = ((px - ax) * (by - ay) - (py - ay) * (bx - ax)) / lineLen
                if (signed * sign > farPerp) {
                    farPerp = signed * sign
                    far = i
                }
            }
            if (far !== -1) {
                const next = pickCandidate(far, 2)
                if (next !== -1) {
                    chosen.push(next)
                    chosenSet.add(next)
                }
            }
        }
    }

    return chosen
        .map(i => pixels[i])
        .sort((a, b) => (a[1] !== b[1] ? a[1] - b[1] : a[0] - b[0]))
}

/**
 * Sizes a 1-piece equilateral triangular prism support for a key voxel so all 3 walls and
 * inward glue flaps stay strictly hidden behind the occupied voxels of its outer-layer island.
 */
export function sizeTriangleSupport(
    pixels: Point2D[],
    voxel: Point2D,
    cellWidthMm: number,
    cellHeightMm = cellWidthMm,
): { kind: SupportKind; sideMm: number } {
    const set = new Set(pixels.map(([x, y]) => `${x},${y}`))
    const has = (x: number, y: number) => set.has(`${x},${y}`)
    const [vx, vy] = voxel

    const bothX = has(vx - 1, vy) && has(vx + 1, vy)
    const bothY = has(vx, vy - 1) && has(vx, vy + 1)

    const availW = Math.min(4.2, cellWidthMm * (bothX ? 1.15 : 0.9))
    const availH = Math.min(4.2, cellHeightMm * (bothY ? 1.15 : 0.9))
    const sideMm = Number(Math.min(availW, availH / TRI_ALT_RATIO).toFixed(2))

    return {
        kind: 'triangle',
        sideMm,
    }
}

/**
 * Computes the vertically aligned base-to-outer support mount point and equilateral triangle
 * dimensions so every support stands 100% inside the base face AND 100% hidden behind the
 * inflated MCModal outer-layer island.
 */
export function computeSupportPlacement(
    metrics: OverlayFaceMetrics,
    face: OrigamiFaceSpec,
    pixels: Point2D[],
    voxel: Point2D,
    maxFootMm: number,
): {
    baseU: number
    baseV: number
    faceOffsetXMm: number
    faceOffsetYMm: number
    kind: SupportKind
    sideMm: number
    footMm: number
} {
    const [vx, vy] = voxel
    const gW = face.gridW
    const gH = face.gridH

    // Top-down Y bounds of this outer voxel relative to base face center (mm)
    const oyMin = (vy / gH - 0.5) * metrics.outerHeightMm - metrics.shiftYMm
    const oyMax = ((vy + 1) / gH - 0.5) * metrics.outerHeightMm - metrics.shiftYMm
    const cyMin = Math.max(-metrics.baseHeightMm / 2, oyMin)
    const cyMax = Math.min(metrics.baseHeightMm / 2, oyMax)
    const py = (cyMin + cyMax) / 2
    const overlapY = Math.max(0.5, cyMax - cyMin)

    const outerV = (py + metrics.shiftYMm) / metrics.outerHeightMm + 0.5
    const outerRowW = metrics.outerWidthMm * (1 - metrics.taperTopFactor * (1 - outerV))
    const baseV = py / metrics.baseHeightMm + 0.5
    const baseRowW = metrics.baseWidthMm * (1 - metrics.taperTopFactor * (1 - baseV))

    const oxMin = (vx / gW - 0.5) * outerRowW
    const oxMax = ((vx + 1) / gW - 0.5) * outerRowW
    const cxMin = Math.max(-baseRowW / 2, oxMin)
    const cxMax = Math.min(baseRowW / 2, oxMax)
    const px = (cxMin + cxMax) / 2
    const overlapX = Math.max(0.5, cxMax - cxMin)

    const baseU = px / baseRowW + 0.5
    const baseMarginX = Math.max(0.25, baseRowW / 2 - Math.abs(px))
    const baseMarginY = Math.max(0.25, metrics.baseHeightMm / 2 - Math.abs(py))

    const set = new Set(pixels.map(([x, y]) => `${x},${y}`))
    const bothX = set.has(`${vx - 1},${vy}`) && set.has(`${vx + 1},${vy}`)
    const bothY = set.has(`${vx},${vy - 1}`) && set.has(`${vx},${vy + 1}`)

    const rowCellW = outerRowW / gW
    const availW = Math.min(4.2, rowCellW * (bothX ? 1.15 : 0.9))
    const availH = Math.min(4.2, metrics.outerCellHeightMm * (bothY ? 1.15 : 0.9))
    const maxW = Math.min(bothX ? availW : Math.min(availW, overlapX * 0.9), baseMarginX * 2 * 0.92)
    const maxH = Math.min(bothY ? availH : Math.min(availH, overlapY * 0.9), baseMarginY * 2 * 0.92)
    const sideMm = Number(Math.min(maxW, maxH / TRI_ALT_RATIO).toFixed(2))
    const triAlt = sideMm * TRI_ALT_RATIO
    const footMm = Number(Math.min(maxFootMm, triAlt * 0.72).toFixed(2))

    return {
        baseU,
        baseV,
        faceOffsetXMm: px,
        faceOffsetYMm: py,
        kind: 'triangle',
        sideMm,
        footMm,
    }
}

export function extractOverlayIslands(
    skinData: Uint8ClampedArray,
    layout: OrigamiLayout,
): { islands: OverlayIsland[]; supports: SupportAnchor[] } {
    const profile = getOrigamiModelProfile(layout.modelId)
    const footMm = profile.supportFootMm || 1.4

    const islands: OverlayIsland[] = []
    const supports: SupportAnchor[] = []
    let globalSupportIndex = 1

    for (const part of layout.parts) {
        let partIslandSeq = 1
        for (const face of part.faces) {
            const metrics = getOverlayFaceMetrics(part, face, layout.modelId)
            const standoffMm = Number(metrics.standoffMm.toFixed(3))
            const w = face.gridW
            const h = face.gridH
            const visited = new Uint8Array(w * h)
            const opaque = new Uint8Array(w * h)
            const colors: [number, number, number][] = new Array(w * h)

            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const [r, g, b, a] = readOrientedSkinPixel(skinData, face.overlayUv, x, y, h)
                    const idx = y * w + x
                    if (a >= 128) {
                        opaque[idx] = 1
                        colors[idx] = [r, g, b]
                    }
                }
            }

            for (let sy = 0; sy < h; sy++) {
                for (let sx = 0; sx < w; sx++) {
                    const startIdx = sy * w + sx
                    if (!opaque[startIdx] || visited[startIdx]) continue

                    const queue: Point2D[] = [[sx, sy]]
                    visited[startIdx] = 1
                    const compPixels: Point2D[] = []

                    for (let head = 0; head < queue.length; head++) {
                        const [cx, cy] = queue[head]
                        compPixels.push([cx, cy])
                        for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]] as Point2D[]) {
                            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
                            const nIdx = ny * w + nx
                            if (opaque[nIdx] && !visited[nIdx]) {
                                visited[nIdx] = 1
                                queue.push([nx, ny])
                            }
                        }
                    }

                    let minX = w
                    let minY = h
                    let maxX = -1
                    let maxY = -1
                    for (const [x, y] of compPixels) {
                        if (x < minX) minX = x
                        if (y < minY) minY = y
                        if (x > maxX) maxX = x
                        if (y > maxY) maxY = y
                    }

                    const localPixels: Point2D[] = compPixels.map(([x, y]) => [x - minX, y - minY])
                    const cutLoopsPx = tracePixelBoundaryLoops(localPixels)
                    const islandId = `${PART_SHORT_CODE[part.id]}${partIslandSeq++}`
                    const keyVoxels = selectKeySupportVoxels(compPixels)

                    const islandSupports: SupportAnchor[] = keyVoxels.map(voxel => {
                        const placed = computeSupportPlacement(metrics, face, compPixels, voxel, footMm)
                        const anchor: SupportAnchor = {
                            index: globalSupportIndex++,
                            islandId,
                            partId: part.id,
                            faceName: face.name,
                            x: voxel[0],
                            y: voxel[1],
                            baseU: placed.baseU,
                            baseV: placed.baseV,
                            faceOffsetXMm: placed.faceOffsetXMm,
                            faceOffsetYMm: placed.faceOffsetYMm,
                            kind: placed.kind,
                            sideMm: placed.sideMm,
                            standoffMm,
                            footMm: placed.footMm,
                            color: colors[voxel[1] * w + voxel[0]],
                        }
                        supports.push(anchor)
                        return anchor
                    })

                    islands.push({
                        id: islandId,
                        partId: part.id,
                        faceName: face.name,
                        faceWidthPx: w,
                        faceHeightPx: h,
                        cellWidthMm: metrics.outerCellWidthMm,
                        cellHeightMm: metrics.outerCellHeightMm,
                        standoffMm,
                        shiftYMm: metrics.shiftYMm,
                        taperTopFactor: metrics.taperTopFactor,
                        pixels: compPixels,
                        bbox: { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 },
                        cutLoopsPx,
                        supports: islandSupports,
                    })
                }
            }
        }
    }

    return { islands, supports }
}

function measureIslandMm(island: OverlayIsland): { minXMm: number; widthMm: number; heightMm: number } {
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const loop of island.cutLoopsPx) {
        for (const [lx, ly] of loop) {
            const [x, y] = mapFaceGridPointMm(
                island.bbox.minX + lx,
                island.bbox.minY + ly,
                island.faceWidthPx,
                island.faceHeightPx,
                island.cellWidthMm,
                island.cellHeightMm,
                island.taperTopFactor,
            )
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
        }
    }
    return { minXMm: minX, widthMm: maxX - minX, heightMm: maxY - minY }
}

function getSupportStripDims(anchor: SupportAnchor) {
    const s = anchor.sideMm
    const selfGlueW = Number(Math.min(2.2, Math.max(1.0, s * 0.72)).toFixed(2))
    const H = anchor.standoffMm
    const foot = Number(Math.min(anchor.footMm, s * TRI_ALT_RATIO * 0.72).toFixed(2))
    const inset = Number((foot / SQRT3).toFixed(2))
    const tabBevel = Number(Math.min(H * 0.18, 0.22).toFixed(2))
    return { s, selfGlueW, H, foot, inset, tabBevel }
}

/**
 * Builds a single 1-piece self-gluing equilateral triangular prism support:
 *   [side 1 (s)] : [side 2 (s)] : [side 3 (s)] : [self-glue tab]
 * All 3 vertical walls share equal width `s` and identical 60° folds; gluing the right-end
 * self-glue tab onto the inside of side 1 locks the prism rigidly at exact height `standoffMm`,
 * with symmetric 60° beveled top & bottom glue flaps tucked strictly inside the triangle opening.
 */
function buildPlacedSupport(anchor: SupportAnchor, ox: number, oy: number): PlacedSupport {
    const { s, selfGlueW, H, foot, inset, tabBevel } = getSupportStripDims(anchor)

    const x0 = ox
    const x1 = ox + s
    const x2 = ox + 2 * s
    const x3 = ox + 3 * s
    const x4 = x3 + selfGlueW
    const y0 = oy
    const y1 = oy + foot
    const y2 = y1 + H
    const y3 = y2 + foot

    const topFlapPoly: Point2D[] = [
        [x0, y1],
        [x0 + inset, y0],
        [x1 - inset, y0],
        [x1, y1],
    ]
    const botFlapPoly: Point2D[] = [
        [x1, y2],
        [x2, y2],
        [x2 - inset, y3],
        [x1 + inset, y3],
    ]
    const selfGluePoly: Point2D[] = [
        [x3, y1],
        [x4, y1 + tabBevel],
        [x4, y2 - tabBevel],
        [x3, y2],
    ]

    const piece: SupportCutPiece = {
        cutPolygon: [
            [x0, y1],
            [x0 + inset, y0],
            [x1 - inset, y0],
            [x1, y1],
            [x3, y1],
            [x4, y1 + tabBevel],
            [x4, y2 - tabBevel],
            [x3, y2],
            [x2, y2],
            [x2 - inset, y3],
            [x1 + inset, y3],
            [x1, y2],
            [x0, y2],
        ],
        foldLines: [
            { from: [x1, y1], to: [x1, y2], kind: 'mountain' }, // 60° corner 1
            { from: [x2, y1], to: [x2, y2], kind: 'mountain' }, // 60° corner 2
            { from: [x3, y1], to: [x3, y2], kind: 'mountain' }, // 60° self-glue fold
            { from: [x0, y1], to: [x1, y1], kind: 'mountain' }, // top 60° glue flap
            { from: [x1, y2], to: [x2, y2], kind: 'mountain' }, // bottom 60° glue flap
        ],
        wallRect: { x: x0, y: y1, width: 3 * s, height: H },
        glueTabPolygons: [topFlapPoly, botFlapPoly, selfGluePoly],
    }

    const totalW = x4 - x0
    const totalH = y3 - y0
    return {
        anchor,
        bounds: { x: ox, y: oy, width: totalW, height: totalH },
        pieces: [piece],
        labelPos: [ox, oy + totalH + 2.4],
    }
}

function measureSupportSlot(anchor: SupportAnchor): { width: number; height: number } {
    const { s, selfGlueW, H, foot } = getSupportStripDims(anchor)
    return {
        width: 3 * s + selfGlueW,
        height: 2 * foot + H + 3.0,
    }
}

/**
 * Packs all outer-layer connected islands and their numbered L-shaped supports
 * cleanly onto A4 overlay page(s) inside the safe print & cutting bounds.
 */
export function buildDualLayerPlan(baseLayout: OrigamiLayout, skinData: Uint8ClampedArray): DualLayerPlan {
    const profile = getOrigamiModelProfile(baseLayout.modelId)
    const standoffMm = Number((0.5 * profile.headOverlayExtraPx * profile.mmPerPixel).toFixed(3))
    const footMm = profile.supportFootMm || 1.4
    const { islands, supports } = extractOverlayIslands(skinData, baseLayout)

    const minX = PAGE_MARGIN_X_MM
    const maxX = A4_WIDTH_MM - PAGE_MARGIN_X_MM
    const startY = Math.ceil(CUT_SAFE_TOP_MM) + 4 // 27 mm
    const infoReserveH = 24
    const maxY = Math.floor(CUT_SAFE_BOTTOM_MM) - 2 // 272 mm

    const firstOverlayPageNum = baseLayout.basePages.length + 1
    const overlayPages: DualLayerOverlayPage[] = []
    const createPage = (pageNumber: number): DualLayerOverlayPage => ({
        pageNumber,
        pageWidthMm: A4_WIDTH_MM,
        pageHeightMm: A4_HEIGHT_MM,
        headerArea: { x: PAGE_MARGIN_X_MM, y: 7, width: A4_WIDTH_MM - PAGE_MARGIN_X_MM * 2, height: 15 },
        islands: [],
        supports: [],
    })

    let page = createPage(firstOverlayPageNum)
    overlayPages.push(page)
    let cursorX = minX
    let cursorY = startY
    let rowHeight = 0

    const islandGapX = 4.5
    const islandGapY = 6.5

    const measured = islands.map(island => ({ island, ...measureIslandMm(island) }))
    measured.sort((a, b) => (b.heightMm !== a.heightMm ? b.heightMm - a.heightMm : b.widthMm - a.widthMm))

    for (const { island, minXMm, widthMm, heightMm } of measured) {
        const cellH = heightMm + 3.2
        const minYMm = island.bbox.minY * island.cellHeightMm

        if (cursorX > minX && cursorX + widthMm > maxX) {
            cursorX = minX
            cursorY += rowHeight + islandGapY
            rowHeight = 0
        }
        if (cursorY + cellH > maxY) {
            page = createPage(firstOverlayPageNum + overlayPages.length)
            overlayPages.push(page)
            cursorX = minX
            cursorY = startY
            rowHeight = 0
        }

        const cutLoopsMm = island.cutLoopsPx.map(loop =>
            loop.map(([lx, ly]): Point2D => {
                const [mx, my] = mapFaceGridPointMm(
                    island.bbox.minX + lx,
                    island.bbox.minY + ly,
                    island.faceWidthPx,
                    island.faceHeightPx,
                    island.cellWidthMm,
                    island.cellHeightMm,
                    island.taperTopFactor,
                )
                return [cursorX + (mx - minXMm), cursorY + (my - minYMm)]
            }),
        )
        const outerW = island.faceWidthPx * island.cellWidthMm
        const outerH = island.faceHeightPx * island.cellHeightMm
        const anchorPointsMm = island.supports.map(anchor => ({
            index: anchor.index,
            x: cursorX + (anchor.faceOffsetXMm + outerW / 2 - minXMm),
            y: cursorY + (anchor.faceOffsetYMm + island.shiftYMm + outerH / 2 - minYMm),
        }))

        page.islands.push({
            island,
            x: cursorX,
            y: cursorY,
            widthMm,
            heightMm,
            localOffsetXMm: minXMm,
            cutLoopsMm,
            anchorPointsMm,
        })

        cursorX += widthMm + islandGapX
        if (cellH > rowHeight) rowHeight = cellH
    }

    if (page.islands.length > 0 && supports.length > 0) {
        cursorX = minX
        cursorY += rowHeight + 9
        rowHeight = 0
    }

    const supportGapX = 3.8
    const supportGapY = 4.5

    for (const anchor of supports) {
        const slot = measureSupportSlot(anchor)
        if (cursorX > minX && cursorX + slot.width > maxX) {
            cursorX = minX
            cursorY += rowHeight + supportGapY
            rowHeight = 0
        }
        if (cursorY + slot.height > maxY) {
            page = createPage(firstOverlayPageNum + overlayPages.length)
            overlayPages.push(page)
            cursorX = minX
            cursorY = startY
            rowHeight = 0
        }

        page.supports.push(buildPlacedSupport(anchor, cursorX, cursorY))
        cursorX += slot.width + supportGapX
        if (slot.height > rowHeight) rowHeight = slot.height
    }

    const usedBottom = page.islands.length === 0 && page.supports.length === 0 ? startY : cursorY + rowHeight + 6
    if (usedBottom + infoReserveH <= maxY + 12) {
        page.infoArea = {
            x: minX,
            y: Math.max(usedBottom, maxY - infoReserveH + 4),
            width: maxX - minX,
            height: infoReserveH,
        }
    }

    return {
        standoffMm,
        footMm,
        islands,
        supports,
        supportCount: supports.length,
        overlayPages,
    }
}

function fmt(value: number): string {
    return Number(value.toFixed(3)).toString()
}

export function generateOverlayPageSvg(page: DualLayerOverlayPage): string {
    const cutPaths: string[] = []
    const foldPaths: string[] = []

    for (const placed of page.islands) {
        const d = placed.cutLoopsMm
            .map(loop => loop.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${fmt(x)} ${fmt(y)}`).join(' ') + ' Z')
            .join(' ')
        cutPaths.push(`    <path id="cut-island-${placed.island.id}" d="${d}" />`)
    }

    for (const placed of page.supports) {
        placed.pieces.forEach((piece, idx) => {
            const d = piece.cutPolygon.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${fmt(x)} ${fmt(y)}`).join(' ') + ' Z'
            cutPaths.push(`    <path id="cut-support-${placed.anchor.index}-${idx}" d="${d}" />`)

            if (piece.foldLines.length) {
                const fd = piece.foldLines.map(l => `M${fmt(l.from[0])} ${fmt(l.from[1])} L${fmt(l.to[0])} ${fmt(l.to[1])}`).join(' ')
                foldPaths.push(`    <path id="fold-support-${placed.anchor.index}-${idx}" d="${fd}" />`)
            }
        })
    }

    return [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<svg xmlns="http://www.w3.org/2000/svg" width="${page.pageWidthMm}mm" height="${page.pageHeightMm}mm" viewBox="0 0 ${page.pageWidthMm} ${page.pageHeightMm}">`,
        `  <g id="cut-lines" fill="none" stroke="#e11d48" stroke-width="0.25" stroke-linejoin="miter">`,
        ...cutPaths,
        `  </g>`,
        `  <g id="fold-lines" fill="none" stroke="#2563eb" stroke-width="0.2" stroke-dasharray="1.5 1.2">`,
        ...foldPaths,
        `  </g>`,
        `</svg>`,
    ].join('\n')
}
