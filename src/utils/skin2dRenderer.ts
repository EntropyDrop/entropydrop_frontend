export type Skin2DRenderOptions = {
    scale: number
    showOverlay: boolean
    overlayInflated: boolean
}

export type SkinImageSource = CanvasImageSource & {
    width: number
    height: number
}

type FaceUV = {
    u1: number
    v1: number
    u2: number
    v2: number
}

type BoxUV = {
    right: FaceUV
    front: FaceUV
    left: FaceUV
    back: FaceUV
    top: FaceUV
    bottom: FaceUV
}

type PartDrawInfo = {
    inner: BoxUV
    outer: BoxUV | null
    x: number
    y: number
    width: number
    height: number
    depth: number
}

const DEPTH_RATIO = 0.5
const HEAD_FORWARD = 2

function createBoxUV(x: number, y: number, width: number, height: number, depth: number): BoxUV {
    const rightU1 = x
    const frontU1 = rightU1 + depth
    const leftU1 = frontU1 + width
    const backU1 = leftU1 + depth
    const sideV1 = y + depth
    const sideV2 = sideV1 + height

    return {
        right: { u1: rightU1, v1: sideV1, u2: frontU1, v2: sideV2 },
        front: { u1: frontU1, v1: sideV1, u2: leftU1, v2: sideV2 },
        left: { u1: leftU1, v1: sideV1, u2: backU1, v2: sideV2 },
        back: { u1: backU1, v1: sideV1, u2: backU1 + width, v2: sideV2 },
        top: { u1: frontU1, v1: y, u2: leftU1, v2: y + depth },
        bottom: { u1: leftU1, v1: y, u2: leftU1 + width, v2: y + depth },
    }
}

function getSkinUV(slim: boolean) {
    const armWidth = slim ? 3 : 4

    return {
        head: {
            inner: createBoxUV(0, 0, 8, 8, 8),
            outer: createBoxUV(32, 0, 8, 8, 8),
        },
        body: {
            inner: createBoxUV(16, 16, 8, 12, 4),
            outer: createBoxUV(16, 32, 8, 12, 4),
        },
        rightArm: {
            inner: createBoxUV(40, 16, armWidth, 12, 4),
            outer: createBoxUV(40, 32, armWidth, 12, 4),
        },
        leftArm: {
            inner: createBoxUV(32, 48, armWidth, 12, 4),
            outer: createBoxUV(48, 48, armWidth, 12, 4),
        },
        rightLeg: {
            inner: createBoxUV(0, 16, 4, 12, 4),
            outer: createBoxUV(0, 32, 4, 12, 4),
        },
        leftLeg: {
            inner: createBoxUV(16, 48, 4, 12, 4),
            outer: createBoxUV(0, 48, 4, 12, 4),
        },
    }
}

function getPixelatedContext(canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Failed to create canvas context')
    context.imageSmoothingEnabled = false
    return context
}

function mirrorLegacyRegion(
    context: CanvasRenderingContext2D,
    texture: HTMLCanvasElement,
    textureScale: number,
    sourceX: number,
    sourceY: number,
    targetX: number,
    targetY: number,
) {
    const regionSize = 16 * textureScale

    context.save()
    context.translate(targetX * textureScale + regionSize, targetY * textureScale)
    context.scale(-1, 1)
    context.drawImage(
        texture,
        sourceX * textureScale,
        sourceY * textureScale,
        regionSize,
        regionSize,
        0,
        0,
        regionSize,
        regionSize,
    )
    context.restore()
}

function createTextureCanvas(source: SkinImageSource) {
    const width = Number(source.width)
    const height = Number(source.height)
    const isLegacy = width === height * 2
    const isModern = width === height
    const textureScale = width / 64

    if (
        !Number.isInteger(width)
        || !Number.isInteger(height)
        || width < 64
        || !Number.isInteger(textureScale)
        || (!isLegacy && !isModern)
    ) {
        throw new Error(`Unsupported Minecraft skin dimensions: ${width}x${height}`)
    }

    const texture = document.createElement('canvas')
    texture.width = width
    texture.height = isLegacy ? width : height
    const context = getPixelatedContext(texture)
    context.clearRect(0, 0, texture.width, texture.height)
    context.drawImage(source, 0, 0, width, height)

    if (isLegacy) {
        // Legacy skins only contain the right arm and leg. Match Minecraft's
        // modern layout by mirroring their complete 16x16 regions once.
        mirrorLegacyRegion(context, texture, textureScale, 40, 16, 32, 48)
        mirrorLegacyRegion(context, texture, textureScale, 0, 16, 16, 48)
    }

    return { texture, context, textureScale }
}

