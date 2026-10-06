import { apiFetch } from './api'
import type { GenerationLogItemBrief } from '../types/log'

function normalizeDiscoveryItem(item: unknown): GenerationLogItemBrief | null {
    if (!item || typeof item !== 'object') return null

    const raw = item as Record<string, unknown>
    const id = typeof raw.id === 'string' ? raw.id.trim() : ''
    const result = typeof raw.result === 'string' ? raw.result.trim() : ''
    if (!id || !result) return null

    return {
        ...(raw as Partial<GenerationLogItemBrief>),
        id,
        result,
        prompt: typeof raw.prompt === 'string' ? raw.prompt : '',
        is_public: raw.is_public !== false,
    }
}

export async function fetchDiscoveryItems(signal: AbortSignal): Promise<GenerationLogItemBrief[]> {
    const response = await apiFetch('/api/discovery', { signal, skipGlobalError: true, auth: 'none' })
    if (!response.ok) throw new Error(`Discovery request failed (${response.status})`)

    const data: unknown = await response.json()
    if (!Array.isArray(data)) throw new Error('Invalid discovery response')
    const items = data.map(normalizeDiscoveryItem)
        .filter((item): item is GenerationLogItemBrief => item !== null)
    if (items.length !== data.length) {
        console.warn(`Discovery skipped ${data.length - items.length} invalid item(s)`)
    }
    return items
}
