import { request } from './httpClient'
import type { SkinImageSource, Skin2DRenderOptions } from './skin2dRenderer'
import { AsyncResourceCache } from './asyncResourceCache'
import { getAuthSessionKey, subscribeAuthSession } from './authSession'

type Skin2DOptions = Partial<Skin2DRenderOptions>
const DEFAULT_OPTIONS: Skin2DRenderOptions = { scale: 8, showOverlay: true, overlayInflated: true }
const canvasBytes = (canvas: HTMLCanvasElement) => canvas.width * canvas.height * 4
const sourceCache = new AsyncResourceCache<HTMLCanvasElement>({
    maxEntries: 240, maxBytes: 8 * 1024 * 1024, ttlMs: 5 * 60_000, sizeOf: canvasBytes,
})
// All preview sizes and avatars share one budget, rather than 240 of each.
const previewCache = new AsyncResourceCache<HTMLCanvasElement>({
    maxEntries: 240, maxBytes: 16 * 1024 * 1024, ttlMs: 5 * 60_000, sizeOf: canvasBytes,
})
let rendererPromise: Promise<typeof import('./skin2dRenderer')> | null = null
let session: string | null = null
let sessionEpoch = 0
let subscribed = false
const sourceControllers = new Set<AbortController>()

function checkSession() {
    const next = getAuthSessionKey()
    if (session !== next) {
        session = next
        sessionEpoch++
        sourceCache.clear()
        previewCache.clear()
        sourceControllers.forEach(controller => controller.abort())
    }
    if (!subscribed) {
        subscribed = true
        subscribeAuthSession(checkSession)
    }
}

function getRenderer() {
    rendererPromise ??= import('./skin2dRenderer').catch(error => {
        rendererPromise = null
        throw error
    })
    return rendererPromise
}

async function loadDrawableFromBlob(blob: Blob): Promise<{ source: SkinImageSource; dispose: () => void }> {
    if ('createImageBitmap' in window) {
        try {
            const bitmap = await createImageBitmap(blob)
            return { source: bitmap, dispose: () => bitmap.close() }
        } catch (error) {
            console.warn('createImageBitmap failed for skin, falling back to Image:', error)
        }
    }
    const blobUrl = URL.createObjectURL(blob)
    try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image()
            img.onload = () => resolve(img)
            img.onerror = reject
            img.src = blobUrl
        })
        return { source: image, dispose: () => undefined }
    } finally { URL.revokeObjectURL(blobUrl) }
}

function getSource(imgSrc: string) {
    // Keep the complete URL: signatures and authorization must not be discarded.
    return sourceCache.getOrLoad(imgSrc, async () => {
        const controller = new AbortController()
        sourceControllers.add(controller)
        try {
            const response = await request(imgSrc, { signal: controller.signal })
            if (!response.ok) throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`)
            const decoded = await loadDrawableFromBlob(await response.blob())
            try {
                controller.signal.throwIfAborted()
                const canvas = document.createElement('canvas')
                canvas.width = decoded.source.width
                canvas.height = decoded.source.height
                const context = canvas.getContext('2d')
                if (!context) throw new Error('Failed to create skin source context')
                context.drawImage(decoded.source, 0, 0)
                return canvas
            } finally { decoded.dispose() }
        } finally { sourceControllers.delete(controller) }
    })
}

function renderPreview(imgSrc: string, options: Skin2DOptions, avatar: boolean) {
    checkSession()
    const normalized = { ...DEFAULT_OPTIONS, scale: avatar ? 10 : 8, ...options }
    if (!Number.isFinite(normalized.scale) || normalized.scale <= 0 || normalized.scale > 64) {
        return Promise.reject(new Error('Skin preview scale must be between 0 and 64'))
    }
    const key = JSON.stringify([imgSrc, avatar, normalized.scale, normalized.showOverlay, normalized.overlayInflated])
    const renderEpoch = sessionEpoch
    return previewCache.getOrLoad(key, async () => {
        if (renderEpoch !== sessionEpoch) throw new DOMException('Session changed', 'AbortError')
        // Decoder/network and the small renderer chunk start independently.
        const [source, renderer] = await Promise.all([getSource(imgSrc), getRenderer()])
        checkSession()
        if (renderEpoch !== sessionEpoch) throw new DOMException('Session changed', 'AbortError')
        const canvas = document.createElement('canvas')
        if (avatar) {
            renderer.renderSkinAvatarFast(canvas, source, normalized)
            return canvas
        }
        renderer.renderSkinIsometricFast(canvas, source, normalized)
        const size = Math.max(canvas.width, canvas.height)
        const square = document.createElement('canvas')
        square.width = square.height = size
        const context = square.getContext('2d')
        if (!context) throw new Error('Failed to create square canvas context')
        context.imageSmoothingEnabled = false
        context.drawImage(canvas, (size - canvas.width) / 2, (size - canvas.height) / 2)
        return square
    })
}

export function Skin2D(imgSrc: string, options: Skin2DOptions = {}): Promise<HTMLCanvasElement> {
    return renderPreview(imgSrc, options, false)
}

export function SkinAvatar(imgSrc: string, options: Skin2DOptions = {}): Promise<HTMLCanvasElement> {
    return renderPreview(imgSrc, options, true)
}

export const isSlim = (source: SkinImageSource) => {
    if (!source.width || !source.height) return false
    const canvas = document.createElement('canvas')
    canvas.width = source.width
    canvas.height = source.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Failed to create canvas context')
    context.drawImage(source, 0, 0)
    const x = Math.min(source.width - 1, Math.max(0, Math.floor(55 * source.width / 64)))
    const y = Math.min(source.height - 1, Math.max(0, Math.floor(20 * source.width / 64)))
    return context.getImageData(x, y, 1, 1).data[3] === 0
}