function detectSlim(context: CanvasRenderingContext2D, textureScale: number) {
    const x = Math.floor(55 * textureScale)
    const y = Math.floor(20 * textureScale)
    return context.getImageData(x, y, 1, 1).data[3] === 0
}

function drawFace(
    context: CanvasRenderingContext2D,
    texture: HTMLCanvasElement,
    textureScale: number,
    uv: FaceUV,
    x: number,
    y: number,
    width: number,
    height: number,
) {
    const sourceWidth = (uv.u2 - uv.u1) * textureScale
    const sourceHeight = (uv.v2 - uv.v1) * textureScale
    context.drawImage(
        texture,
        uv.u1 * textureScale,
        uv.v1 * textureScale,
        sourceWidth,
        sourceHeight,
        x,
        y,
        width,
        height,
    )
}

function drawBackFace(
    context: CanvasRenderingContext2D,
    texture: HTMLCanvasElement,
    textureScale: number,
    uv: FaceUV,
    x: number,
    y: number,
    width: number,
    height: number,
    depth: number,
    scale: number,
) {
    const scaledDepth = depth * scale * DEPTH_RATIO
    drawFace(
        context,
        texture,
        textureScale,
        uv,
        x + scaledDepth,
        y - 0.5 * scaledDepth,
        width * scale,
        height * scale,
    )
}

function drawRightFace(
    context: CanvasRenderingContext2D,
    texture: HTMLCanvasElement,
    textureScale: number,
    uv: FaceUV,
    x: number,
    y: number,
    height: number,
    depth: number,
    scale: number,
) {
    const scaledDepth = depth * scale * DEPTH_RATIO

    context.save()
    context.setTransform(1, -0.5, 0, 1, x, y)
    drawFace(context, texture, textureScale, uv, 0, 0, scaledDepth, height * scale)
    context.restore()
}

function drawBottomFace(
    context: CanvasRenderingContext2D,
    texture: HTMLCanvasElement,
    textureScale: number,
    uv: FaceUV,
    x: number,
    y: number,
    width: number,
    height: number,
    depth: number,
    scale: number,
) {
    const scaledDepth = depth * scale * DEPTH_RATIO

    context.save()
    context.setTransform(1, 0, -1, 0.5, x + scaledDepth, y + height * scale - 0.5 * scaledDepth)
    drawFace(context, texture, textureScale, uv, 0, 0, width * scale, scaledDepth)
    context.restore()
}

function drawSideFace(
    context: CanvasRenderingContext2D,
    texture: HTMLCanvasElement,
    textureScale: number,
    uv: FaceUV,
    x: number,
    y: number,
    width: number,
    height: number,
    depth: number,
    scale: number,
) {
    const scaledDepth = depth * scale * DEPTH_RATIO

    context.save()
    context.setTransform(1, -0.5, 0, 1, x + width * scale, y)
    drawFace(context, texture, textureScale, uv, 0, 0, scaledDepth, height * scale)
    context.restore()
}

function drawTopFace(
    context: CanvasRenderingContext2D,
    texture: HTMLCanvasElement,
    textureScale: number,
    uv: FaceUV,
    x: number,
    y: number,
    width: number,
    depth: number,
    scale: number,
) {
    const scaledDepth = depth * scale * DEPTH_RATIO

    context.save()
    context.setTransform(1, 0, -1, 0.5, x + scaledDepth, y - 0.5 * scaledDepth)
    drawFace(context, texture, textureScale, uv, 0, 0, width * scale, scaledDepth)
    context.restore()
}

