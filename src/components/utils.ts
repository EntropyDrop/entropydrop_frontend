
type Skin2DOptions = {
    scale?: number
    showOverlay?: boolean
    overlayInflated?: boolean
}

const DEFAULT_SKIN_2D_OPTIONS = {
    scale: 8,
    showOverlay: true,
    overlayInflated: true,
} satisfies Required<Skin2DOptions>

const MAX_SKIN_2D_CACHE_SIZE = 240
const skin2DCache = new Map<string, Promise<HTMLCanvasElement>>()
let canvas2DRendererPromise: Promise<typeof import("@daidr/minecraft-skin-renderer/canvas2d")> | null = null

function getSkin2DCacheKey(imgSrc: string, options: Required<Skin2DOptions>) {
    return `${imgSrc}|s:${options.scale}|o:${Number(options.showOverlay)}|i:${Number(options.overlayInflated)}`
}

function rememberSkin2DRender(key: string, promise: Promise<HTMLCanvasElement>) {
    skin2DCache.set(key, promise)

    while (skin2DCache.size > MAX_SKIN_2D_CACHE_SIZE) {
        const oldestKey = skin2DCache.keys().next().value
        if (!oldestKey) break
        skin2DCache.delete(oldestKey)
    }
}

function getCanvas2DRenderer() {
    canvas2DRendererPromise ??= import("@daidr/minecraft-skin-renderer/canvas2d")
    return canvas2DRendererPromise
}

function getImageDataFromDrawable(source: CanvasImageSource & { width: number; height: number }) {
    const canvas = document.createElement('canvas')
    canvas.width = source.width
    canvas.height = source.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Failed to create canvas context')

    ctx.drawImage(source, 0, 0)
    return ctx.getImageData(0, 0, source.width, source.height)
}

function getSlimFromImageData(imageData: ImageData) {
    if (!imageData.width || !imageData.height) return false

    const scale = imageData.width / 64
    const x = Math.min(imageData.width - 1, Math.max(0, Math.floor(55 * scale)))
    const y = Math.min(imageData.height - 1, Math.max(0, Math.floor(20 * scale)))
    const alphaIndex = (y * imageData.width + x) * 4 + 3
    return imageData.data[alphaIndex] === 0
}

export const isSlim = (img: CanvasImageSource & { width: number; height: number }) => {
    return getSlimFromImageData(getImageDataFromDrawable(img))
}

async function loadImageDataFromBlob(blob: Blob) {
    if ('createImageBitmap' in window) {
        try {
            const bitmap = await createImageBitmap(blob)
            try {
                return getImageDataFromDrawable(bitmap)
            } finally {
                bitmap.close()
            }
        } catch (err) {
            console.warn('createImageBitmap failed for skin, falling back to Image:', err)
        }
    }

    const blobUrl = URL.createObjectURL(blob)
    try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image()
            img.crossOrigin = 'anonymous'
            img.onload = () => resolve(img)
            img.onerror = reject
            img.src = blobUrl
        })

        return getImageDataFromDrawable(image)
    } finally {
        URL.revokeObjectURL(blobUrl)
    }
}

