export type OrigamiModelId = 'paper-std-10cm' | 'paper-cute-10cm'
export type OrigamiShape = 'standard' | 'cute'
export type OrigamiLayerMode = 'dual' | 'single'

export interface OrigamiModel {
    id: OrigamiModelId
    name: string
    shape: OrigamiShape
    heightCm: number
    /** Physical millimetres per head pixel unit (STD: 100/32 = 3.125; CUTE: 100/21.6 ≈ 4.6296). */
    mmPerPixel: number
    /** Depth of each glue tab in millimetres. */
    tabMm: number
    /** MCModal head outer-layer total inflation in pixel units (8 -> 9, i.e. +0.5/side). */
    headOverlayExtraPx: number
    /** MCModal body & limb outer-layer total inflation in pixel units (+0.25/side). */
    bodyOverlayExtraPx: number
    /** Max folded top/bottom glue-flap depth on 1-piece L-supports in DUAL mode (mm). */
    supportFootMm: number
}

export const DEFAULT_ORIGAMI_MODEL: OrigamiModelId = 'paper-std-10cm'
export const DEFAULT_ORIGAMI_LAYER: OrigamiLayerMode = 'dual'

export const ORIGAMI_LAYERS: readonly OrigamiLayerMode[] = ['dual', 'single'] as const

export const ORIGAMI_MODELS: readonly OrigamiModel[] = [
    {
        id: 'paper-std-10cm',
        name: 'PAPER-STD-10cm',
        shape: 'standard',
        heightCm: 10,
        mmPerPixel: 100 / 32, // 3.125 mm
        tabMm: 4.0,
        headOverlayExtraPx: 1.0,
        bodyOverlayExtraPx: 0.5,
        supportFootMm: 1.4,
    },
    {
        id: 'paper-cute-10cm',
        name: 'PAPER-CUTE-10cm',
        shape: 'cute',
        heightCm: 10,
        mmPerPixel: 100 / 21.6, // ~4.6296 mm (Head 8 + Torso 6.8 + Legs 6.8 = 21.6 units = 100 mm)
        tabMm: 4.0,
        headOverlayExtraPx: 1.0,
        bodyOverlayExtraPx: 0.5,
        supportFootMm: 1.5,
    },
]

export function getOrigamiModelProfile(id: OrigamiModelId = DEFAULT_ORIGAMI_MODEL): OrigamiModel {
    return ORIGAMI_MODELS.find(model => model.id === id) ?? ORIGAMI_MODELS[0]
}