function drawHiddenFaces(
    context: CanvasRenderingContext2D,
    texture: HTMLCanvasElement,
    textureScale: number,
    parts: PartDrawInfo[],
    scale: number,
    inflated: boolean,
) {
    for (const part of parts) {
        if (!part.outer) continue

        const inflation = inflated ? 1 : 0
        const offset = inflated ? scale * 0.5 : 0
        const x = part.x - offset
        const y = part.y - offset
        const width = part.width + inflation
        const height = part.height + inflation
        const depth = part.depth + inflation

        drawBackFace(context, texture, textureScale, part.outer.back, x, y, width, height, depth, scale)
        drawRightFace(context, texture, textureScale, part.outer.right, x, y, height, depth, scale)
        drawBottomFace(context, texture, textureScale, part.outer.bottom, x, y, width, height, depth, scale)
    }
}

function drawSideFaces(
    context: CanvasRenderingContext2D,
    texture: HTMLCanvasElement,
    textureScale: number,
    parts: PartDrawInfo[],
    scale: number,
    inflated: boolean,
) {
    for (const part of parts) {
        drawSideFace(
            context,
            texture,
            textureScale,
            part.inner.left,
            part.x,
            part.y,
            part.width,
            part.height,
            part.depth,
            scale,
        )

        if (!part.outer) continue
        const inflation = inflated ? 1 : 0
        const offset = inflated ? scale * 0.5 : 0
        drawSideFace(
            context,
            texture,
            textureScale,
            part.outer.left,
            part.x - offset,
            part.y - offset,
            part.width + inflation,
            part.height + inflation,
            part.depth + inflation,
            scale,
        )
    }
}

function drawTopFaces(
    context: CanvasRenderingContext2D,
    texture: HTMLCanvasElement,
    textureScale: number,
    parts: PartDrawInfo[],
    scale: number,
    inflated: boolean,
) {
    for (const part of parts) {
        drawTopFace(
            context,
            texture,
            textureScale,
            part.inner.top,
            part.x,
            part.y,
            part.width,
            part.depth,
            scale,
        )

        if (!part.outer) continue
        const inflation = inflated ? 1 : 0
        const offset = inflated ? scale * 0.5 : 0
        drawTopFace(
            context,
            texture,
            textureScale,
            part.outer.top,
            part.x - offset,
            part.y - offset,
            part.width + inflation,
            part.depth + inflation,
            scale,
        )
    }
}

function drawFrontFaces(
    context: CanvasRenderingContext2D,
    texture: HTMLCanvasElement,
    textureScale: number,
    parts: PartDrawInfo[],
    scale: number,
    outer: boolean,
    inflated: boolean,
) {
    for (const part of parts) {
        const face = outer ? part.outer?.front : part.inner.front
        if (!face) continue

        const shouldInflate = outer && inflated
        const inflation = shouldInflate ? 1 : 0
        const offset = shouldInflate ? scale * 0.5 : 0
        drawFace(
            context,
            texture,
            textureScale,
            face,
            part.x - offset,
            part.y - offset,
            (part.width + inflation) * scale,
            (part.height + inflation) * scale,
        )
    }
}