async function renderSkin2D(imgSrc: string, options: Required<Skin2DOptions>) {
    const { renderSkinIsometric } = await getCanvas2DRenderer()

    // Fetch as a blob so presigned/private URLs and CDN URLs follow the same path.
    const response = await fetch(imgSrc)
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`)

    const imageData = await loadImageDataFromBlob(await response.blob())
    const canvas = document.createElement('canvas')

    await renderSkinIsometric(canvas, {
        skin: imageData,
        slim: getSlimFromImageData(imageData),
        scale: options.scale,
        showOverlay: options.showOverlay,
        overlayInflated: options.overlayInflated,
    })

    const size = Math.max(canvas.width, canvas.height)
    const squareCanvas = document.createElement('canvas')
    squareCanvas.width = size
    squareCanvas.height = size
    const ctx = squareCanvas.getContext('2d')
    if (!ctx) throw new Error('Failed to create square canvas context')

    const x = (size - canvas.width) / 2
    const y = (size - canvas.height) / 2
    ctx.drawImage(canvas, x, y)

    return squareCanvas
}

export async function Skin2D(imgSrc: string, options: Skin2DOptions = {}): Promise<HTMLCanvasElement> {
    const normalizedOptions = { ...DEFAULT_SKIN_2D_OPTIONS, ...options }
    const key = getSkin2DCacheKey(imgSrc, normalizedOptions)
    const cached = skin2DCache.get(key)
    if (cached) {
        skin2DCache.delete(key)
        skin2DCache.set(key, cached)
        return cached
    }

    const promise = renderSkin2D(imgSrc, normalizedOptions).catch(err => {
        if (skin2DCache.get(key) === promise) {
            skin2DCache.delete(key)
        }
        throw err
    })

    rememberSkin2DRender(key, promise)
    return promise
}

/**
 * In plane mode, the decorative layer (overlay) does not necessarily appear on another adjacent face.
 * To ensure the consistency of the overlay edges in voxel mode, some compensation is applied.
 * 1. If a decor pixel has 2 adjacent faces and one is missing, fill the missing one with the other's color.
 * 2. If a decor pixel is a corner (3 adjacent faces) and some are missing (1 or 2), fill them using the highest priority face (front -> back -> top -> bottom -> left -> right).
 * @param {HTMLCanvasElement} canvas The canvas containing the skin texture
 */
export function ensureSkinVoxelModeConsistency(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')!;
    const { width, height } = canvas;
    const imgData = ctx.getImageData(0, 0, width, height);
    const pixels = imgData.data;

    // Pre-process: make translucent pixels fully opaque
    for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] > 0 && pixels[i + 3] < 255) {
            pixels[i + 3] = 255;
        }
    }

    // --- Helper Utility Functions ---
    const getPixel = (x: number, y: number) => {
        const i = (y * width + x) * 4;
        return [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
    };

    const setPixel = (x: number, y: number, rgba: [number, number, number, number]) => {
        const i = (y * width + x) * 4;
        pixels[i] = rgba[0];
        pixels[i + 1] = rgba[1];
        pixels[i + 2] = rgba[2];
        pixels[i + 3] = rgba[3];
    };

    // Determine if it is a Slim (Alex) model
    const is_slim = getPixel(47, 52)[3] === 0;

    // --- Data structures strictly kept as-is ---
    const parts = [
        // head
        [[
            [[8, 8, 8], [8, 8]],
            [[8, 8, 8], [24, 8]],
            [[8, 8, 8], [16, 8]],
            [[8, 8, 8], [0, 8]],
            [[8, 8, 8], [8, 0]],
            [[8, 8, 8], [16, 0]],
        ], [32, 0]],
        // body
        [[
            [[8, 12, 4], [20, 20]],
            [[8, 12, 4], [32, 20]],
            [[4, 12, 8], [28, 20]],
            [[4, 12, 8], [16, 20]],
            [[8, 4, 12], [20, 16]],
            [[8, 4, 12], [28, 16]],
        ], [0, 16]],
        // left arm
        [[
            [[(is_slim ? 3 : 4), 12, 4], [36, 52]],
            [[is_slim ? 3 : 4, 12, 4], [(is_slim ? 43 : 44), 52]],
            [[4, 12, 4], [(is_slim ? 39 : 40), 52]],
            [[4, 12, 4], [32, 52]],
            [[(is_slim ? 3 : 4), 4, 12], [36, 48]],
            [[(is_slim ? 3 : 4), 4, 12], [(is_slim ? 39 : 40), 48]]], [16, 0]],
        // right arm
        [[
            [[(is_slim ? 3 : 4), 12, 4], [44, 20]],
            [[is_slim ? 3 : 4, 12, 4], [(is_slim ? 51 : 52), 20]],
            [[4, 12, 4], [(is_slim ? 47 : 48), 20]],
            [[4, 12, 4], [40, 20]],
            [[(is_slim ? 3 : 4), 4, 12], [44, 16]],
            [[(is_slim ? 3 : 4), 4, 12], [(is_slim ? 47 : 48), 16]],], [0, 16]],
        // left leg
        [[
            [[4, 12, 4], [20, 52]],
            [[4, 12, 4], [28, 52]],
            [[4, 12, 4], [24, 52]],
            [[4, 12, 4], [16, 52]],
            [[4, 4, 12], [20, 48]],
            [[4, 4, 12], [24, 48]],
        ], [-16, 0]],
        // right leg
        [[
            [[4, 12, 4], [4, 20]],
            [[4, 12, 4], [12, 20]],
            [[4, 12, 4], [8, 20]],
            [[4, 12, 4], [0, 20]],
            [[4, 4, 12], [4, 16]],
            [[4, 4, 12], [8, 16]],
        ], [0, 16]]
    ];

    parts.forEach((part, _part_idx) => {
        const decor_offset: [number, number] = (part as any)[1];
        const [x, y, z]: [number, number, number] = (part as any)[0][4][0]; // Get x, y, z from the first face

        const colors: { [key: string]: { rgba: number[], priority: number } } = {};
        const inverse: { [key: string]: number[][] } = {}; // Simulate inverse dictionary

        const getPriority = (faceIdx: number) => {
            switch (faceIdx) {
                case 0: return 0; // Front
                case 1: return 1; // Back
                case 4: return 2; // Top
                case 5: return 3; // Bottom
                case 2: return 4; // Left
                case 3: return 5; // Right
                default: return 99;
            }
        };

        part[0].forEach((face, idx) => {
            const size: [number, number, number] = (face as any)[0];
            const offset: [number, number] = (face as any)[1];
            if (!offset) { debugger }

            for (let dx = 0; dx < size[0]; dx++) {
                for (let dy = 0; dy < size[1]; dy++) {
                    const img_x = offset[0] + dx + decor_offset[0];
                    const img_y = offset[1] + dy + decor_offset[1];
                    const c = getPixel(img_x, img_y);

                    let new_x, new_y, new_z;
                    if (idx === 4) [new_x, new_y, new_z] = [dx, y - 1 - dy, z - 1];      // top
                    else if (idx === 5) [new_x, new_y, new_z] = [dx, y - 1 - dy, 0];      // bottom
                    else if (idx === 0) [new_x, new_y, new_z] = [dx, 0, z - 1 - dy];      // front
                    else if (idx === 1) [new_x, new_y, new_z] = [x - 1 - dx, y - 1, z - 1 - dy]; // back
                    else if (idx === 2) [new_x, new_y, new_z] = [x - 1, dx, z - 1 - dy];  // left
                    else if (idx === 3) [new_x, new_y, new_z] = [0, y - 1 - dx, z - 1 - dy]; // right

                    const posKey = `${new_x},${new_y},${new_z}`;

                    if (!inverse[posKey]) inverse[posKey] = [];
                    inverse[posKey].push([img_x, img_y]);

                    if (c[3] === 0) {
                        continue;
                    }

                    const prio = getPriority(idx);
                    if (!colors[posKey] || prio < colors[posKey].priority) {
                        colors[posKey] = { rgba: c, priority: prio };
                    }
                }
            }
        });

        // Apply colors back to the texture map
        for (let posKey in inverse) {
            const colorInfo = colors[posKey];
            if (!colorInfo) continue; // All missing, no color to fill

            inverse[posKey].forEach(coord => {
                const existingColor = getPixel(coord[0], coord[1]);
                if (existingColor[3] === 0) {
                    setPixel(coord[0], coord[1], colorInfo.rgba as any);
                }
            });
        }
    });

    ctx.putImageData(imgData, 0, 0);
}

export function convertSkinLayout(canvas: HTMLCanvasElement, target: 'steve' | 'alex') {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imageData = ctx.getImageData(0, 0, 64, 64);
    const newData = ctx.createImageData(64, 64);
    newData.data.set(imageData.data);

    const getP = (x: number, y: number) => {
        const i = (y * 64 + x) * 4;
        return [imageData.data[i], imageData.data[i + 1], imageData.data[i + 2], imageData.data[i + 3]];
    };
    const setP = (nx: number, ny: number, rgba: number[]) => {
        if (nx < 0 || nx >= 64 || ny < 0 || ny >= 64) return;
        const i = (ny * 64 + nx) * 4;
        newData.data[i] = rgba[0];
        newData.data[i + 1] = rgba[1];
        newData.data[i + 2] = rgba[2];
        newData.data[i + 3] = rgba[3];
    };

    const arms = [
        { loc: [40, 16], overlay: [0, 16] }, // Right Arm
        { loc: [32, 48], overlay: [16, 0] }  // Left Arm
    ];

    const A2S_Top = [-1, -1, -1, -1, 4, 5, 5, 6, 7, 8, 8, 9, -1, -1, -1, -1];
    const A2S_Side = [0, 1, 2, 3, 4, 5, 5, 6, 7, 8, 9, 10, 11, 12, 12, 13];
    const S2A_Top = [-1, -1, -1, -1, 4, 5, 7, 8, 9, 11, -2, -2, -2, -2, -2, -2];
    const S2A_Side = [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 15, -2, -2];

    const mapTop = target === 'steve' ? A2S_Top : S2A_Top;
    const mapSide = target === 'steve' ? A2S_Side : S2A_Side;

    for (const arm of arms) {
        for (const off of [[0, 0], arm.overlay]) {
            const ox = arm.loc[0] + off[0];
            const oy = arm.loc[1] + off[1];

            // Top/Bottom (dy = 0..3)
            for (let dy = 0; dy < 4; dy++) {
                for (let dx = 0; dx < 16; dx++) {
                    const src = mapTop[dx];
                    if (src === -2) setP(ox + dx, oy + dy, [0, 0, 0, 0]);
                    else if (src !== -1) setP(ox + dx, oy + dy, getP(ox + src, oy + dy));
                }
            }
            // Sides (dy = 4..15)
            for (let dy = 4; dy < 16; dy++) {
                for (let dx = 0; dx < 16; dx++) {
                    const src = mapSide[dx];
                    if (src === -2) setP(ox + dx, oy + dy, [0, 0, 0, 0]);
                    else if (src !== -1) setP(ox + dx, oy + dy, getP(ox + src, oy + dy));
                }
            }
        }
    }

    // Force metadata pixel at (55, 20) for layout detection
    const idx = (20 * 64 + 55) * 4;
    if (target === 'steve') {
        if (newData.data[idx + 3] === 0) {
            newData.data[idx] = newData.data[idx - 4];
            newData.data[idx + 1] = newData.data[idx - 3];
            newData.data[idx + 2] = newData.data[idx - 2];
            newData.data[idx + 3] = newData.data[idx - 1] || 255;
        }
    } else {
        newData.data[idx] = 0;
        newData.data[idx + 1] = 0;
        newData.data[idx + 2] = 0;
        newData.data[idx + 3] = 0;
    }

    ctx.putImageData(newData, 0, 0);
}
