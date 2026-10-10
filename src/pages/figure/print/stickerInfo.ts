import { STICKER_FONT_FAMILY } from '../../../lib/minefigure/web_sticker/src/sticker/mergedComposer.js'
import { FIGURE_MODELS } from './figureModels'

export interface StickerInfo {
    brand?: string
    modelName?: string
    name: string
    publisher: string
    publisherId: string
    sourceUrl: string
    sourceId: string
    labels: {
        publisher: string
        userId: string
        source: string
    }
}

export interface StickerInfoArea { x: number; y: number; width: number; height: number }

/** Canvas exports must wait for every subset used by names and source labels. */
export async function loadStickerFont(info?: StickerInfo) {
    if (typeof document === 'undefined' || !document.fonts) return
    const text = [
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ·…—:/#?=',
        ...(info ? [info.brand || '', info.modelName || '', info.name, info.publisher, info.publisherId, info.sourceUrl, info.sourceId, ...Object.values(info.labels)] : []),
    ].join(' ')
    await document.fonts.load(`36px ${STICKER_FONT_FAMILY}`, text)
}

function cleanText(value: string) {
    return value.replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim()
}

function fitText(ctx: CanvasRenderingContext2D, value: string, width: number) {
    const text = cleanText(value)
    if (ctx.measureText(text).width <= width) return text
    const characters = Array.from(text)
    while (characters.length && ctx.measureText(`${characters.join('')}…`).width > width) characters.pop()
    return `${characters.join('')}…`
}

/** Only marks the PNG's reserved whitespace; the cutting masks and scale stay intact. */
export function drawStickerInfo(canvas: HTMLCanvasElement, area: StickerInfoArea, info: StickerInfo) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Sticker annotation canvas is unavailable')
    const scale = canvas.width / 4200
    ctx.save()
    try {
        ctx.fillStyle = '#25364a'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        ctx.font = `${Math.max(12, Math.round(48 * scale / 12) * 12)}px ${STICKER_FONT_FAMILY}`
        ctx.fillText(fitText(ctx, `${info.brand || 'EntropyDrop'} · ${info.modelName || FIGURE_MODELS[0].name}`, canvas.width - 320 * scale), 160 * scale, 164 * scale)
        ctx.font = `${Math.max(12, Math.round(36 * scale / 12) * 12)}px ${STICKER_FONT_FAMILY}`
        ctx.fillText(fitText(ctx, info.name, canvas.width - 320 * scale), 160 * scale, 240 * scale)

        ctx.beginPath()
        ctx.rect(area.x, area.y, area.width, area.height)
        ctx.clip()
        const lines = [
            `${info.labels.publisher}: ${info.publisher}`,
            info.publisherId ? `${info.labels.userId}: ${info.publisherId}` : '',
            `${info.labels.source}: ${info.sourceId ? `#${info.sourceId}` : '—'}`,
            info.sourceUrl,
        ].filter(Boolean)
        const lineHeight = Math.min(60 * scale, Math.floor(area.height / lines.length))
        ctx.font = `${Math.max(12, Math.min(36 * scale, Math.floor((lineHeight - 12 * scale) / 12) * 12))}px ${STICKER_FONT_FAMILY}`
        lines.forEach((line, index) => ctx.fillText(fitText(ctx, line, area.width), area.x, area.y + index * lineHeight))
    } finally { ctx.restore() }
}