export function renderSkinIsometricFast(
    canvas: HTMLCanvasElement,
    source: SkinImageSource,
    options: Skin2DRenderOptions,
) {
    const { texture, context: textureContext, textureScale } = createTextureCanvas(source)
    const slim = detectSlim(textureContext, textureScale)
    const uv = getSkinUV(slim)
    const armWidth = slim ? 3 : 4
    const inflate = options.showOverlay && options.overlayInflated ? 1 : 0
    const paddingX = inflate * 0.5 * options.scale
    const headOffsetX = -HEAD_FORWARD * DEPTH_RATIO * options.scale
    const headOffsetY = HEAD_FORWARD * DEPTH_RATIO * 0.5 * options.scale
    const headRightEdge = armWidth + 8 + (8 - HEAD_FORWARD) * DEPTH_RATIO
    const leftArmRightEdge = 2 * armWidth + 8 + 4 * DEPTH_RATIO
    const canvasWidth = (Math.max(headRightEdge, leftArmRightEdge) + 2 * inflate) * options.scale
    const shearHeight = (8 - HEAD_FORWARD) * DEPTH_RATIO * 0.5 + inflate
    const canvasHeight = Math.ceil((32 + shearHeight + inflate * 0.5) * options.scale)

    canvas.width = Math.ceil(canvasWidth)
    canvas.height = canvasHeight
    const context = getPixelatedContext(canvas)
    context.clearRect(0, 0, canvas.width, canvas.height)

    const baseY = Math.ceil(shearHeight * options.scale)
    const bodyX = armWidth * options.scale + paddingX
    const outer = <T extends BoxUV>(value: T) => options.showOverlay ? value : null
    const leftArm: PartDrawInfo = {
        inner: uv.leftArm.inner,
        outer: outer(uv.leftArm.outer),
        x: bodyX + 8 * options.scale,
        y: baseY + 8 * options.scale,
        width: armWidth,
        height: 12,
        depth: 4,
    }
    const leftLeg: PartDrawInfo = {
        inner: uv.leftLeg.inner,
        outer: outer(uv.leftLeg.outer),
        x: bodyX + 4 * options.scale,
        y: baseY + 20 * options.scale,
        width: 4,
        height: 12,
        depth: 4,
    }
    const body: PartDrawInfo = {
        inner: uv.body.inner,
        outer: outer(uv.body.outer),
        x: bodyX,
        y: baseY + 8 * options.scale,
        width: 8,
        height: 12,
        depth: 4,
    }
    const rightLeg: PartDrawInfo = {
        inner: uv.rightLeg.inner,
        outer: outer(uv.rightLeg.outer),
        x: bodyX,
        y: baseY + 20 * options.scale,
        width: 4,
        height: 12,
        depth: 4,
    }
    const rightArm: PartDrawInfo = {
        inner: uv.rightArm.inner,
        outer: outer(uv.rightArm.outer),
        x: paddingX,
        y: baseY + 8 * options.scale,
        width: armWidth,
        height: 12,
        depth: 4,
    }
    const head: PartDrawInfo = {
        inner: uv.head.inner,
        outer: outer(uv.head.outer),
        x: bodyX + headOffsetX,
        y: baseY + headOffsetY,
        width: 8,
        height: 8,
        depth: 8,
    }
    const bodyParts = [leftArm, leftLeg, body, rightLeg, rightArm]
    const limbParts = [leftArm, leftLeg, rightLeg, rightArm]
    const inflated = options.overlayInflated

    drawHiddenFaces(context, texture, textureScale, bodyParts, options.scale, inflated)
    drawSideFaces(context, texture, textureScale, bodyParts, options.scale, inflated)
    drawTopFaces(context, texture, textureScale, bodyParts, options.scale, inflated)
    drawFrontFaces(context, texture, textureScale, bodyParts, options.scale, false, inflated)
    drawFrontFaces(context, texture, textureScale, limbParts, options.scale, true, inflated)
    drawFrontFaces(context, texture, textureScale, [body], options.scale, true, inflated)

    drawHiddenFaces(context, texture, textureScale, [head], options.scale, inflated)
    drawSideFaces(context, texture, textureScale, [head], options.scale, inflated)
    drawTopFaces(context, texture, textureScale, [head], options.scale, inflated)
    drawFrontFaces(context, texture, textureScale, [head], options.scale, false, inflated)
    drawFrontFaces(context, texture, textureScale, [head], options.scale, true, inflated)
}

export function renderSkinAvatarFast(
    canvas: HTMLCanvasElement,
    source: SkinImageSource,
    options: Skin2DRenderOptions,
) {
    const { texture, textureScale } = createTextureCanvas(source)
    const uv = getSkinUV(false).head
    const inflated = options.showOverlay && options.overlayInflated
    const padding = inflated ? options.scale * 0.5 : 0

    canvas.width = 8 * options.scale + 2 * padding
    canvas.height = 8 * options.scale + 2 * padding
    const context = getPixelatedContext(canvas)
    context.clearRect(0, 0, canvas.width, canvas.height)
    drawFace(
        context,
        texture,
        textureScale,
        uv.inner.front,
        padding,
        padding,
        8 * options.scale,
        8 * options.scale,
    )

    if (options.showOverlay) {
        const offset = inflated ? options.scale * 0.5 : 0
        const size = (8 + (inflated ? 1 : 0)) * options.scale
        drawFace(
            context,
            texture,
            textureScale,
            uv.outer.front,
            padding - offset,
            padding - offset,
            size,
            size,
        )
    }
}
