import type { GenerationLogItem } from '../../../types/log'

export interface FigureSkinSource {
    id: string
    name: string
    publisher: string
    publisherId: string
    parentId: string
    publicLicense: string
    isPublic?: boolean
}

export function createFigureSource(item: GenerationLogItem): FigureSkinSource {
    return {
        id: item.id,
        name: item.name || '',
        publisher: item.creator?.username || '',
        publisherId: item.creator?.id ? String(item.creator.id) : '',
        parentId: item.parent || '',
        publicLicense: item.is_public && item.license?.public_license === 'cc-by-nc-4.0' ? 'CC BY-NC 4.0' : '',
        isPublic: item.is_public,
    }
}

export function readFigureSource(value: unknown): FigureSkinSource | null {
    if (!value || typeof value !== 'object') return null
    const data = value as Record<string, unknown>
    if (typeof data.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(data.id)) return null
    const text = (key: string) => typeof data[key] === 'string' ? data[key].trim().slice(0, 160) : ''
    return { id: data.id, name: text('name'), publisher: text('publisher'), publisherId: text('publisherId'), parentId: text('parentId'), publicLicense: text('publicLicense'),
        ...(typeof data.isPublic === 'boolean' ? { isPublic: data.isPublic } : {}) }
}

export function figureSourcePath(id: string) {
    return `/skin/?id=${encodeURIComponent(id)}`
}

export function figureSourceUrl(id: string) {
    return `https://entropydrop.com${figureSourcePath(id)}`
}
